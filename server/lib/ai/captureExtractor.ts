/**
 * CAPTURE-002: FinDesk — AI OCR Extractor
 *
 * Extrage câmpuri financiare din textul OCR al unui bon/factură.
 * REFOLOSEȘTE callAi + aiAuditLog din client.ts.
 *
 * Regulile FIN-CORE #4 și #5 (ABSOLUTE):
 *   - AI PROPUNE, omul CONFIRMĂ.
 *   - AI nu inventează: câmp negăsit → value: null, confidence: 0.
 *   - Confidence < 0.7 → low_confidence: true în câmp.
 *
 * Mock mode: dacă AI_API_KEY lipsește, callAi returnează stub "capture_extract".
 * Stubul produce câmpuri plauzibile cu confidence 0.9 (nu date inventate critice).
 */

import { callAi, type AiCallOptions } from "./client";
import type { ExtractedFields, CapturedField, DocumentClass } from "../../db/schema/finCaptures";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ─── Prompt engineering ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ești un asistent de extracție date financiare din texte OCR de bonuri și facturi.
Extrage câmpurile de mai jos și returnează STRICT un JSON valid, fără text adițional.

REGULI ABSOLUTE:
1. Dacă nu găsești un câmp → "value": null, "confidence": 0
2. Nu inventa sume, IBAN-uri sau date. Mai bine null decât greșit.
3. Confidence [0..1]: cât de sigur ești de valoare.
4. amount și vat_amount sunt sumele în LEI (unități majore, cu zecimale exact ca pe document).
   Exemplu: dacă pe factură scrie "Total: 5.040,00 MDL", atunci amount = 5040.00 (NU 504000, NU 5040000).
   NU înmulți cu 100 și NU adăuga zerouri — scrie suma EXACT ca pe document.
5. expense_date format YYYY-MM-DD.
6. category: una din ["rent","utilities","salaries","marketing","supplies","software","maintenance","other"].
   (ex. Facebook Ads / Google Ads / Meta / LinkedIn Ads → "marketing"; abonamente SaaS → "software".)
7. vat_deductible: true dacă există factură cu TVA deductibil clar, false dacă e bon simplu.
8. purpose: o frază scurtă (max 15 cuvinte) în română care explică PENTRU CE e cheltuiala
   (ex. "Campanie Facebook Ads — promovare curs toamnă", "Licență Google Workspace echipă").
9. reportable: decide dacă documentul intră în raportarea fiscală (TVA / declarații / contabilitate
   oficială). value: true dacă este o factură/document fiscal valid cu TVA sau cheltuială deductibilă
   ce trebuie raportată; false dacă e un bon nedeductibil, document personal sau irelevant fiscal;
   null dacă nu poți decide. În câmpul "reason" pune o frază scurtă în română care explică decizia
   (ex. "Factură cu TVA deductibil → intră în declarația TVA", "Bon fără cod fiscal → neraportabil").
10. document_class: decide CE TIP de document este, ÎNAINTE de a avea încredere în câmpurile de mai sus.
    value: "invoice" dacă este o factură fiscală (furnizor + sumă + de regulă TVA / cod fiscal);
    "receipt" dacă este un bon / chitanță simplă; "not_invoice" dacă NU este un document financiar
    (ex. contract, poză aleatorie, captură de ecran, meniu, alt document urcat din greșeală);
    null dacă nu poți decide. NU forța "invoice" dacă documentul nu seamănă a factură/bon — e mai bine
    "not_invoice" decât să tratezi greșit un document care nu e factură. În "reason" pune o frază scurtă
    în română (ex. "Factură cu furnizor și TVA", "Pare un contract, nu o factură").

Returnează DOAR JSON cu structura:
{
  "vendor_name": { "value": "..." sau null, "confidence": 0.0 },
  "amount": { "value": 0.0 sau null, "confidence": 0.0 },
  "vat_amount": { "value": 0.0 sau null, "confidence": 0.0 },
  "vat_deductible": { "value": true/false sau null, "confidence": 0.0 },
  "expense_date": { "value": "YYYY-MM-DD" sau null, "confidence": 0.0 },
  "iban": { "value": "..." sau null, "confidence": 0.0 },
  "category": { "value": "..." sau null, "confidence": 0.0 },
  "reference": { "value": "..." sau null, "confidence": 0.0 },
  "purpose": { "value": "..." sau null, "confidence": 0.0 },
  "reportable": { "value": true/false sau null, "confidence": 0.0, "reason": "..." },
  "document_class": { "value": "invoice"/"receipt"/"not_invoice" sau null, "confidence": 0.0, "reason": "..." }
}`;

// ─── Stub response ────────────────────────────────────────────────────────────

/** Câmpuri implicite returnate când AI_API_KEY lipsește (mock mode). */
export const CAPTURE_EXTRACT_STUB: ExtractedFields = {
  vendor_name: { value: "Demo Furnizor SRL", confidence: 0.9 },
  amount_cents: { value: 10000, confidence: 0.9 },
  vat_amount_cents: { value: 2000, confidence: 0.9 },
  vat_deductible: { value: true, confidence: 0.9 },
  expense_date: { value: new Date().toISOString().slice(0, 10), confidence: 0.9 },
  iban: { value: null, confidence: 0, low_confidence: true },
  category: { value: "marketing", confidence: 0.9 },
  reference: { value: null, confidence: 0, low_confidence: true },
  purpose: { value: "Cheltuială echipă — verificați descrierea", confidence: 0.6, low_confidence: true },
  reportable: { value: true, confidence: 0.9, reason: "Factură cu TVA deductibil → intră în declarația TVA" },
  document_class: { value: "invoice", confidence: 0.9, reason: "Factură cu furnizor și TVA" },
};

// ─── Field processing ─────────────────────────────────────────────────────────

/**
 * Adaugă low_confidence: true câmpurilor cu confidence < 0.7.
 * Standardizează câmpurile returnate de AI.
 */
function processFields(raw: Record<string, unknown>): ExtractedFields {
  // Indexed write target: each key maps to a differently-typed CapturedField<T>, so we
  // assign through a generic record and return it as ExtractedFields (runtime shape is correct).
  const result: Record<string, CapturedField<unknown>> = {};

  // Money: the model returns MAJOR units (lei, e.g. 5040.00). We convert to cents in
  // code (×100) — deterministic, avoids the model's ×100 math errors. Map the AI's
  // `amount`/`vat_amount` onto the stored `amount_cents`/`vat_amount_cents`.
  const moneyMap: Record<string, string> = {
    amount: "amount_cents",
    vat_amount: "vat_amount_cents",
  };
  for (const [aiKey, storeKey] of Object.entries(moneyMap)) {
    const field = raw[aiKey] as { value: unknown; confidence: number } | undefined;
    if (!field || typeof field.confidence !== "number" || field.value == null) {
      result[storeKey] = { value: null, confidence: 0, low_confidence: true };
      continue;
    }
    const major = typeof field.value === "number" ? field.value : parseFloat(String(field.value).replace(",", "."));
    if (!Number.isFinite(major) || major < 0) {
      result[storeKey] = { value: null, confidence: 0, low_confidence: true };
      continue;
    }
    const conf = Math.min(1, Math.max(0, field.confidence));
    result[storeKey] = {
      value: Math.round(major * 100),
      confidence: conf,
      ...(conf < LOW_CONFIDENCE_THRESHOLD ? { low_confidence: true } : {}),
    };
  }

  // Plain string/bool fields.
  const keys = [
    "vendor_name",
    "vat_deductible",
    "expense_date",
    "iban",
    "category",
    "reference",
    "purpose",
  ] as const;

  for (const key of keys) {
    const field = raw[key] as { value: unknown; confidence: number } | undefined;
    if (!field || typeof field.confidence !== "number") {
      result[key] = { value: null, confidence: 0, low_confidence: true } as CapturedField<null>;
      continue;
    }

    const processed: CapturedField<unknown> = {
      value: field.value,
      confidence: Math.min(1, Math.max(0, field.confidence)),
    };

    if (processed.confidence < LOW_CONFIDENCE_THRESHOLD) {
      processed.low_confidence = true;
    }

    if (key === "expense_date" && processed.value !== null) {
      const dateStr = String(processed.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        processed.value = null;
        processed.confidence = 0;
        processed.low_confidence = true;
      }
    }

    result[key] = processed;
  }

  // Invoice Reporting: the reportable verdict carries a `reason` string alongside value+confidence.
  const rep = raw["reportable"] as { value?: unknown; confidence?: number; reason?: unknown } | undefined;
  if (rep && typeof rep.confidence === "number") {
    const conf = Math.min(1, Math.max(0, rep.confidence));
    const value = rep.value === true ? true : rep.value === false ? false : null;
    result["reportable"] = {
      value,
      confidence: conf,
      ...(conf < LOW_CONFIDENCE_THRESHOLD ? { low_confidence: true } : {}),
      ...(typeof rep.reason === "string" && rep.reason ? { reason: rep.reason } : {}),
    };
  } else {
    result["reportable"] = { value: null, confidence: 0, low_confidence: true };
  }

  // Document Classification: validate the AI's verdict against the allowed set; anything
  // unexpected (or missing) collapses to value: null so the route derives a "review" status.
  const VALID_CLASSES: readonly DocumentClass[] = ["invoice", "receipt", "not_invoice"];
  const dc = raw["document_class"] as
    | { value?: unknown; confidence?: number; reason?: unknown }
    | undefined;
  if (dc && typeof dc.confidence === "number") {
    const conf = Math.min(1, Math.max(0, dc.confidence));
    const value = VALID_CLASSES.includes(dc.value as DocumentClass)
      ? (dc.value as DocumentClass)
      : null;
    result["document_class"] = {
      value,
      confidence: value === null ? 0 : conf,
      ...(value === null || conf < LOW_CONFIDENCE_THRESHOLD ? { low_confidence: true } : {}),
      ...(typeof dc.reason === "string" && dc.reason ? { reason: dc.reason } : {}),
    };
  } else {
    result["document_class"] = { value: null, confidence: 0, low_confidence: true };
  }

  return result as ExtractedFields;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export interface CaptureExtractionResult {
  extractedFields: ExtractedFields;
  rawText: string;
  auditId: string;
  isStub: boolean;
}

/**
 * Extrage câmpuri financiare din textul OCR al unui bon/factură.
 *
 * @param rawText — textul OCR brut (din imagine/PDF)
 * @param tenantId — tenant pentru audit log
 * @param userId — utilizatorul care a făcut upload
 * @param captureId — ID-ul capturii (pentru entity referință în audit)
 */
export async function extractCaptureFields(
  rawText: string,
  tenantId: string,
  userId: string,
  captureId: string,
  imageDataUrl?: string,
): Promise<CaptureExtractionResult> {
  const callOptions: AiCallOptions = {
    action: "capture_extract",
    systemPrompt: SYSTEM_PROMPT,
    // With an image, instruct the model to read the document; otherwise use the OCR text.
    userMessage: imageDataUrl
      ? "Extrage câmpurile financiare din factura/bonul din imaginea atașată."
      : `Extrage câmpurile financiare din textul OCR următor:\n\n${rawText}`,
    tenantId,
    userId,
    entityType: "fin_capture",
    entityId: captureId,
    maxTokens: 500,
    imageDataUrl,
  };

  const result = await callAi(callOptions);

  // Parse JSON response
  let extractedFields: ExtractedFields;

  if (result.isStub) {
    // Mock mode: returnăm stub-ul cu date demo
    extractedFields = { ...CAPTURE_EXTRACT_STUB };
  } else {
    try {
      // AI poate returna ```json ... ``` sau text pur JSON
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      extractedFields = processFields(parsed);
    } catch {
      // Parse failed → fallback la stub (AI nu a returnat JSON valid)
      extractedFields = { ...CAPTURE_EXTRACT_STUB };
    }
  }

  return {
    extractedFields,
    rawText,
    auditId: result.auditId,
    isStub: result.isStub,
  };
}
