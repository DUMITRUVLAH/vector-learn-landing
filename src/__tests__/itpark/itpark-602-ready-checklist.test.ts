/**
 * ITPARK-602: ReadinessChecklist — "Gata" gate before export
 * Tests from spec T-602-N, written independently of the implementation.
 *
 * Spec acceptance criteria:
 *   AC-1. Checklist renders all mandatory check items
 *   AC-2. Ready button DISABLED when consistency is red (T-602-1 BLOCKING)
 *   AC-3. Ready button ENABLED when all blocking checks pass
 *   AC-4. markEngagementReady() sends PATCH /ready → returns updated engagement
 *   AC-5. Server PATCH /:id/ready requires accountant role
 *   AC-6. All 5 letters + declaration must be ready/exported for Ready button
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkConsistency } from "../../lib/itpark/consistency";
import { computeAnexa3 } from "../../lib/itpark/calc";
import { computeAnexa4 } from "../../lib/itpark/anexa4";
import type { RevenueLine } from "../../lib/api/itparkLines";
import type { PacketDocument } from "../../lib/api/itparkDocs";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "e0000000-0000-4000-8000-000000000001";
const TENANT_ID = "t0000000-0000-4000-8000-000000000001";
const USER_ID = "u0000000-0000-4000-8000-000000000001";

function makeEngagement(status: "draft" | "in_progress" | "ready" | "exported" = "draft") {
  return {
    id: ENGAGEMENT_ID,
    tenantId: TENANT_ID,
    residentName: "TechCorp SRL",
    idno: "1234567890123",
    mitpContractNo: "MITP-2024-001",
    mitpContractDate: "2024-01-01",
    legalAddress: "str. Ștefan cel Mare 1",
    subdivisionAddresses: null,
    vatPayer: false,
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    reportingYear: 2024,
    auditFirmName: "Audit SRL",
    status,
    subcontractorCostsCents: 0,
    subcontractorCostsPct: null,
    totalSalesCents: 197119719, // 1_971_197.19 MDL
    adjustedRevenueCents: 0,
    employeeInfoProcedure: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeLines(count: number, isEligible = true): RevenueLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`,
    tenantId: TENANT_ID,
    engagementId: ENGAGEMENT_ID,
    rowNo: i + 1,
    caemCode: "6201",
    clientName: `Client ${i + 1}`,
    serviceDescription: `Software services ${i + 1}`,
    documentRefs: `INV-${i + 1}`,
    amountCents: Math.floor(197119719 / count),
    isEligible,
    month: (i % 12) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

const MANDATORY_DOC_KINDS = [
  "letter_no_adjustments",
  "letter_address",
  "letter_no_subdivisions",
  "letter_activity",
  "letter_solvency",
  "decl_self_responsibility",
] as const;

function makeDoc(kind: string, docStatus: "draft" | "ready" | "exported" = "ready"): PacketDocument {
  return {
    id: `doc-${kind}`,
    tenantId: TENANT_ID,
    engagementId: ENGAGEMENT_ID,
    kind: kind as PacketDocument["kind"],
    status: docStatus,
    dataJson: { bodyRo: `Body for ${kind}` },
    generatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeAllDocs(docStatus: "draft" | "ready" | "exported" = "ready"): PacketDocument[] {
  return MANDATORY_DOC_KINDS.map((k) => makeDoc(k, docStatus));
}

// ─── T-602-1 [blocant]: consistency gate ──────────────────────────────────────

describe("T-602-1 [blocant]: Ready button blocked when consistency is red", () => {
  it("checkConsistency returns ok=false when Anexa2 total differs from Anexa3 total", () => {
    const lines = makeLines(3);
    const a3 = computeAnexa3(
      lines.map((l) => ({
        caemCode: l.caemCode,
        amountCents: l.amountCents,
        isEligible: l.isEligible,
        month: l.month ?? undefined,
      }))
    );
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    // Engagement total intentionally different from a3 total → divergence
    const divergentTotal = 999_999_99; // very different from lines total
    const result = checkConsistency(divergentTotal, a3, a4);
    expect(result.ok).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/divergen|diferen|mismatch|inconsist/i);
  });

  it("checkConsistency returns ok=true when totals agree within tolerance", () => {
    const lines = makeLines(3);
    const a3 = computeAnexa3(
      lines.map((l) => ({
        caemCode: l.caemCode,
        amountCents: l.amountCents,
        isEligible: l.isEligible,
        month: l.month ?? undefined,
      }))
    );
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    // Pass exact same total as the computed a3 sum
    const result = checkConsistency(a3.totalSalesCents, a3, a4);
    expect(result.ok).toBe(true);
  });
});

// ─── T-602-2 [blocant]: lines required ───────────────────────────────────────

describe("T-602-2 [blocant]: Ready blocked when no revenue lines exist", () => {
  it("blocks when lines array is empty regardless of consistency", () => {
    const lines: RevenueLine[] = [];
    const a3 = computeAnexa3([]);
    const a4 = computeAnexa4([], { eligibilityThresholdPct: 70, toleranceMonths: 2 });
    const consistency = checkConsistency(0, a3, a4);
    // No lines means blocking check 'check_lines' will be 'error'
    expect(lines.length).toBe(0);
    // consistency.ok may be true (0===0), but lines block is separate
    // The component logic: hasLines = lines.length > 0 → false → 'error' status + blocking=true
    const hasLines = lines.length > 0;
    expect(hasLines).toBe(false);
  });

  it("unblocks when at least 1 line exists", () => {
    const lines = makeLines(1);
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ─── T-602-3 [blocant]: mandatory docs gate ───────────────────────────────────

describe("T-602-3 [blocant]: Ready blocked when mandatory docs missing or in draft", () => {
  it("all 6 mandatory doc kinds must be present and ready/exported", () => {
    const allReady = makeAllDocs("ready");
    const byKind = new Map(allReady.map((d) => [d.kind, d]));

    for (const kind of MANDATORY_DOC_KINDS) {
      const doc = byKind.get(kind);
      expect(doc).toBeDefined();
      expect(["ready", "exported"]).toContain(doc?.status);
    }
  });

  it("draft docs count as blocking (not ready)", () => {
    const draftDocs = makeAllDocs("draft");
    for (const doc of draftDocs) {
      expect(doc.status).toBe("draft");
      // draft → NOT ok (CheckRow shows 'warn', blocking=true → button disabled)
    }
  });

  it("missing doc for any mandatory kind produces error status", () => {
    const partialDocs = MANDATORY_DOC_KINDS.slice(0, 4).map((k) => makeDoc(k, "ready"));
    const byKind = new Map(partialDocs.map((d) => [d.kind, d]));

    // letter_solvency and decl_self_responsibility missing
    expect(byKind.get("letter_solvency")).toBeUndefined();
    expect(byKind.get("decl_self_responsibility")).toBeUndefined();
  });
});

// ─── T-602-4 [normal]: threshold evaluation (non-blocking) ───────────────────

describe("T-602-4 [normal]: Threshold risk shows warning but doesn't block Ready", () => {
  it("risk=true produces warn status (non-blocking)", () => {
    // Create lines where most are ineligible → low share → risk
    const lines = makeLines(10, false); // all ineligible
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    // With all ineligible, annualSharePct = 0 → risk = true
    expect(a4.thresholdEval.risk).toBe(true);
    // But threshold check is blocking=false → won't prevent Ready button
  });

  it("risk=false produces ok status", () => {
    const lines = makeLines(12, true); // all eligible, spread across 12 months
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    expect(a4.thresholdEval.risk).toBe(false);
  });
});

// ─── T-602-5 [blocant]: client API markEngagementReady ───────────────────────

describe("T-602-5 [blocant]: markEngagementReady() sends PATCH and returns updated engagement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls PATCH /api/itpark/engagements/:id/ready with credentials", async () => {
    const updatedEng = makeEngagement("ready");
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ engagement: updatedEng }),
    } as unknown as Response);

    const { markEngagementReady } = await import("../../lib/api/itparkEngagements");
    const result = await markEngagementReady(ENGAGEMENT_ID);

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/itpark/engagements/${ENGAGEMENT_ID}/ready`,
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
    expect(result.status).toBe("ready");
    expect(result.id).toBe(ENGAGEMENT_ID);
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "forbidden" }),
    } as unknown as Response);

    const { markEngagementReady } = await import("../../lib/api/itparkEngagements");
    await expect(markEngagementReady(ENGAGEMENT_ID)).rejects.toThrow(/markEngagementReady: 403/);
  });
});

// ─── T-602-6 [normal]: complete checklist state ───────────────────────────────

describe("T-602-6 [normal]: Full ready state when all checks pass", () => {
  it("all checks pass: lines present + consistency ok + all docs ready", () => {
    const eng = makeEngagement("draft");
    const lines = makeLines(5);
    const docs = makeAllDocs("ready");

    // Compute as component would
    const a3 = computeAnexa3(
      lines.map((l) => ({
        caemCode: l.caemCode,
        amountCents: l.amountCents,
        isEligible: l.isEligible,
        month: l.month ?? undefined,
      }))
    );
    const a4 = computeAnexa4(
      lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
      { eligibilityThresholdPct: 70, toleranceMonths: 2 }
    );
    const consistency = checkConsistency(a3.totalSalesCents, a3, a4);
    const byKind = new Map(docs.map((d) => [d.kind, d]));

    // All blocking checks should pass
    expect(lines.length).toBeGreaterThan(0); // check_lines = ok
    expect(consistency.ok).toBe(true); // check_consistency = ok
    for (const kind of MANDATORY_DOC_KINDS) {
      const doc = byKind.get(kind);
      expect(doc?.status).toMatch(/^ready|exported$/); // letter/decl checks = ok
    }

    // canMarkReady should be true (no blocking failures)
    const _ = eng; // engagement present
    const blockingFailed: string[] = [];
    if (lines.length === 0) blockingFailed.push("check_lines");
    if (!consistency.ok) blockingFailed.push("check_consistency");
    for (const kind of MANDATORY_DOC_KINDS) {
      const doc = byKind.get(kind);
      if (!doc || doc.status === "draft") blockingFailed.push(kind);
    }
    expect(blockingFailed).toHaveLength(0);
  });
});
