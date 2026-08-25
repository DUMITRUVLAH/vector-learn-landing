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
import type { PayeeCandidate } from "../lib/par/parPartyTypes";
import { extractPdfText } from "../lib/ai/pdfText";
import { extractOfficeText } from "../lib/ai/officeText";
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
  /** All valid accounts of this party — present only when the document listed 2+. */
  ibans?: string[];
  ibanForeign?: boolean;
  bank: string | null;
  bic?: string | null;
  legalAddress?: string | null;
  administratorName?: string | null;
  payeeType: "fizic" | "juridic" | null;
}

/** A candidate plus the context the UI needs to render the "cine primește plata?" groups. */
export interface ParPrefillPartyOption extends ParPrefillCandidate {
  /** extractor role: executor | provider | client | bank | unknown */
  role: string;
  /** true for the option the server auto-filled */
  recommended: boolean;
  /** true when this party is the PAYER (shown, but never auto-filled) */
  isPayer: boolean;
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
  payeeBic: ParPrefillField;
  payeeLegalAddress: ParPrefillField;
  payeeAdministrator: ParPrefillField;
  /** persoană fizică vs juridică (auto-detected; UI can override) */
  payeeType: { value: "fizic" | "juridic" | null; confidence: number };
  /** payment total (cents) */
  totalCents: ParPrefillField;
  /** currency — MDL/EUR/USD */
  currency: ParPrefillField;
  /** end-use/purpose description (= scope) */
  endUse: ParPrefillField;
  /**
   * The document type, INFORMATIONAL only ("invoice" / "receipt" / "not_invoice").
   * It no longer gates anything: requisites are extracted from any act (contract, act de
   * primire-predare, proces-verbal…), because a PAR is routinely raised against those.
   */
  documentClass: {
    value: string | null;
    confidence: number;
    reason?: string;
  };
  /** true when 2+ equally-plausible payees → UI must ask the user */
  needsClarification: boolean;
  /** the candidate payees to choose from (empty when resolved) */
  candidates: ParPrefillCandidate[];
  /**
   * EVERY party found in the document, grouped with its own requisites and ranked, with
   * `recommended` on the auto-filled one. The UI lists these whenever there are 2+, so the
   * user can switch beneficiary/prestator without re-uploading.
   */
  partyOptions: ParPrefillPartyOption[];
  /** Set when the model was not reached — the UI says why instead of showing "(demo)". */
  aiUnavailable?: "no_key" | "feature_disabled" | "budget_exceeded" | "api_error";
  /** the full party list the extractor found (debug / advanced UI) */
  parties: Array<{ name: string; role: string; idno: string | null; iban: string | null }>;
  /** line items / services to pre-fill the "Articole" section (unit price in cents) */
  lineItems: Array<{ description: string; quantity: number; unit: string | null; unitPriceCents: number }>;
  /** true if the extraction used the mock stub (no API key) */
  isStub: boolean;
}

/**
 * Below this many characters a PDF's text layer is treated as absent (a scan often yields a few
 * stray glyphs from a watermark or page number, not content).
 */
const MIN_USABLE_TEXT_CHARS = 200;

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

/** Map a choosePayee candidate/option to the wire shape (one place, two call sites). */
function toPrefillCandidate(cand: PayeeCandidate): ParPrefillCandidate {
  return {
    name: cand.name,
    idno: cand.idno,
    iban: cand.iban,
    ...(cand.ibans && cand.ibans.length > 1 ? { ibans: cand.ibans } : {}),
    ...(cand.ibanForeign ? { ibanForeign: true } : {}),
    bank: cand.bank,
    bic: cand.bic ?? null,
    legalAddress: cand.legalAddress ?? null,
    administratorName: cand.administratorName ?? null,
    payeeType: cand.payeeType,
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

    // Extract text from the file — ANY format the user might have of an act.
    //   image        → sent to the model as an image (vision)
    //   PDF          → text layer; a SCANNED pdf has none, so the PDF itself is sent to the model
    //   docx / xlsx  → real text extraction (these are ZIPs: toString("utf8") produced garbage)
    //   csv / txt    → plain text
    // A file we cannot read as text is still forwarded to the model as an attachment rather than
    // failing — that is what "orice tip de act" means in practice.
    let rawText = "";
    let imageDataUrl: string | undefined;
    let fileDataUrl: string | undefined;
    const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);

    try {
      if (mimeType.startsWith("image/")) {
        imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
      } else if (isPdf) {
        rawText = await extractPdfText(buf);
        if (rawText.trim().length < MIN_USABLE_TEXT_CHARS) {
          // Scanned / photographed act: no text layer. The provider renders the pages itself.
          fileDataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
        }
      } else {
        rawText = await extractOfficeText(buf, fileName, mimeType);
      }
    } catch {
      rawText = "";
    }

    // Audit/AI-usage log references this via a `uuid` entity_id column, so it MUST be a real UUID.
    const prefillId = randomUUID();

    // Multi-party extraction (LLM or stub regex parser).
    const extraction = await extractParParties(rawText, {
      imageDataUrl,
      fileDataUrl,
      fileName: fileName || "document.pdf",
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
    // Honest confidence: the regex stub has no contextual understanding, so its output is
    // capped below the 0.7 low-confidence threshold — EVERY stub-filled field renders
    // "⚠ de verificat" (matching the banner's "verifică fiecare câmp"), instead of the
    // stub's guesses shipping with LLM-grade trust. An explicit lowConfidence flag from
    // choosePayee (validation/purity repair) always forces the warning on either path.
    const conf = (v: number) => (extraction.isStub ? Math.min(v, 0.6) : v);
    const lowFlag = (f?: boolean) => (extraction.isStub ? f || undefined : f);
    const result: ParPrefillResult = {
      payeeName: field(payee?.name ?? "", conf(payee ? 0.9 : 0), lowFlag(choice.lowConfidence.name)),
      payeeIdno: field(payee?.idno ?? "", conf(payee?.idno ? 0.85 : 0), lowFlag(choice.lowConfidence.idno)),
      payeeIban: field(payee?.iban ?? "", conf(payee?.iban ? 0.85 : 0), lowFlag(choice.lowConfidence.iban)),
      payeeBank: field(payee?.bank ?? "", conf(payee?.bank ? 0.8 : 0), lowFlag(choice.lowConfidence.bank)),
      payeeBic: field(payee?.bic ?? "", conf(payee?.bic ? 0.8 : 0), lowFlag(choice.lowConfidence.bic)),
      payeeLegalAddress: field(
        payee?.legalAddress ?? "",
        conf(payee?.legalAddress ? 0.75 : 0),
        lowFlag(choice.lowConfidence.legalAddress),
      ),
      payeeAdministrator: field(payee?.administratorName ?? "", conf(payee?.administratorName ? 0.75 : 0)),
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
      },
      needsClarification: choice.needsClarification,
      candidates: choice.candidates.map(toPrefillCandidate),
      partyOptions: choice.options.map((opt) => ({
        ...toPrefillCandidate(opt),
        role: opt.role,
        recommended: opt.recommended,
        isPayer: opt.isPayer,
      })),
      ...(extraction.unavailable ? { aiUnavailable: extraction.unavailable } : {}),
      parties: extraction.parties.map((p) => ({
        name: p.name,
        role: p.role,
        idno: p.idno ?? null,
        iban: p.iban ?? null,
      })),
      lineItems: (extraction.lineItems ?? []).map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPriceCents: it.unitPriceCents,
      })),
      isStub: extraction.isStub,
    };

    return c.json(result);
  },
);
