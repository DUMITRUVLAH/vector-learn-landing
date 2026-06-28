/**
 * VM1-13: PAR AI Prefill — extracts payee/amount/IBAN/purpose from a document.
 *
 * POST /api/par/ai-prefill
 *   - Accepts multipart/form-data with field "file" (contract/invoice)
 *   - REUSES server/lib/ai/captureExtractor.ts (no new AI engine)
 *   - Maps: vendor_name → payeeName, amount_cents → total+currency, iban → payeeIban, purpose → endUse
 *   - Returns extracted fields with per-field confidence flags
 *   - Works in mock mode (no API key needed)
 *   - PAR lines NOT generated here (out of scope — phase 2)
 *
 * mount-exempt: not stand-alone — mounted in app.ts as /api/par/ai-prefill
 */
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { extractCaptureFields } from "../lib/ai/captureExtractor";
import { extractPdfText } from "../lib/ai/pdfText";
import { isPayeeBank, extractBeneficiaryFromVendorName } from "../lib/par/payeeBankClassifier";

export const parAiPrefillRoutes = new Hono<{ Variables: AuthVariables }>();
parAiPrefillRoutes.use("*", requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParPrefillField {
  value: string | number | null;
  confidence: number;
  /** true if confidence < 0.7 — caller should mark the field "de verificat" */
  low_confidence?: boolean;
}

export interface ParPrefillResult {
  /** payee display name — maps from beneficiary_name (preferred) or vendor_name (non-bank) */
  payeeName: ParPrefillField;
  /** payment total — maps from amount_cents (already in cents) */
  totalCents: ParPrefillField;
  /** currency — inferred from context; defaults to "MDL" */
  currency: ParPrefillField;
  /** IBAN — maps from iban */
  payeeIban: ParPrefillField;
  /** end-use/purpose description — maps from purpose */
  endUse: ParPrefillField;
  /**
   * Feature 3: bank name — maps from bank_name (explicit) or vendor_name when vendor IS a bank.
   * null if no bank detected. Caller maps this to the "Bancă" field.
   */
  payeeBank: ParPrefillField;
  /** The document class the AI determined — 'not_invoice' triggers a non-blocking warning */
  documentClass: {
    value: string | null;
    confidence: number;
    reason?: string;
    /** true if the doc doesn't appear to be a financial document */
    not_financial?: boolean;
  };
  /** true if the extraction used the mock stub (no API key) */
  isStub: boolean;
}

// ─── POST /api/par/ai-prefill ─────────────────────────────────────────────────

/**
 * Upload a document (invoice/contract) and get AI-extracted PAR fields.
 * Requires any PAR role (requestors can use this).
 */
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

    // Audit/AI-usage log references this via a `uuid` entity_id column, so it MUST be a real UUID —
    // a string like `par-prefill-<ts>` triggers Postgres "invalid input syntax for type uuid" and
    // breaks the whole prefill. The prefill isn't tied to a saved PAR yet, so a random UUID is fine.
    const prefillId = randomUUID();

    // Feature 3 (PAR-F3): PAR-specific addendum instructs the AI to separate BENEFICIARY from BANK.
    // For a payment doc, the bank ("BC Moldindconbank") routes to payeeBank, not to the payee name.
    const PAR_ADDENDUM = `
INSTRUCȚIUNI SUPLIMENTARE PENTRU CERERI DE PLATĂ (PAR):
11. beneficiary_name: numele BENEFICIARULUI real al plății (persoana/compania căreia i se plătește),
    NU banca. Dacă documentul conține o bancă și un beneficiar, extrage separat.
    Format: la fel ca vendor_name.
12. bank_name: numele BĂNCII beneficiarului (ex. "BC Moldindconbank S.A.", "Maib", "Victoriabank").
    Dacă nu există bancă explicită pe document, value: null.

Adaugă în JSON aceste două câmpuri (dacă nu le poți determina → value: null, confidence: 0):
  "beneficiary_name": { "value": "...", "confidence": 0.0 },
  "bank_name": { "value": "...", "confidence": 0.0 }
`;

    const extraction = await extractCaptureFields(
      rawText,
      user.tenantId,
      user.id,
      prefillId,
      imageDataUrl,
      PAR_ADDENDUM,
    );

    const { extractedFields, isStub } = extraction;

    // ─── Map extracted fields to PAR fields ───────────────────────────────────

    // Feature 3: Determine payeeName and payeeBank with bank/beneficiary disambiguation.
    //
    // Priority:
    //  1. If AI returned beneficiary_name (explicit) → use it as payeeName
    //  2. Else if vendor_name is a bank → vendor_name becomes payeeBank, payeeName = null (low_confidence)
    //  3. Else → vendor_name is payeeName (standard path)
    //
    // payeeBank:
    //  1. If AI returned bank_name → use it
    //  2. Else if vendor_name is a bank → use vendor_name as bank
    //  3. Else → null

    const vendorField = extractedFields.vendor_name;
    const vendorValue = (vendorField?.value as string | null) ?? null;
    const beneficiaryField = extractedFields.beneficiary_name;
    const beneficiaryValue = (beneficiaryField?.value as string | null) ?? null;
    const bankField = extractedFields.bank_name;
    const bankValue = (bankField?.value as string | null) ?? null;

    // Check whether the extracted vendor_name looks like a bank (BC…, Banca…, etc.)
    const vendorIsBank = vendorValue ? isPayeeBank(vendorValue) : false;

    let payeeName: ParPrefillField;
    if (beneficiaryValue) {
      // AI explicitly extracted the beneficiary — most reliable
      payeeName = {
        value: beneficiaryValue,
        confidence: beneficiaryField?.confidence ?? 0.8,
        ...(beneficiaryField?.low_confidence ? { low_confidence: true } : {}),
      };
    } else if (vendorIsBank) {
      // vendor_name turned out to be the bank — payee is unknown, mark low confidence
      payeeName = {
        value: null,
        confidence: 0.3,
        low_confidence: true,
      };
    } else {
      // Standard: vendor_name IS the payee
      payeeName = {
        value: vendorValue,
        confidence: vendorField?.confidence ?? 0,
        ...(vendorField?.low_confidence ? { low_confidence: true } : {}),
      };
    }

    // payeeBank: prefer explicit bank_name, else use vendor_name when it's a bank
    const payeeBankValue = bankValue ?? (vendorIsBank ? vendorValue : null);
    const payeeBankConf = payeeBankValue
      ? (bankField?.confidence ?? (vendorIsBank ? (vendorField?.confidence ?? 0) : 0))
      : 0;
    const payeeBank: ParPrefillField = {
      value: payeeBankValue,
      confidence: payeeBankConf,
      ...(payeeBankValue ? {} : { low_confidence: true }),
    };

    // totalCents ← amount_cents (already in cents from captureExtractor)
    const amountField = extractedFields.amount_cents;
    const totalCents: ParPrefillField = {
      value: (amountField?.value as number | null) ?? null,
      confidence: amountField?.confidence ?? 0,
      ...(amountField?.low_confidence ? { low_confidence: true } : {}),
    };

    // currency — captureExtractor doesn't extract currency, default to MDL
    // If the amount field had a high confidence from a foreign-currency doc, we can't detect currency
    // without additional prompt engineering — kept as MDL per current scope.
    const currency: ParPrefillField = {
      value: "MDL",
      confidence: 0.8,
    };

    // payeeIban ← iban
    const ibanField = extractedFields.iban;
    const payeeIban: ParPrefillField = {
      value: (ibanField?.value as string | null) ?? null,
      confidence: ibanField?.confidence ?? 0,
      ...(ibanField?.low_confidence ? { low_confidence: true } : {}),
    };

    // endUse ← purpose
    const purposeField = extractedFields.purpose;
    const endUse: ParPrefillField = {
      value: (purposeField?.value as string | null) ?? null,
      confidence: purposeField?.confidence ?? 0,
      ...(purposeField?.low_confidence ? { low_confidence: true } : {}),
    };

    // documentClass — guard: if not_invoice, include non-blocking warning
    const dcField = extractedFields.document_class;
    const dcValue = (dcField?.value as string | null) ?? null;
    const documentClass = {
      value: dcValue,
      confidence: dcField?.confidence ?? 0,
      ...(dcField?.low_confidence ? { low_confidence: true } : {}),
      ...(typeof (dcField as { reason?: unknown })?.reason === "string"
        ? { reason: (dcField as { reason: string }).reason }
        : {}),
      not_financial: dcValue === "not_invoice",
    };

    const result: ParPrefillResult = {
      payeeName,
      totalCents,
      currency,
      payeeIban,
      endUse,
      payeeBank,
      documentClass,
      isStub,
    };

    return c.json(result);
  }
);
