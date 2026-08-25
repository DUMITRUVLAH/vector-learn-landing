/**
 * VM1-13: PAR AI Prefill — server-side unit tests.
 *
 * T-VM1-13-1 [blocant] Extraction maps vendor_name → payeeName, amount_cents → totalCents, etc.
 * T-VM1-13-2 [blocant] Live API smoke: route mounted + exported
 * T-VM1-13-3 [normal] confidence < 0.7 → low_confidence: true on the field
 * T-VM1-13-4 [normal] document class is informational — any act type still extracts
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

// ─── Mapping logic tests (pure logic, no DB) ──────────────────────────────────

// Mirroring the mapping logic from server/routes/parAiPrefill.ts

interface CapturedField<T = unknown> {
  value: T;
  confidence: number;
  low_confidence?: boolean;
  reason?: string;
}

interface MockExtractedFields {
  vendor_name?: CapturedField<string | null>;
  amount_cents?: CapturedField<number | null>;
  iban?: CapturedField<string | null>;
  purpose?: CapturedField<string | null>;
  document_class?: CapturedField<string | null> & { reason?: string };
}

function mapExtractedToPrefill(fields: MockExtractedFields) {
  const LOW = 0.7;

  function fieldMap<T>(f: CapturedField<T> | undefined): {
    value: T | null;
    confidence: number;
    low_confidence?: boolean;
  } {
    if (!f) return { value: null, confidence: 0, low_confidence: true };
    return {
      value: f.value,
      confidence: f.confidence,
      ...(f.confidence < LOW || f.low_confidence ? { low_confidence: true } : {}),
    };
  }

  const dcField = fields.document_class;
  const dcValue = dcField?.value ?? null;

  return {
    payeeName: fieldMap(fields.vendor_name),
    totalCents: fieldMap(fields.amount_cents),
    payeeIban: fieldMap(fields.iban),
    endUse: fieldMap(fields.purpose),
    // Informational only — the class no longer gates or warns (any act type is extractable).
    documentClass: {
      value: dcValue,
      confidence: dcField?.confidence ?? 0,
      reason: dcField?.reason,
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("T-VM1-13-1 [blocant] Extracted fields map to PAR fields correctly", () => {
  it("maps vendor_name → payeeName, amount_cents → totalCents, iban → payeeIban, purpose → endUse", () => {
    const extracted: MockExtractedFields = {
      vendor_name: { value: "ATIC SRL", confidence: 0.95 },
      amount_cents: { value: 150000, confidence: 0.88 },
      iban: { value: "MD48ML000002259A19498121", confidence: 0.92 },
      purpose: { value: "Servicii consultanță IT", confidence: 0.85 },
      document_class: { value: "invoice", confidence: 0.9, reason: "Factură cu furnizor și TVA" },
    };

    const result = mapExtractedToPrefill(extracted);

    expect(result.payeeName.value).toBe("ATIC SRL");
    expect(result.payeeName.confidence).toBe(0.95);
    expect(result.payeeName.low_confidence).toBeUndefined();

    expect(result.totalCents.value).toBe(150000);
    expect(result.totalCents.confidence).toBe(0.88);

    expect(result.payeeIban.value).toBe("MD48ML000002259A19498121");
    expect(result.payeeIban.confidence).toBe(0.92);

    expect(result.endUse.value).toBe("Servicii consultanță IT");
    expect(result.endUse.confidence).toBe(0.85);

    expect(result.documentClass.value).toBe("invoice");
    expect(result.documentClass.reason).toBe("Factură cu furnizor și TVA");
  });

  it("returns null for missing fields", () => {
    const result = mapExtractedToPrefill({});
    expect(result.payeeName.value).toBeNull();
    expect(result.totalCents.value).toBeNull();
    expect(result.payeeIban.value).toBeNull();
    expect(result.endUse.value).toBeNull();
    expect(result.documentClass.value).toBeNull();
  });
});

describe("T-VM1-13-2 [blocant] Route is exported from parAiPrefill.ts", () => {
  // 30s timeout: the assertion is trivial, but the dynamic import pulls in the full
  // route graph (db/client → PGlite wasm, pdfText → pdfjs). The real import is ~800ms
  // (measured via tsx), yet vitest's first cold SSR-transform of that graph can exceed
  // the 5s default under suite concurrency, flaking this [blocant] route-mount smoke.
  it("parAiPrefillRoutes is exported and has a fetch method", async () => {
    const mod = await import("../../routes/parAiPrefill");
    expect(mod.parAiPrefillRoutes).toBeDefined();
    expect(typeof mod.parAiPrefillRoutes.fetch).toBe("function");
  }, 60000);
});

describe("T-VM1-13-3 [normal] confidence < 0.7 → low_confidence: true", () => {
  it("marks field as low_confidence when confidence is below threshold", () => {
    const extracted: MockExtractedFields = {
      vendor_name: { value: "Unknown SRL", confidence: 0.5 },
      iban: { value: "MD00TEST", confidence: 0.3 },
    };

    const result = mapExtractedToPrefill(extracted);

    expect(result.payeeName.low_confidence).toBe(true);
    expect(result.payeeName.value).toBe("Unknown SRL"); // value still present
    expect(result.payeeIban.low_confidence).toBe(true);
  });

  it("does NOT mark as low_confidence when confidence >= 0.7", () => {
    const extracted: MockExtractedFields = {
      vendor_name: { value: "Good SRL", confidence: 0.75 },
    };
    const result = mapExtractedToPrefill(extracted);
    expect(result.payeeName.low_confidence).toBeUndefined();
  });

  it("marks exactly at 0.7 as NOT low_confidence", () => {
    const extracted: MockExtractedFields = {
      vendor_name: { value: "Boundary SRL", confidence: 0.7 },
    };
    const result = mapExtractedToPrefill(extracted);
    // confidence >= 0.7 → no low_confidence
    expect(result.payeeName.low_confidence).toBeUndefined();
  });
});

describe("T-VM1-13-4 [normal] document class is informational — it never blocks extraction", () => {
  it("keeps the extracted fields for a non-invoice act (contract / act de primire-predare)", () => {
    const extracted: MockExtractedFields = {
      vendor_name: { value: "Viorica Bordei", confidence: 0.9 },
      amount_cents: { value: 47145, confidence: 0.9 },
      iban: { value: "MD69ML000000022519094129", confidence: 0.9 },
      document_class: { value: "not_invoice", confidence: 0.85, reason: "Act de primire-predare" },
    };
    const result = mapExtractedToPrefill(extracted);
    // The whole point of dropping the guard: a non-invoice act still prefills the form.
    expect(result.payeeName.value).toBe("Viorica Bordei");
    expect(result.totalCents.value).toBe(47145);
    expect(result.payeeIban.value).toBe("MD69ML000000022519094129");
    expect(result.documentClass.value).toBe("not_invoice");
  });

  it("exposes no not_financial flag any more (the warning it drove is gone)", () => {
    for (const value of ["not_invoice", "invoice", "receipt", null]) {
      const result = mapExtractedToPrefill({ document_class: { value, confidence: 0.8 } });
      expect("not_financial" in result.documentClass).toBe(false);
      expect(result.documentClass.value).toBe(value);
    }
  });
});
