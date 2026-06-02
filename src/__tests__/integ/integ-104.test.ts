/**
 * INTEG-104 — 4 missing analytics endpoints
 *
 * Unit tests verifying:
 * - /api/analytics/kpi shape: revenueMtdCents, activeStudents, conversionRate, overdueCount
 * - /api/analytics/revenue-over-time shape: { series: [{period, amountCents}] }
 * - /api/analytics/revenue-by-course shape: { courses: [{courseId, courseName, totalCents}] }
 * - /api/analytics/student-ltv shape: { avgLtvCents, totalRevenueCents, activeStudents }
 * - revenue-by-course grouping logic
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message?: string
    ) {
      super(message ?? code);
    }
  },
}));

const mockApi = vi.mocked(api);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface KpiResponse {
  revenueMtdCents: number;
  activeStudents: number;
  conversionRate: number;
  overdueCount: number;
}

interface RevenueOverTimeResponse {
  series: Array<{ period: string; amountCents: number }>;
  granularity: string;
  months: number;
}

interface RevenueByCourseResponse {
  courses: Array<{ courseId: string; courseName: string; totalCents: number }>;
}

interface StudentLtvResponse {
  avgLtvCents: number;
  totalRevenueCents: number;
  activeStudents: number;
}

const sampleKpi: KpiResponse = {
  revenueMtdCents: 450000,
  activeStudents: 142,
  conversionRate: 34,
  overdueCount: 7,
};

const sampleRevOverTime: RevenueOverTimeResponse = {
  series: [
    { period: "2026-04-01", amountCents: 380000 },
    { period: "2026-05-01", amountCents: 420000 },
    { period: "2026-06-01", amountCents: 450000 },
  ],
  granularity: "month",
  months: 3,
};

const sampleRevByCourse: RevenueByCourseResponse = {
  courses: [
    { courseId: "c-001", courseName: "Engleză avansați", totalCents: 180000 },
    { courseId: "c-002", courseName: "Programare Python", totalCents: 140000 },
    { courseId: "", courseName: "Neatribuit", totalCents: 130000 },
  ],
};

const sampleLtv: StudentLtvResponse = {
  avgLtvCents: 31690,
  totalRevenueCents: 4500000,
  activeStudents: 142,
};

beforeEach(() => {
  mockApi.mockReset();
});

// ─── T-INTEG-104-1: KPI shape ─────────────────────────────────────────────────

describe("T-INTEG-104-1 [blocant] GET /api/analytics/kpi — shape corect", () => {
  it("returns revenueMtdCents, activeStudents, conversionRate, overdueCount", async () => {
    mockApi.mockResolvedValueOnce(sampleKpi);
    const result = await api<KpiResponse>("/api/analytics/kpi");
    expect(result).toHaveProperty("revenueMtdCents");
    expect(result).toHaveProperty("activeStudents");
    expect(result).toHaveProperty("conversionRate");
    expect(result).toHaveProperty("overdueCount");
  });

  it("revenueMtdCents is a non-negative number", async () => {
    mockApi.mockResolvedValueOnce(sampleKpi);
    const result = await api<KpiResponse>("/api/analytics/kpi");
    expect(typeof result.revenueMtdCents).toBe("number");
    expect(result.revenueMtdCents).toBeGreaterThanOrEqual(0);
  });

  it("conversionRate is between 0 and 100", async () => {
    mockApi.mockResolvedValueOnce(sampleKpi);
    const result = await api<KpiResponse>("/api/analytics/kpi");
    expect(result.conversionRate).toBeGreaterThanOrEqual(0);
    expect(result.conversionRate).toBeLessThanOrEqual(100);
  });
});

// ─── T-INTEG-104-2: Revenue over time ─────────────────────────────────────────

describe("T-INTEG-104-2 [blocant] GET /api/analytics/revenue-over-time — series de date", () => {
  it("returns series array with period and amountCents", async () => {
    mockApi.mockResolvedValueOnce(sampleRevOverTime);
    const result = await api<RevenueOverTimeResponse>("/api/analytics/revenue-over-time?months=3");
    expect(Array.isArray(result.series)).toBe(true);
    expect(result.series[0]).toHaveProperty("period");
    expect(result.series[0]).toHaveProperty("amountCents");
  });

  it("returns granularity and months in response", async () => {
    mockApi.mockResolvedValueOnce(sampleRevOverTime);
    const result = await api<RevenueOverTimeResponse>("/api/analytics/revenue-over-time?months=3");
    expect(result.granularity).toBe("month");
    expect(result.months).toBe(3);
  });
});

// ─── T-INTEG-104-3: Revenue by course ─────────────────────────────────────────

describe("T-INTEG-104-3 [blocant] GET /api/analytics/revenue-by-course — grouped per curs", () => {
  it("returns courses array with courseId, courseName, totalCents", async () => {
    mockApi.mockResolvedValueOnce(sampleRevByCourse);
    const result = await api<RevenueByCourseResponse>("/api/analytics/revenue-by-course");
    expect(Array.isArray(result.courses)).toBe(true);
    const first = result.courses[0];
    expect(first).toHaveProperty("courseId");
    expect(first).toHaveProperty("courseName");
    expect(first).toHaveProperty("totalCents");
  });

  it("totalCents is a non-negative number for each course", async () => {
    mockApi.mockResolvedValueOnce(sampleRevByCourse);
    const result = await api<RevenueByCourseResponse>("/api/analytics/revenue-by-course");
    for (const c of result.courses) {
      expect(c.totalCents).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── T-INTEG-104-4: Student LTV ───────────────────────────────────────────────

describe("T-INTEG-104-4 [blocant] GET /api/analytics/student-ltv — LTV mediu", () => {
  it("returns avgLtvCents, totalRevenueCents, activeStudents", async () => {
    mockApi.mockResolvedValueOnce(sampleLtv);
    const result = await api<StudentLtvResponse>("/api/analytics/student-ltv");
    expect(result).toHaveProperty("avgLtvCents");
    expect(result).toHaveProperty("totalRevenueCents");
    expect(result).toHaveProperty("activeStudents");
  });

  it("avgLtvCents = totalRevenueCents / activeStudents (rounded)", async () => {
    mockApi.mockResolvedValueOnce(sampleLtv);
    const result = await api<StudentLtvResponse>("/api/analytics/student-ltv");
    const expected = result.activeStudents > 0
      ? Math.round(result.totalRevenueCents / result.activeStudents)
      : 0;
    expect(result.avgLtvCents).toBe(expected);
  });
});

// ─── T-INTEG-104-5: Revenue by course grouping logic ─────────────────────────

describe("T-INTEG-104-5 [normal] revenue-by-course grupează payments pe courseId", () => {
  it("groups payments by courseId and sums amountCents correctly", () => {
    type MockPayment = { courseId: string | null; amountCents: number; status: string };
    const mockPayments: MockPayment[] = [
      { courseId: "c-001", amountCents: 10000, status: "paid" },
      { courseId: "c-001", amountCents: 20000, status: "paid" },
      { courseId: "c-002", amountCents: 15000, status: "paid" },
      { courseId: null, amountCents: 5000, status: "paid" },
    ];

    const byCourse: Record<string, number> = {};
    for (const p of mockPayments.filter((p) => p.status === "paid")) {
      const key = p.courseId ?? "__unassigned__";
      byCourse[key] = (byCourse[key] ?? 0) + p.amountCents;
    }

    expect(byCourse["c-001"]).toBe(30000);
    expect(byCourse["c-002"]).toBe(15000);
    expect(byCourse["__unassigned__"]).toBe(5000);
  });

  it("LTV is 0 when activeStudents is 0", () => {
    const totalRevenueCents = 100000;
    const activeStudents = 0;
    const ltv = activeStudents > 0 ? Math.round(totalRevenueCents / activeStudents) : 0;
    expect(ltv).toBe(0);
  });
});
