/**
 * PAR-AUTO-001: AI auto-complete for the PAR form.
 *
 * POST /api/par/extract  (multipart: file=<contract|act predare-primire|factură>)
 *   → OCR/vision + captureExtractor (REUSED from FinDesk captures) → PAR-mapped fields.
 *
 * The user uploads a contract / act of receipt / invoice on the PAR create form and
 * we pre-fill payee name, IBAN, amount, date and a purpose line — with confidence so
 * the UI can flag low-confidence guesses for the user to confirm. We never invent
 * critical data (the extractor returns null rather than guess an IBAN/amount).
 *
 * Mounted in server/app.ts: app.route("/api/par/extract", parExtractRoutes)
 * Reuse over rebuild: extractCaptureFields + extractPdfText already power FinDesk
 * Invoice Reporting; this route maps their output onto the PAR payee/amount fields.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { finDataSettings, FIN_DATA_SETTINGS_DEFAULTS } from "../db/schema/finDataSettings";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { extractCaptureFields } from "../lib/ai/captureExtractor";
import { extractPdfText } from "../lib/ai/pdfText";
import { redactPii } from "../lib/ai/redactPii";

export const parExtractRoutes = new Hono<{ Variables: AuthVariables }>();
parExtractRoutes.use("*", requireAuth);

/** Read the tenant's AI-privacy setting (defaults: pseudonymize on, opt-in off). */
async function getPseudonymize(tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ pseudonymize: finDataSettings.pseudonymizeAiPrompts })
    .from(finDataSettings)
    .where(eq(finDataSettings.tenantId, tenantId))
    .limit(1);
  return row?.pseudonymize ?? FIN_DATA_SETTINGS_DEFAULTS.pseudonymizeAiPrompts;
}

const MAX_FILE_BYTES = 8_000_000;

/** Derive OCR text + (for images) a vision data-URL from one uploaded File. Never throws. */
async function deriveFile(file: File): Promise<{ rawText: string; imageDataUrl?: string }> {
  const mimeType = file.type || "application/octet-stream";
  const fileName = file.name || "document";
  const sizeBytes = file.size;
  let rawText = "";
  let imageDataUrl: string | undefined;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
  const isText = /text\/plain|csv/i.test(mimeType) || /\.(txt|csv)$/i.test(fileName);
  try {
    if (mimeType.startsWith("image/") && sizeBytes <= MAX_FILE_BYTES) {
      const buf = Buffer.from(await file.arrayBuffer());
      imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
    } else if (isPdf && sizeBytes <= MAX_FILE_BYTES) {
      const buf = Buffer.from(await file.arrayBuffer());
      rawText = await extractPdfText(buf);
    } else if (isText && sizeBytes <= MAX_FILE_BYTES) {
      rawText = await file.text();
    }
  } catch {
    rawText = rawText || ""; // unreadable file → no text, don't crash
  }
  return { rawText, imageDataUrl };
}

/** Shape returned to the PAR form. Each field carries a confidence so the UI can flag guesses. */
interface ParExtractField<T> {
  value: T;
  confidence: number;
  lowConfidence: boolean;
}

function field<T>(value: T, confidence: number): ParExtractField<T> {
  const conf = Math.min(1, Math.max(0, confidence || 0));
  return { value, confidence: conf, lowConfidence: value === null || conf < 0.6 };
}

/**
 * POST /api/par/extract — extract PAR fields from an uploaded document.
 * Returns payeeName, payeeIban, amount (in major units + cents), date, and a purpose line.
 */
parExtractRoutes.post("/", async (c) => {
  const user = c.get("user");

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "invalid_form", detail: "Trimite un fișier (multipart/form-data)." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "no_file", detail: "Lipsește fișierul (câmpul `file`)." }, 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return c.json({ error: "file_too_large", detail: "Fișierul depășește 8 MB." }, 400);
  }

  const derived = await deriveFile(file);
  let { rawText, imageDataUrl } = derived;
  if (!rawText.trim() && !imageDataUrl) {
    return c.json(
      { error: "unreadable", detail: "Nu am putut citi documentul (format nesuportat sau gol)." },
      422
    );
  }

  // PAR-SEC-001 / security-audit #1: respect the tenant's AI-privacy setting.
  // When pseudonymization is ON (default), redact IBAN/IDNP patterns from the
  // OCR text before it leaves the server. Images can't be redacted (the model
  // reads the pixels directly), so we DROP the image and fall back to redacted
  // text — and if there's no usable text, we refuse rather than leak PII.
  let pseudonymized = false;
  let piiRedactedNote: string | null = null;
  const pseudonymize = await getPseudonymize(user.tenantId);
  if (pseudonymize) {
    if (rawText.trim()) {
      const { text, redactedCount } = redactPii(rawText);
      rawText = text;
      pseudonymized = true;
      if (redactedCount > 0) {
        piiRedactedNote =
          "IBAN/IDNP au fost mascate înainte de trimiterea la AI (setare de confidențialitate). Completează-le manual.";
      }
    }
    if (imageDataUrl) {
      // Drop the image so PII pixels don't bypass redaction.
      imageDataUrl = undefined;
      if (!rawText.trim()) {
        return c.json(
          {
            error: "image_pseudonymize_conflict",
            detail:
              "Documentul e o imagine, iar pseudonimizarea AI e activă — nu pot extrage fără a trimite imaginea. Încarcă un PDF cu text, sau dezactivează pseudonimizarea în Setări → Date.",
          },
          422
        );
      }
    }
  }

  // Reuse the FinDesk extractor. captureId is informational for the audit log only.
  const { extractedFields, isStub } = await extractCaptureFields(
    rawText,
    user.tenantId,
    user.id,
    `par-extract-${Date.now()}`,
    imageDataUrl
  );

  const ef = extractedFields;
  const amountCents = (ef.amount_cents?.value as number | null) ?? null;

  return c.json({
    isStub,
    pseudonymized,
    piiRedactedNote,
    documentClass: ef.document_class?.value ?? null,
    documentClassReason: (ef.document_class as { reason?: string } | undefined)?.reason ?? null,
    fields: {
      payeeName: field<string | null>((ef.vendor_name?.value as string | null) ?? null, ef.vendor_name?.confidence ?? 0),
      payeeIban: field<string | null>((ef.iban?.value as string | null) ?? null, ef.iban?.confidence ?? 0),
      // Amount in major units for display, plus cents for the line item.
      amount: field<number | null>(amountCents != null ? amountCents / 100 : null, ef.amount_cents?.confidence ?? 0),
      amountCents: field<number | null>(amountCents, ef.amount_cents?.confidence ?? 0),
      date: field<string | null>((ef.expense_date?.value as string | null) ?? null, ef.expense_date?.confidence ?? 0),
      purpose: field<string | null>((ef.purpose?.value as string | null) ?? null, ef.purpose?.confidence ?? 0),
      reference: field<string | null>((ef.reference?.value as string | null) ?? null, ef.reference?.confidence ?? 0),
    },
  });
});
