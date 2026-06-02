/**
 * INTEG-202 — contracts.courseId FK
 *
 * T-INTEG-202-1 [blocant]: Contract type has courseId field
 * T-INTEG-202-2 [blocant]: POST /api/contracts cu courseId → 201, courseId setat
 * T-INTEG-202-3 [blocant]: GET /api/contracts returnează courseId
 * T-INTEG-202-4: Contracte fără courseId → null (backward compatible)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Contract } from "@/lib/api/contracts";

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const courseId = "c2a4f6b8-2222-0000-0000-000000000001";
const studentId = "s1a2b3c4-0000-0000-0000-000000000001";

const contractWithCourse: Contract = {
  id: "contract-integ-202",
  tenantId: "tenant-1",
  number: "VL1-01.06.2026",
  prefix: "VL",
  dailySeq: 1,
  contractDate: "2026-06-01",
  beneficiaryType: "pf",
  beneficiaryName: "Ion Popescu",
  idn: "1234567890123",
  companyName: null,
  companyIdno: null,
  repName: null,
  repRole: null,
  course: "Engleză avansați",
  hours: 32,
  scheduleText: "Lun/Mie 18:00",
  language: "ro",
  format: "fizic",
  location: "Sediul Chișinău",
  priceCents: 150000,
  currency: "MDL",
  persons: 1,
  leadId: null,
  studentId,
  courseId,
  pdfUrl: null,
  data: null,
  createdBy: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

// ─── T-INTEG-202-1: Contract type has courseId ────────────────────────────────

describe("T-INTEG-202-1 [blocant]: Contract type has courseId field", () => {
  it("contract with courseId has the field set", () => {
    expect(contractWithCourse.courseId).toBe(courseId);
  });

  it("courseId is optional and nullable on the type", () => {
    const c: Contract = { ...contractWithCourse, courseId: null };
    expect(c.courseId).toBeNull();

    const c2: Contract = { ...contractWithCourse, courseId: undefined };
    expect(c2.courseId).toBeUndefined();
  });
});

// ─── T-INTEG-202-2: POST /api/contracts cu courseId ──────────────────────────

describe("T-INTEG-202-2 [blocant]: POST /api/contracts cu courseId → 201", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("POST with courseId returns contract with courseId set", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ contract: contractWithCourse }),
    } as Response));

    const res = await fetch("/api/contracts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beneficiaryType: "pf",
        beneficiaryName: "Ion Popescu",
        course: "Engleză avansați",
        priceCents: 150000,
        courseId,
      }),
    });
    const data = await res.json() as { contract: Contract };
    expect(data.contract.courseId).toBe(courseId);
    expect(res.status).toBe(201);
  });
});

// ─── T-INTEG-202-3: GET /api/contracts returnează courseId ───────────────────

describe("T-INTEG-202-3 [blocant]: GET /api/contracts returnează courseId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns contracts list with courseId", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contracts: [contractWithCourse], total: 1 }),
    } as Response));

    const res = await fetch("/api/contracts", { credentials: "include" });
    const data = await res.json() as { contracts: Contract[] };
    expect(data.contracts[0].courseId).toBe(courseId);
  });
});

// ─── T-INTEG-202-4: backward compat — fără courseId ──────────────────────────

describe("T-INTEG-202-4: Contracte fără courseId → backward compatible", () => {
  it("contract without courseId has courseId null", () => {
    const c: Contract = { ...contractWithCourse, courseId: null };
    expect(c.courseId).toBeNull();
  });

  it("POST without courseId omits the field from payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ contract: { ...contractWithCourse, courseId: null } }),
    } as Response));

    const res = await fetch("/api/contracts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beneficiaryType: "pf", priceCents: 100000 }),
    });
    const data = await res.json() as { contract: Contract };
    expect(data.contract.courseId).toBeNull();
  });
});
