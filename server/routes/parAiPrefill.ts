/**
 * VM1-13 + PAR-AI multi-party overhaul: PAR AI Prefill.
 *
 * POST /api/par/ai-prefill
 *   - Accepts multipart/form-data with field "file" (contract/invoice)
 *   - Runs the PAR-specific multi-party extractor (server/lib/ai/parExtractor.ts),
 *     then the deterministic choosePayee post-processor (server/lib/par/choosePayee.ts).
 *   - Reads the client's own org names (parSettings.orgLegalName + every par_payers entity)
 *     to EXCLUDE them from the payee candidates (the "Beneficiar = client who pays" trap).
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
import { parseAmountInWords } from "../lib/par/amountInWords";
import type { PayeeCandidate } from "../lib/par/parPartyTypes";
import { extractPayeeDoc } from "../lib/ai/payeeDocExtractor";
import type { PayeeDocKind } from "../lib/par/payeeDocStub";
import { extractPdfText } from "../lib/ai/pdfText";
import { extractOfficeText } from "../lib/ai/officeText";
import { db } from "../db/client";
import { parPayers, parSettings } from "../db/schema/par";

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

    const { rawText, imageDataUrl, fileDataUrl } = await readUploadedDoc(
      Buffer.from(await f.arrayBuffer()),
      fileName,
      mimeType,
    );

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

    // Identitatea proprie a clientului → exclude propriile organizații din candidații de beneficiar.
    // Un workspace poate avea mai multe entități plătitoare (par_payers), iar un document emis
    // între două dintre ele nu are beneficiar extern: le luăm pe TOATE, nu doar denumirea din
    // setări (care e una singură pe tenant).
    const ownOrgNames: string[] = [];
    try {
      const [settings] = await db
        .select({ orgLegalName: parSettings.orgLegalName })
        .from(parSettings)
        .where(eq(parSettings.tenantId, user.tenantId));
      if (settings?.orgLegalName) ownOrgNames.push(settings.orgLegalName);
    } catch {
      // Setările lipsesc (tenant nou) — plătitorii de mai jos rămân sursa de adevăr.
    }
    try {
      const payerRows = await db
        .select({ name: parPayers.name, legalName: parPayers.legalName })
        .from(parPayers)
        .where(eq(parPayers.tenantId, user.tenantId));
      for (const row of payerRows) {
        if (row.legalName) ownOrgNames.push(row.legalName);
        if (row.name) ownOrgNames.push(row.name);
      }
    } catch {
      // Tabela lipsește pe un deploy în urmă — nu blocăm completarea.
    }

    // Deterministic payee selection + requisite validation/routing.
    const choice = choosePayee(extraction, ownOrgNames.length ? ownOrgNames : null);

    // Suma ÎN LITERE bate cifra citită din tabel. Într-un PDF ordinea rândurilor se amestecă:
    // pe contul de plată al owner-ului „23042" a ajuns pe alt rând decât „TOTAL", modelul a citit
    // 23 442 lei, iar parserul determinist n-a găsit nicio sumă. Litera e sursa legală de adevăr,
    // deci o folosim când o putem citi și valuta se potrivește — marcând câmpul „de verificat"
    // când corectează o cifră deja extrasă.
    const words = parseAmountInWords(rawText);
    let amountCents = choice.amountCents;
    let amountConfidence = extraction.amountConfidence;
    let amountLowConf: boolean | undefined;
    if (words && (words.currency ?? "MDL") === choice.currency) {
      if (amountCents == null) {
        amountCents = words.cents;
        amountConfidence = Math.max(amountConfidence, 0.9);
      } else if (amountCents !== words.cents) {
        amountCents = words.cents;
        amountConfidence = Math.min(amountConfidence, 0.6);
        amountLowConf = true;
      }
    }

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
      totalCents: field(amountCents, amountConfidence, amountLowConf),
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

// ─── citirea fișierului încărcat ──────────────────────────────────────────────

/**
 * Scoate din fișier ce poate citi modelul — ORICE format în care omul are actul.
 *   imagine      → trimisă modelului ca imagine (vision)
 *   PDF          → stratul de text; un PDF SCANAT nu are, deci se trimite PDF-ul însuși
 *   docx / xlsx  → extragere reală de text (sunt ZIP-uri: toString("utf8") dădea gunoi)
 *   csv / txt    → text simplu
 * Un fișier pe care nu-l putem citi ca text tot ajunge la model ca atașament, în loc să eșueze
 * — asta înseamnă „orice tip de act" în practică.
 */
async function readUploadedDoc(
  buf: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ rawText: string; imageDataUrl?: string; fileDataUrl?: string }> {
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
        fileDataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
      }
    } else {
      rawText = await extractOfficeText(buf, fileName, mimeType);
    }
  } catch {
    rawText = "";
  }
  return { rawText, imageDataUrl, fileDataUrl };
}

// ─── POST /api/par/ai-prefill/payee-doc ───────────────────────────────────────

/** Câmpurile beneficiarului citite dintr-un act personal (buletin / rechizite / patentă). */
export interface ParPayeeDocResult {
  kind: PayeeDocKind;
  name: string | null;
  idnp: string | null;
  address: string | null;
  iban: string | null;
  bank: string | null;
  bic: string | null;
  patentSeries: string | null;
  /** ISO "YYYY-MM-DD". */
  patentValidUntil: string | null;
  payeeType: "fizic" | "juridic" | null;
  /** Câmpurile chiar completate — interfața spune omului CE a luat din act. */
  filled: string[];
  isStub: boolean;
  aiUnavailable?: "no_key" | "feature_disabled" | "budget_exceeded" | "api_error";
}

/**
 * Actul personal al beneficiarului, separat de actul comercial.
 *
 * Un buletin nu are furnizor și client, iar un certificat de rechizite nu are sumă — trecute
 * prin extractorul de facturi ieșeau aproape goale. Aici fiecare tip de act e cerut explicit
 * (butonul apăsat de om devine `kind`), iar răspunsul completează DOAR blocul beneficiarului.
 */
parAiPrefillRoutes.post(
  "/payee-doc",
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
    const kindRaw = formData.get("kind");
    const kindHint: PayeeDocKind | "auto" =
      kindRaw === "buletin" || kindRaw === "rechizite" || kindRaw === "patenta" ? kindRaw : "auto";

    const f = file as File;
    if (f.size > 8_000_000) return c.json({ error: "Fișierul este prea mare (max 8 MB)." }, 413);

    const fileName = f.name ?? "";
    const mimeType = f.type || "application/octet-stream";
    const { rawText, imageDataUrl, fileDataUrl } = await readUploadedDoc(
      Buffer.from(await f.arrayBuffer()),
      fileName,
      mimeType,
    );

    const extraction = await extractPayeeDoc(rawText, {
      kindHint,
      imageDataUrl,
      fileDataUrl,
      fileName: fileName || "document.pdf",
      tenantId: user.tenantId,
      userId: user.id,
      // entity_id din ai_audit_log e o coloană uuid — un id „inventat" ca text ar da 500 la scriere.
      prefillId: randomUUID(),
    });

    const filled = (
      [
        ["name", extraction.name],
        ["idnp", extraction.idnp],
        ["address", extraction.address],
        ["iban", extraction.iban],
        ["bank", extraction.bank],
        ["bic", extraction.bic],
        ["patentSeries", extraction.patentSeries],
        ["patentValidUntil", extraction.patentValidUntil],
      ] as const
    )
      .filter(([, v]) => !!v)
      .map(([k]) => k);

    const result: ParPayeeDocResult = {
      kind: extraction.kind,
      name: extraction.name,
      idnp: extraction.idnp,
      address: extraction.address,
      iban: extraction.iban,
      bank: extraction.bank,
      bic: extraction.bic,
      patentSeries: extraction.patentSeries,
      patentValidUntil: extraction.patentValidUntil,
      payeeType: extraction.payeeType,
      filled,
      isStub: extraction.isStub,
      ...(extraction.unavailable ? { aiUnavailable: extraction.unavailable } : {}),
    };
    return c.json(result);
  },
);
