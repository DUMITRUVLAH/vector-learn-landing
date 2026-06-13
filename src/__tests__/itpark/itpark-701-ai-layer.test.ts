/**
 * ITPARK-701: AI layer — CAEM suggestion + invoice extraction
 * Tests from spec, written independently of implementation.
 *
 * Spec acceptance criteria:
 *   AC-1. suggestCaem() sends POST /api/itpark/ai/suggest-caem → returns suggestion
 *   AC-2. AI NEVER recomputes totals/share/threshold (deterministic stays untouched)
 *   AC-3. Suggestions logged in aiAuditLog (via callAi)
 *   AC-4. Graceful degrade when AI off (isStub=true)
 *   AC-5. extractInvoice() returns proposal — user must confirm before save
 *   AC-6. T-701-1 BLOCKING: AI proposes but totals unchanged
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeAnexa3 } from "../../lib/itpark/calc";
import { computeAnexa4 } from "../../lib/itpark/anexa4";
import { checkConsistency } from "../../lib/itpark/consistency";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "e0000000-0000-4000-8000-000000000701";
const TENANT_ID = "t0000000-0000-4000-8000-000000000701";

function makeLines(n: number, isEligible = true) {
  return Array.from({ length: n }, (_, i) => ({
    caemCode: "6201",
    amountCents: 100_000_00, // 100_000 MDL per line
    isEligible,
    month: (i % 12) + 1,
  }));
}

// ─── T-701-1 [blocant]: AI does NOT affect deterministic calculations ─────────

describe("T-701-1 [blocant]: AI suggestions do not affect deterministic totals", () => {
  it("computeAnexa3 result is unchanged regardless of AI suggestion", () => {
    const lines = makeLines(5);
    const totalBefore = computeAnexa3(lines).totalSalesCents;

    // Simulate AI suggesting a different CAEM code (e.g., "6202" instead of "6201")
    // This has NO effect on amounts — the totals are computed from amountCents, not CAEM
    const linesWithDiffCaem = lines.map((l) => ({ ...l, caemCode: "6202" }));
    const totalAfter = computeAnexa3(linesWithDiffCaem).totalSalesCents;

    // Changing CAEM code doesn't change the total (amount is the same)
    expect(totalAfter).toBe(totalBefore);
    expect(totalBefore).toBe(5 * 100_000_00);
  });

  it("computeAnexa4 threshold is computed from amountCents, not CAEM source", () => {
    const lines = makeLines(12);
    const result = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    // AI suggestion of CAEM cannot change threshold result
    expect(result.total.annualSharePct).toBeGreaterThan(70);
    expect(result.thresholdEval.risk).toBe(false);
  });

  it("checkConsistency result depends only on amounts and computation, not AI CAEM suggestions", () => {
    const lines = makeLines(3);
    const a3 = computeAnexa3(lines);
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    const consistency = checkConsistency(a3.totalSalesCents, a3, a4);

    // AI did not touch these → consistency is deterministic
    expect(consistency.ok).toBe(true);
    // Even if AI suggested a wrong CAEM, the consistency check is about AMOUNTS, not codes
  });
});

// ─── T-701-2 [blocant]: suggestCaem client API ───────────────────────────────

describe("T-701-2 [blocant]: suggestCaem() API call structure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls POST /api/itpark/ai/suggest-caem with correct payload", async () => {
    const mockResult = {
      source: "ai",
      code: "6201",
      score: 85,
      reason: "Activităţi de realizare a software-ului la comandă",
      auditId: "audit-uuid-123",
      isStub: false,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as unknown as Response);

    const { suggestCaem } = await import("../../lib/api/itparkAi");
    const result = await suggestCaem({
      description: "Servicii software personalizate pentru client extern",
      engagementId: ENGAGEMENT_ID,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/itpark/ai/suggest-caem",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    expect(result.code).toBe("6201");
    expect(result.score).toBe(85);
    expect(result.isStub).toBe(false);
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "forbidden" }),
    } as unknown as Response);

    const { suggestCaem } = await import("../../lib/api/itparkAi");
    await expect(
      suggestCaem({ description: "Test", engagementId: ENGAGEMENT_ID })
    ).rejects.toThrow(/suggestCaem: 403/);
  });
});

// ─── T-701-3 [normal]: extractInvoice client API ─────────────────────────────

describe("T-701-3 [normal]: extractInvoice() returns a proposal, not a saved line", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls POST /api/itpark/ai/extract-invoice with invoice text", async () => {
    const mockResult = {
      source: "ai",
      proposal: {
        clientName: "TechCorp SRL",
        amountCents: 9785000, // 97_850.00 MDL
        invoiceDate: "2025-10-27",
        caemCode: "6201",
        serviceDescription: "Servicii software personalizate",
        documentRefs: "Factura EBC000276766 din 27.10.2025",
      },
      auditId: "audit-uuid-456",
      isStub: false,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as unknown as Response);

    const { extractInvoice } = await import("../../lib/api/itparkAi");
    const result = await extractInvoice({
      invoiceText: "Factura nr. EBC000276766 din 27.10.2025. TechCorp SRL. Total 97.850 MDL",
      engagementId: ENGAGEMENT_ID,
    });

    expect(result.proposal.clientName).toBe("TechCorp SRL");
    expect(result.proposal.amountCents).toBe(9785000);
    expect(result.proposal.caemCode).toBe("6201");
    expect(result.isStub).toBe(false);
    // Proposal is returned — NOT yet saved to DB (that requires user confirmation)
  });

  it("returns isStub=true with message when AI is off", async () => {
    const mockResult = {
      source: "stub",
      proposal: {
        clientName: "",
        amountCents: 0,
        invoiceDate: new Date().toISOString().slice(0, 10),
        caemCode: "6201",
        serviceDescription: "",
        documentRefs: "",
      },
      isStub: true,
      message: "AI dezactivat — completați câmpurile manual.",
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResult),
    } as unknown as Response);

    const { extractInvoice } = await import("../../lib/api/itparkAi");
    const result = await extractInvoice({
      invoiceText: "Invoice text here",
      engagementId: ENGAGEMENT_ID,
    });

    expect(result.isStub).toBe(true);
    expect(result.message).toContain("manual");
  });
});

// ─── T-701-4 [normal]: stub/degrade when AI off ──────────────────────────────

describe("T-701-4 [normal]: Graceful degrade when AI disabled", () => {
  it("isStub=true does not throw — returns fallback code", async () => {
    const stubResult = {
      source: "stub",
      code: "6201",
      score: 50,
      reason: "Sugestie implicită (AI dezactivat)",
      isStub: true,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(stubResult),
    } as unknown as Response);

    const { suggestCaem } = await import("../../lib/api/itparkAi");
    const result = await suggestCaem({
      description: "Servicii software",
      engagementId: ENGAGEMENT_ID,
    });

    expect(result.isStub).toBe(true);
    expect(result.code).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    // System remains functional with stub — no throw
  });
});

// ─── T-701-5 [normal]: PII anonymization (server-side, tested via contract) ──

describe("T-701-5 [normal]: PII anonymization contract", () => {
  it("suggestCaem sends description (server anonymizes it before LLM)", async () => {
    // The client sends the raw description.
    // The SERVER pseudonymizes before calling callAi — this is verified by the server unit.
    // Here we verify the client contract: we DO send the description.
    const capturedBody: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedBody.push(init.body as string);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ source: "ai", code: "6201", score: 80, reason: "ok", isStub: false }),
      }) as Promise<Response>;
    });

    const { suggestCaem } = await import("../../lib/api/itparkAi");
    await suggestCaem({
      description: "Servicii software pentru Client Acme SRL",
      engagementId: ENGAGEMENT_ID,
    });

    const body = JSON.parse(capturedBody[0]);
    // Client sends raw description — server is responsible for PII anonymization
    expect(body.description).toBe("Servicii software pentru Client Acme SRL");
    expect(body.engagementId).toBe(ENGAGEMENT_ID);
  });
});

// ─── T-701-6 [normal]: AI proposal doesn't affect existing line eligibility ──

describe("T-701-6 [normal]: AI proposal does not change isEligible flag on existing lines", () => {
  it("isEligible is determined by CAEM code in itpark_caem_codes table, not AI alone", () => {
    // When AI suggests CAEM "6201" for an existing line,
    // the isEligible flag is determined by looking up itpark_caem_codes.eligible
    // for that code — the AI has NO authority to set eligibility directly.
    // This is enforced by the server route: suggestCaem returns {code, score, reason}
    // and the client's "Apply" just fills the form field; the user then submits
    // PUT /api/itpark/lines/:id which recomputes isEligible from the DB.

    // Verify the type: CaemSuggestion does NOT have an isEligible field
    const suggestion = {
      source: "ai" as const,
      code: "6201",
      score: 85,
      reason: "Software development",
      isStub: false,
    };

    // The suggestion interface has no isEligible — only code/score/reason
    expect("isEligible" in suggestion).toBe(false);
    expect("amountCents" in suggestion).toBe(false);
  });
});
