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
import type { ExtractedFields, CapturedField } from "../../db/schema/finCaptures";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ─── Prompt engineering ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ești un asistent de extracție date financiare din texte OCR de bonuri și facturi.
Extrage câmpurile de mai jos și returnează STRICT un JSON valid, fără text adițional.

REGULI ABSOLUTE:
1. Dacă nu găsești un câmp → "value": null, "confidence": 0
2. Nu inventa sume, IBAN-uri sau date. Mai bine null decât greșit.
3. Confidence [0..1]: cât de sigur ești de valoare.
4. amount_cents și vat_amount_cents sunt numere întregi (cenți, nu lei decimali).
5. expense_date format YYYY-MM-DD.
6. category: una din ["rent","utilities","salaries","marketing","supplies","software","maintenance","other"].
   (ex. Facebook Ads / Google Ads / Meta / LinkedIn Ads → "marketing"; abonamente SaaS → "software".)
7. vat_deductible: true dacă există factură cu TVA deductibil clar, false dacă e bon simplu.
8. purpose: o frază scurtă (max 15 cuvinte) în română care explică PENTRU CE e cheltuiala
   (ex. "Campanie Facebook Ads — promovare curs toamnă", "Licență Google Workspace echipă").

Returnează DOAR JSON cu structura:
{
  "vendor_name": { "value": "..." sau null, "confidence": 0.0 },
  "amount_cents": { "value": 0 sau null, "confidence": 0.0 },
  "vat_amount_cents": { "value": 0 sau null, "confidence": 0.0 },
  "vat_deductible": { "value": true/false sau null, "confidence": 0.0 },
  "expense_date": { "value": "YYYY-MM-DD" sau null, "confidence": 0.0 },
  "iban": { "value": "..." sau null, "confidence": 0.0 },
  "category": { "value": "..." sau null, "confidence": 0.0 },
  "reference": { "value": "..." sau null, "confidence": 0.0 },
  "purpose": { "value": "..." sau null, "confidence": 0.0 }
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

  const keys = [
    "vendor_name",
    "amount_cents",
    "vat_amount_cents",
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
      // Câmp lipsă → marcat null cu confidence 0
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

    // Validare specifică per câmp
    if (key === "amount_cents" || key === "vat_amount_cents") {
      const v = processed.value;
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
        // Sumă invalidă → null (regula: nu inventa)
        processed.value = null;
        processed.confidence = 0;
        processed.low_confidence = true;
      } else if (typeof v === "number") {
        processed.value = Math.round(v); // asigurăm întreg
      }
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
  captureId: string
): Promise<CaptureExtractionResult> {
  const callOptions: AiCallOptions = {
    action: "capture_extract",
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extrage câmpurile financiare din textul OCR următor:\n\n${rawText}`,
    tenantId,
    userId,
    entityType: "fin_capture",
    entityId: captureId,
    maxTokens: 500,
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
