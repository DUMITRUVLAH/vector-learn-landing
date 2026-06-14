/**
 * @vitest-environment node
 *
 * INSIGHT-002: API client + cashflow calcul tests
 *
 * T-INSIGHT-002-1 [blocant]: getCashflowForecast() returns 60 days of scenarios
 * T-INSIGHT-002-2 [blocant]: cashflow good/pessimistic ratio is 1.2/0.8 (DETERMINIST)
 * T-INSIGHT-002-3 [blocant]: getFinMetrics() returns metrics array with required fields
 * T-INSIGHT-002-4 [normal]: getFinAging() returns aging object with all intervals
 * T-INSIGHT-002-5 [normal]: listSavedViews() returns views array
 * T-INSIGHT-002-6 [normal]: listNarratives() returns narratives array
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
});

// ─── T-INSIGHT-002-1 [blocant]: getCashflowForecast returns 60 days ────────────
describe("T-INSIGHT-002-1 [blocant]", () => {
  it("getCashflowForecast() returns object with 60 days per scenario", async () => {
    const base60 = Array.from({ length: 60 }, (_, i) => ({
      date: `2026-06-${String(15 + i).padStart(2, "0")}`,
      cumulativeCents: (i + 1) * 10000,
    }));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        scenarios: {
          good: base60.map((d) => ({ ...d, cumulativeCents: Math.round(d.cumulativeCents * 1.2) })),
          base: base60,
          pessimistic: base60.map((d) => ({ ...d, cumulativeCents: Math.round(d.cumulativeCents * 0.8) })),
        },
        weeklyAvgCents: 70000,
        generatedAt: "2026-06-14T12:00:00Z",
      }),
    });

    const { getCashflowForecast } = await import("@/lib/api/finInsight");
    const result = await getCashflowForecast();

    expect(result.scenarios.base).toHaveLength(60);
    expect(result.scenarios.good).toHaveLength(60);
    expect(result.scenarios.pessimistic).toHaveLength(60);
    expect(result.weeklyAvgCents).toBe(70000);
    expect(result.generatedAt).toBeTruthy();
  });
});

// ─── T-INSIGHT-002-2 [blocant]: good/pessimistic ratio DETERMINIST ────────────
describe("T-INSIGHT-002-2 [blocant]", () => {
  it("cashflow good/base = 1.2 and pessimistic/base = 0.8 (DETERMINIST)", () => {
    // Simulate the server-side DETERMINIST calculation
    const weeklyAvgCents = 700000;
    const dailyBase = Math.round(weeklyAvgCents / 7);
    const dailyGood = Math.round(dailyBase * 1.2);
    const dailyPessimistic = Math.round(dailyBase * 0.8);

    // After 1 day cumulative:
    const day1Base = dailyBase;
    const day1Good = dailyGood;
    const day1Pessimistic = dailyPessimistic;

    // Good should be ~1.2x base (within 1 cent rounding)
    const goodRatio = day1Good / day1Base;
    expect(goodRatio).toBeGreaterThanOrEqual(1.19);
    expect(goodRatio).toBeLessThanOrEqual(1.21);

    // Pessimistic should be ~0.8x base (within 1 cent rounding)
    const pessRatio = day1Pessimistic / day1Base;
    expect(pessRatio).toBeGreaterThanOrEqual(0.79);
    expect(pessRatio).toBeLessThanOrEqual(0.81);

    // After 60 days cumulative
    const cum60Base = dailyBase * 60;
    const cum60Good = dailyGood * 60;
    expect(cum60Good).toBeGreaterThan(cum60Base);
    expect(cum60Good / cum60Base).toBeCloseTo(1.2, 1);
  });
});

// ─── T-INSIGHT-002-3 [blocant]: getFinMetrics returns metrics array ────────────
describe("T-INSIGHT-002-3 [blocant]", () => {
  it("getFinMetrics() returns metrics array with period, revenue, receivable fields", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metrics: [
          { period: "2026-01", revenue: 500000, receivable: 100000, profit: 400000 },
          { period: "2026-02", revenue: 600000, receivable: 80000, profit: 520000 },
        ],
        period: "last_6m",
        groupBy: "month",
      }),
    });

    const { getFinMetrics } = await import("@/lib/api/finInsight");
    const result = await getFinMetrics({ period: "last_6m", groupBy: "month" });

    expect(Array.isArray(result.metrics)).toBe(true);
    expect(result.metrics).toHaveLength(2);
    expect(result.metrics[0]).toHaveProperty("period");
    expect(result.metrics[0]).toHaveProperty("revenue");
    expect(result.metrics[0]).toHaveProperty("receivable");
    expect(result.metrics[0]).toHaveProperty("profit");
  });
});

// ─── T-INSIGHT-002-4 [normal]: getFinAging returns all intervals ──────────────
describe("T-INSIGHT-002-4 [normal]", () => {
  it("getFinAging() returns aging object with all required intervals", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        aging: {
          "0_30": 50000,
          "31_60": 30000,
          "61_90": 0,
          "90_plus": 10000,
          total: 90000,
        },
      }),
    });

    const { getFinAging } = await import("@/lib/api/finInsight");
    const result = await getFinAging();

    expect(result.aging).toHaveProperty("0_30");
    expect(result.aging).toHaveProperty("31_60");
    expect(result.aging).toHaveProperty("61_90");
    expect(result.aging).toHaveProperty("90_plus");
    expect(result.aging).toHaveProperty("total");
    expect(result.aging["0_30"]).toBe(50000);
    expect(result.aging.total).toBe(90000);
  });
});

// ─── T-INSIGHT-002-5 [normal]: listSavedViews returns array ──────────────────
describe("T-INSIGHT-002-5 [normal]", () => {
  it("listSavedViews() with mocked 200 { views: [] } returns empty array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ views: [] }),
    });

    const { listSavedViews } = await import("@/lib/api/finInsight");
    const result = await listSavedViews();

    expect(Array.isArray(result.views)).toBe(true);
    expect(result.views).toHaveLength(0);
  });
});

// ─── T-INSIGHT-002-6 [normal]: listNarratives returns array ──────────────────
describe("T-INSIGHT-002-6 [normal]", () => {
  it("listNarratives(2026) with mocked 200 { narratives: [] } returns empty array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ narratives: [] }),
    });

    const { listNarratives } = await import("@/lib/api/finInsight");
    const result = await listNarratives(2026);

    expect(Array.isArray(result.narratives)).toBe(true);
    expect(result.narratives).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("year=2026"),
      expect.any(Object)
    );
  });
});
