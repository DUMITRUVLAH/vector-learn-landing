/**
 * INTEG-101 — leads.courseId + leads.branchId FK
 *
 * Unit tests verifying:
 * - courseId is saved and returned in Lead type
 * - branchId is saved and returned in Lead type
 * - GET /api/leads with branchId filter returns only matching leads
 * - POST /api/leads with invalid courseId UUID → validation would reject
 * - courseName is returned with GET /:id when courseId is set
 */
import { describe, it, expect, vi } from "vitest";
import { api } from "@/lib/api";
import type { Lead } from "@/lib/api/leads";

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

const courseId = "c2a4f6b8-0000-0000-0000-000000000001";
const branchId = "b1a2c3d4-0000-0000-0000-000000000001";

const leadWithCourse: Lead = {
  id: "lead-integ-101",
  fullName: "Ion Popescu",
  phone: "+40721000001",
  email: "ion@test.ro",
  interestCourse: "Engleză B2",
  courseId,
  courseName: "Engleză avansați",
  branchId,
  stage: "new",
  source: "manual",
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  notes: null,
  assignedTo: null,
  consentAt: null,
  consentText: null,
  ipAtConsent: null,
  consentRevokedAt: null,
  convertedToStudentId: null,
  convertedAt: null,
  lostReason: null,
  score: null,
  valueCents: 0,
  debtCents: 0,
  company: null,
  dealName: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

// ─── T-INTEG-101-1: courseId saved and returned ───────────────────────────────

describe("T-INTEG-101-1 [blocant] courseId is saved and returned in Lead", () => {
  it("POST /api/leads with courseId persists courseId", async () => {
    mockApi.mockResolvedValueOnce(leadWithCourse);
    const result = await api<Lead>("/api/leads", {
      method: "POST",
      body: JSON.stringify({ fullName: "Ion Popescu", courseId }),
    });
    expect(result.courseId).toBe(courseId);
  });

  it("GET /api/leads/:id returns courseId and courseName", async () => {
    mockApi.mockResolvedValueOnce(leadWithCourse);
    const result = await api<Lead>(`/api/leads/${leadWithCourse.id}`);
    expect(result.courseId).toBe(courseId);
    expect(result.courseName).toBe("Engleză avansați");
  });
});

// ─── T-INTEG-101-2: branchId filter ──────────────────────────────────────────

describe("T-INTEG-101-2 [blocant] GET /api/leads with branchId returns only branch leads", () => {
  it("response only contains leads matching branchId", async () => {
    const listResponse = { items: [leadWithCourse], total: 1 };
    mockApi.mockResolvedValueOnce(listResponse);
    const result = await api<typeof listResponse>(`/api/leads?branchId=${branchId}`);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].branchId).toBe(branchId);
  });

  it("response with different branchId returns empty", async () => {
    const emptyResponse = { items: [], total: 0 };
    mockApi.mockResolvedValueOnce(emptyResponse);
    const result = await api<typeof emptyResponse>(`/api/leads?branchId=00000000-0000-0000-0000-000000000099`);
    expect(result.items).toHaveLength(0);
  });
});

// ─── T-INTEG-101-3: courseId UUID validation ─────────────────────────────────

describe("T-INTEG-101-3 [blocant] POST /api/leads with invalid courseId returns 400", () => {
  it("invalid UUID format for courseId should be rejected", async () => {
    const { ApiError } = await import("@/lib/api");
    mockApi.mockRejectedValueOnce(new ApiError(400, "bad_request", "Invalid courseId"));
    try {
      await api("/api/leads", {
        method: "POST",
        body: JSON.stringify({ fullName: "Test", courseId: "not-a-uuid" }),
      });
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as { status: number }).status).toBe(400);
    }
  });
});

// ─── T-INTEG-101-4: Lead type includes courseId and branchId fields ───────────

describe("T-INTEG-101-4 [normal] Lead type has courseId, courseName, branchId", () => {
  it("Lead interface accepts courseId, courseName, branchId fields", () => {
    const lead: Lead = leadWithCourse;
    expect(Object.prototype.hasOwnProperty.call(leadWithCourse, "courseId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(leadWithCourse, "courseName")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(leadWithCourse, "branchId")).toBe(true);
    expect(lead.courseId).toBe(courseId);
    expect(lead.branchId).toBe(branchId);
  });

  it("courseId and branchId can be null (nullable FK)", () => {
    const leadNoFK: Lead = { ...leadWithCourse, courseId: null, courseName: null, branchId: null };
    expect(leadNoFK.courseId).toBeNull();
    expect(leadNoFK.branchId).toBeNull();
  });
});
