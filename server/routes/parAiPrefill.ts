/**
 * VM1-13 + PAR-AI multi-party overhaul: PAR AI Prefill.
 *
 * POST /api/par/ai-prefill
 *   - Accepts multipart/form-data with field "file" (contract/invoice)
 *   - Runs the PAR-specific multi-party extractor (server/lib/ai/parExtractor.ts),
 *     then the deterministic choosePayee post-processor (server/lib/par/choosePayee.ts).
 *   - Reads parSettings.orgLegalName (tenant-scoped) to EXCLUDE the creator's own org
 *     from the payee candidates (the "Beneficiar = client who pays" trap).
 *   - Returns the resolved payee* fields, or needsClarification + candidates when ambiguous.
 *   - Works in mock mode (no API key): the stub regex parser reproduces the scenarios.
 *
 * mount-exempt: not stand-alone — mounted in app.ts as /api/par/ai-prefill
 */
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { extractParParties } from "../lib/ai/parExtractor";
import { choosePayee } from "../lib/par/choosePayee";
import { extractPdfText } from "../lib/ai/pdfText";
import { db } from "../db/client";
import { parSettings } from "../db/schema/par";

export const parAiPrefillRoutes = new Hono<{ Variables: AuthVariables }>();
parAiPrefillRoutes.use("*", requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParPrefillField {
  value: string | number | null;
  confidence: number;
  /** true if confidence < 0.7 — caller should mark the field "de verificat" */
  low_confidence?: boolean;
}

/** A payee candidate offered to the user when the document is ambiguous. */
export interface ParPrefillCandidate {
  name: string;
  idno: string | null;
  iban: string | null;
  ibanForeign?: boolean;
  bank: string | null;
  payeeType: "fizic" | "juridic" | null;
}

export interface ParPrefillResult {
  /** payee display name (the resolved payee, by ROLE + self-exclusion) */
  payeeName: ParPrefillField;
  /** payee fiscal id (IDNO/IDNP) — pre-routed on the server */
  payeeIdno: ParPrefillField;
  /** IBAN — only filled when valid (MD mod-97) or valid foreign (flagged) */
  payeeIban: ParPrefillField;
  /** bank name */
  payeeBank: ParPrefillField;
  /** persoană fizică vs juridică (auto-detected; UI can override) */
  payeeType: { value: "fizic" | "juridic" | null; confidence: number };
  /** payment total (cents) */
  totalCents: ParPrefillField;
  /** currency — MDL/EUR/USD */
  currency: ParPrefillField;
  /** end-use/purpose description (= scope) */
  endUse: ParPrefillField;
  /** The document class — 'not_invoice' triggers a non-blocking warning */
  documentClass: {
    value: string | null;
    confidence: number;
    reason?: string;
    not_financial?: boolean;
  };
  /** true when 2+ equally-plausible payees → UI must ask the user */
  needsClarification: boolean;
  /** the candidate payees to choose from (empty when resolved) */
  candidates: ParPrefillCandidate[];
  /** the full party list the extractor found (debug / advanced UI) */
  parties: Array<{ name: string; role: string; idno: string | null; iban: string | null }>;
  /** true if the extraction used the mock stub (no API key) */
  isStub: boolean;
}

// ─── helper ───────────────────────────────────────────────────────────────────

function field(
  value: string | number | null,
  confidence: number,
  low?: boolean,
): ParPrefillField {
  return {
    value,
    confidence,
    low_confidence: low ?? confidence < 0.7,
  };
}

// ─── POST /api/par/ai-prefill ─────────────────────────────────────────────────

parAiPrefillRoutes.post(
  "/",
  requirePARRole("requestor", "approver", "finance", "par_admin"),
  async (c) => {
    const user = c.get("user");

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Cererea trebuie să fie multipart/form-data cu câmpul 'file'." }, 400);
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return c.json({ error: "Câmpul 'file' lipsește sau nu este un fișier." }, 400);
    }

    const f = file as File;
    const fileName = f.name ?? "";
    const mimeType = f.type || "application/octet-stream";
    const sizeBytes = f.size;

    if (sizeBytes > 8_000_000) {
      return c.json({ error: "Fișierul este prea mare (max 8 MB)." }, 413);
    }

    const buf = Buffer.from(await f.arrayBuffer());

    // Extract text from file
    let rawText = "";
    let imageDataUrl: string | undefined;
    const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);

    try {
      if (mimeType.startsWith("image/")) {
        imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
      } else if (isPdf) {
        rawText = await extractPdfText(buf);
      } else {
        rawText = buf.toString("utf8");
      }
    } catch {
      rawText = "";
    }

    // Audit/AI-usage log references this via a `uuid` entity_id column, so it MUST be a real UUID.
    const prefillId = randomUUID();

    // Multi-party extraction (LLM or stub regex parser).
    const extraction = await extractParParties(rawText, {
      imageDataUrl,
      tenantId: user.tenantId,
      userId: user.id,
      prefillId,
    });

    // Tenant org identity → excludes the creator's own org from payee candidates.
    let orgLegalName: string | null = null;
    try {
      const [settings] = await db
        .select({ orgLegalName: parSettings.orgLegalName })
        .from(parSettings)
        .where(eq(parSettings.tenantId, user.tenantId));
      orgLegalName = settings?.orgLegalName ?? null;
    } catch {
      orgLegalName = null;
    }

    // Deterministic payee selection + requisite validation/routing.
    const choice = choosePayee(extraction, orgLegalName);

    const payee = choice.payee;
    const result: ParPrefillResult = {
      payeeName: field(payee?.name ?? "", payee ? 0.9 : 0, choice.lowConfidence.name),
      payeeIdno: field(payee?.idno ?? "", payee?.idno ? 0.85 : 0, choice.lowConfidence.idno),
      payeeIban: field(payee?.iban ?? "", payee?.iban ? 0.85 : 0, choice.lowConfidence.iban),
      payeeBank: field(payee?.bank ?? "", payee?.bank ? 0.8 : 0, choice.lowConfidence.bank),
      payeeType: {
        value: payee?.payeeType ?? null,
        confidence: payee?.payeeType ? 0.8 : 0,
      },
      totalCents: field(choice.amountCents, extraction.amountConfidence),
      currency: field(choice.currency, 0.9),
      endUse: field(choice.scope ?? "", choice.scope ? 0.6 : 0),
      documentClass: {
        value: extraction.documentClass,
        confidence: extraction.documentClass ? 0.8 : 0,
        ...(extraction.documentClassReason ? { reason: extraction.documentClassReason } : {}),
        not_financial: extraction.documentClass === "not_invoice",
      },
      needsClarification: choice.needsClarification,
      candidates: choice.candidates.map((cand) => ({
        name: cand.name,
        idno: cand.idno,
        iban: cand.iban,
        ...(cand.ibanForeign ? { ibanForeign: true } : {}),
        bank: cand.bank,
        payeeType: cand.payeeType,
      })),
      parties: extraction.parties.map((p) => ({
        name: p.name,
        role: p.role,
        idno: p.idno ?? null,
        iban: p.iban ?? null,
      })),
      isStub: extraction.isStub,
    };

    return c.json(result);
  },
);
