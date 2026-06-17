/**
 * CAPTURE-DOCCLASS — Tests for the AI document-class verdict in captureExtractor.
 *
 * The extractor must, alongside the existing financial fields, classify WHAT the upload is
 * ("invoice" | "receipt" | "not_invoice"), so a wrongly-uploaded file (a contract, a random
 * photo) is flagged instead of silently processed as an expense. These tests drive the real
 * `processFields` logic through the public `extractCaptureFields`, mocking `callAi` so the
 * model's JSON is deterministic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI client so callAi returns crafted JSON (exercises real processFields parsing).
vi.mock("../../../server/lib/ai/client", () => ({
  callAi: vi.fn(),
}));

import { callAi } from "../../../server/lib/ai/client";
import { extractCaptureFields, CAPTURE_EXTRACT_STUB } from "../../../server/lib/ai/captureExtractor";

const mockedCallAi = vi.mocked(callAi);

/** Build a callAi result whose `text` is the JSON the model would return. */
function aiReturns(json: Record<string, unknown>) {
  mockedCallAi.mockResolvedValueOnce({
    text: JSON.stringify(json),
    auditId: "audit-1",
    isStub: false,
  } as never);
}

describe("CAPTURE-DOCCLASS: document_class extraction", () => {
  beforeEach(() => {
    mockedCallAi.mockReset();
  });

  it("keeps a confident 'invoice' verdict with its reason", async () => {
    aiReturns({
      document_class: { value: "invoice", confidence: 0.95, reason: "Factură cu furnizor și TVA" },
    });
    const { extractedFields } = await extractCaptureFields("text", "t1", "u1", "c1");
    expect(extractedFields.document_class?.value).toBe("invoice");
    expect(extractedFields.document_class?.confidence).toBeCloseTo(0.95);
    expect(extractedFields.document_class?.reason).toBe("Factură cu furnizor și TVA");
    expect(extractedFields.document_class?.low_confidence).toBeUndefined();
  });

  it("keeps a 'not_invoice' verdict — the whole point: flag a non-invoice", async () => {
    aiReturns({
      document_class: { value: "not_invoice", confidence: 0.88, reason: "Pare un contract, nu o factură" },
    });
    const { extractedFields } = await extractCaptureFields("text", "t1", "u1", "c1");
    expect(extractedFields.document_class?.value).toBe("not_invoice");
    expect(extractedFields.document_class?.reason).toBe("Pare un contract, nu o factură");
  });

  it("marks low confidence when the model is unsure", async () => {
    aiReturns({
      document_class: { value: "receipt", confidence: 0.4 },
    });
    const { extractedFields } = await extractCaptureFields("text", "t1", "u1", "c1");
    expect(extractedFields.document_class?.value).toBe("receipt");
    expect(extractedFields.document_class?.low_confidence).toBe(true);
  });

  it("collapses an unknown class value to null (never invents a class)", async () => {
    aiReturns({
      document_class: { value: "spreadsheet", confidence: 0.9 },
    });
    const { extractedFields } = await extractCaptureFields("text", "t1", "u1", "c1");
    expect(extractedFields.document_class?.value).toBeNull();
    expect(extractedFields.document_class?.confidence).toBe(0);
    expect(extractedFields.document_class?.low_confidence).toBe(true);
  });

  it("returns value null when the model omits document_class entirely", async () => {
    aiReturns({ vendor_name: { value: "X SRL", confidence: 0.9 } });
    const { extractedFields } = await extractCaptureFields("text", "t1", "u1", "c1");
    expect(extractedFields.document_class?.value).toBeNull();
    expect(extractedFields.document_class?.low_confidence).toBe(true);
  });

  it("stub (mock mode) carries a valid document_class so the column is never empty", () => {
    expect(["invoice", "receipt", "not_invoice"]).toContain(CAPTURE_EXTRACT_STUB.document_class?.value);
  });
});
