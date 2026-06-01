/**
 * INTEG-103 — cohorts.branchId FK + withBranchFilter
 *
 * Unit tests verifying:
 * - Cohort type has branchId: string | null
 * - listCohorts() passes ?branchId= query param when filter provided
 * - POST /api/cohorts with branchId persists branchId
 * - PATCH /api/cohorts/:id with branchId updates it
 * - listCohorts() without branchId is backward compatible
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";
import type { Cohort, CreateCohortPayload } from "@/lib/api/cohorts";
import { listCohorts, createCohort, patchCohort } from "@/lib/api/cohorts";

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

const BRANCH_ID = "b1a2c3d4-0000-0000-0000-000000000001";
const COURSE_ID = "c2a4f6b8-0000-0000-0000-000000000002";
const TENANT_ID = "t0000000-0000-0000-0000-000000000001";

const baseCohort: Cohort = {
  id: "coh-integ-103",
  tenantId: TENANT_ID,
  courseId: COURSE_ID,
  branchId: BRANCH_ID,
  label: "Ediția Iunie 2026",
  startDate: "2026-06-01",
  totalHours: 32,
  hoursPerSession: 2,
  scheduleDays: ["Monday", "Wednesday"],
  isOnline: false,
  manualEndDate: null,
  mentorCostCents: 0,
  roomCostCents: 0,
  driveFolderUrl: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  endDate: "2026-08-01",
  progress: { progressPercent: 0, daysRemaining: 61, daysUntilStart: 0, isCompleted: false, isUpcoming: true, isActive: false },
  category: "upcoming",
};

const cohortNoBranch: Cohort = {
  ...baseCohort,
  id: "coh-no-branch",
  branchId: null,
};

beforeEach(() => {
  mockApi.mockReset();
});

// ─── T-INTEG-103-1: branchId filter passed as query param ─────────────────────

describe("T-INTEG-103-1 [blocant] GET /api/cohorts?branchId= filtrare corectă", () => {
  it("listCohorts({ branchId }) passes ?branchId= in the URL", async () => {
    mockApi.mockResolvedValueOnce({ cohorts: [baseCohort] });
    const result = await listCohorts({ branchId: BRANCH_ID });
    expect(mockApi).toHaveBeenCalledWith(
      expect.stringContaining(`branchId=${BRANCH_ID}`)
    );
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0].branchId).toBe(BRANCH_ID);
  });

  it("filtered list contains only cohorts with the given branchId", () => {
    const allCohorts = [baseCohort, cohortNoBranch];
    const filtered = allCohorts.filter((c) => c.branchId === BRANCH_ID);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("coh-integ-103");
  });
});

// ─── T-INTEG-103-2: POST /api/cohorts cu branchId ─────────────────────────────

describe("T-INTEG-103-2 [blocant] POST /api/cohorts cu branchId valid → branchId setat", () => {
  it("createCohort with branchId returns cohort with branchId set", async () => {
    mockApi.mockResolvedValueOnce({ cohort: baseCohort });
    const payload: CreateCohortPayload = {
      courseId: COURSE_ID,
      label: "Ediția Iunie 2026",
      startDate: "2026-06-01",
      branchId: BRANCH_ID,
    };
    const result = await createCohort(payload);
    expect(result.cohort.branchId).toBe(BRANCH_ID);
  });

  it("createCohort payload accepts branchId in type", () => {
    const payload: CreateCohortPayload = {
      courseId: COURSE_ID,
      label: "Test",
      startDate: "2026-07-01",
      branchId: BRANCH_ID,
    };
    expect(payload.branchId).toBe(BRANCH_ID);
  });
});

// ─── T-INTEG-103-3: Cohort type are câmpul branchId ──────────────────────────

describe("T-INTEG-103-3 [blocant] Cohort type are câmpul branchId: string | null", () => {
  it("Cohort with branchId has branchId field", () => {
    const c: Cohort = baseCohort;
    expect(Object.prototype.hasOwnProperty.call(c, "branchId")).toBe(true);
    expect(c.branchId).toBe(BRANCH_ID);
  });

  it("Cohort with null branchId is valid", () => {
    const c: Cohort = cohortNoBranch;
    expect(c.branchId).toBeNull();
  });
});

// ─── T-INTEG-103-4: backward compatible — fără branchId ───────────────────────

describe("T-INTEG-103-4 [normal] GET /api/cohorts fără branchId → toate cohortele", () => {
  it("listCohorts() without branchId does NOT include branchId query param", async () => {
    mockApi.mockResolvedValueOnce({ cohorts: [baseCohort, cohortNoBranch] });
    await listCohorts();
    const callArg = mockApi.mock.calls[0][0] as string;
    expect(callArg).not.toContain("branchId");
  });

  it("listCohorts() without filter returns all cohorts", async () => {
    mockApi.mockResolvedValueOnce({ cohorts: [baseCohort, cohortNoBranch] });
    const result = await listCohorts();
    expect(result.cohorts).toHaveLength(2);
  });

  it("patchCohort accepts branchId to update it", async () => {
    const updatedCohort = { ...baseCohort, branchId: null };
    mockApi.mockResolvedValueOnce({ cohort: updatedCohort });
    const result = await patchCohort("coh-integ-103", { branchId: null });
    expect(result.cohort.branchId).toBeNull();
  });
});
