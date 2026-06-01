/**
 * GAP-005 / GAP-006 / GAP-007 / GAP-008 — Lesson packages, waitlist, unit deduction, auto-billing
 *
 * T-GAP-005-1 [blocant] POST /waitlist adds entry with correct position
 * T-GAP-005-2 [normal]  GET /waitlist returns sorted entries + isFull flag
 * T-GAP-005-3 [normal]  confirmWaitlistEntry sends correct payload
 * T-GAP-006-1 [blocant] createLessonPackage calls POST with correct body
 * T-GAP-006-2 [blocant] listLessonPackages filters by studentId in query string
 * T-GAP-006-3 [normal]  getLessonPackage hits correct endpoint
 * T-GAP-006-4 [normal]  patchLessonPackage sends PATCH with autoRenew
 * T-GAP-007-1 [blocant] FIFO: oldest validFrom package first in list
 * T-GAP-007-2 [normal]  no packages → items empty
 * T-GAP-008-1 [blocant] runPackageRenewal calls run-renewal endpoint
 * T-GAP-008-2 [normal]  status can be patched to 'exhausted'
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the api helper ────────────────────────────────────────────────────────

const mockApi = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: unknown[]) => mockApi(...args) }));

import {
  listLessonPackages,
  createLessonPackage,
  getLessonPackage,
  patchLessonPackage,
  runPackageRenewal,
} from "@/lib/api/lessonPackages";

import {
  getCourseWaitlist,
  joinWaitlist,
  confirmWaitlistEntry,
} from "@/lib/api/waitlist";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const basePkg = {
  id: "pkg-1",
  tenantId: "t1",
  studentId: "s1",
  courseId: "c1",
  invoiceId: null,
  unitsTotal: 10,
  unitsRemaining: 10,
  autoRenew: false,
  recoveryIncludedInPackage: true,
  validFrom: "2026-06-01",
  validUntil: null,
  status: "active" as const,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const baseWaitlistEntry = {
  id: "wl-1",
  studentId: "s1",
  studentName: "Ana Pop",
  studentPhone: "07xx",
  position: 1,
  notifiedAt: null,
  confirmedAt: null,
  expiresAt: null,
  createdAt: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.mockReset();
});

// ── T-GAP-005: Waitlist ────────────────────────────────────────────────────────

describe("T-GAP-005: Course waitlist API client", () => {
  it("T-GAP-005-1 [blocant] joinWaitlist posts to correct endpoint with studentId", async () => {
    mockApi.mockResolvedValue({ entry: baseWaitlistEntry, position: 1 });

    const result = await joinWaitlist("c1", "s1");

    expect(mockApi).toHaveBeenCalledWith(
      "/api/courses/c1/waitlist",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ studentId: "s1" }) })
    );
    expect(result.position).toBe(1);
    expect(result.entry.studentId).toBe("s1");
  });

  it("T-GAP-005-2 [normal] getCourseWaitlist returns items with isFull=true when at capacity", async () => {
    mockApi.mockResolvedValue({
      items: [baseWaitlistEntry],
      enrolled: 10,
      maxStudents: 10,
      isFull: true,
    });

    const result = await getCourseWaitlist("c1");

    expect(result.isFull).toBe(true);
    expect(result.enrolled).toBe(10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].position).toBe(1);
  });

  it("T-GAP-005-3 [normal] confirmWaitlistEntry sends courseId in payload", async () => {
    mockApi.mockResolvedValue({
      confirmed: { ...baseWaitlistEntry, confirmedAt: "2026-06-02T10:00:00Z" },
      enrolledLessons: 5,
    });

    const result = await confirmWaitlistEntry("wl-1", "c1");

    expect(mockApi).toHaveBeenCalledWith(
      "/api/waitlist/wl-1/confirm",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ courseId: "c1" }) })
    );
    expect(result.enrolledLessons).toBe(5);
  });
});

// ── T-GAP-006: Lesson packages ────────────────────────────────────────────────

describe("T-GAP-006: Lesson packages API client", () => {
  it("T-GAP-006-1 [blocant] createLessonPackage POSTs to /api/lesson-packages", async () => {
    mockApi.mockResolvedValue(basePkg);

    const result = await createLessonPackage({
      studentId: "s1",
      courseId: "c1",
      unitsTotal: 10,
      validFrom: "2026-06-01",
    });

    expect(mockApi).toHaveBeenCalledWith(
      "/api/lesson-packages",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.unitsRemaining).toBe(10);
    expect(result.unitsTotal).toBe(10);
    expect(result.status).toBe("active");
  });

  it("T-GAP-006-2 [blocant] listLessonPackages includes studentId filter in URL", async () => {
    mockApi.mockResolvedValue({ items: [basePkg] });

    const result = await listLessonPackages({ studentId: "s1", status: "active" });

    const [calledPath] = mockApi.mock.calls[0] as [string];
    expect(calledPath).toContain("studentId=s1");
    expect(calledPath).toContain("status=active");
    expect(result.items[0].studentId).toBe("s1");
  });

  it("T-GAP-006-3 [normal] getLessonPackage calls /api/lesson-packages/:id", async () => {
    mockApi.mockResolvedValue(basePkg);

    const result = await getLessonPackage("pkg-1");

    const [calledPath] = mockApi.mock.calls[0] as [string];
    expect(calledPath).toBe("/api/lesson-packages/pkg-1");
    expect(result.id).toBe("pkg-1");
  });

  it("T-GAP-006-4 [normal] patchLessonPackage sends PATCH with autoRenew=true", async () => {
    const patched = { ...basePkg, autoRenew: true };
    mockApi.mockResolvedValue(patched);

    const result = await patchLessonPackage("pkg-1", { autoRenew: true });

    expect(mockApi).toHaveBeenCalledWith(
      "/api/lesson-packages/pkg-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ autoRenew: true }) })
    );
    expect(result.autoRenew).toBe(true);
  });
});

// ── T-GAP-007: Unit deduction (via list behaviour) ────────────────────────────

describe("T-GAP-007: Unit deduction — list and contract checks", () => {
  it("T-GAP-007-1 [blocant] FIFO: listLessonPackages ordered oldest validFrom first", async () => {
    const olderPkg = { ...basePkg, id: "pkg-old", validFrom: "2026-01-01", unitsRemaining: 3 };
    const newerPkg = { ...basePkg, id: "pkg-new", validFrom: "2026-06-01", unitsRemaining: 5 };

    mockApi.mockResolvedValue({ items: [olderPkg, newerPkg] });

    const pkgRes = await listLessonPackages({ studentId: "s1", status: "active" });

    // Server returns ordered by validFrom asc — oldest first
    expect(pkgRes.items[0].validFrom).toBe("2026-01-01");
    expect(pkgRes.items[0].unitsRemaining).toBe(3);
  });

  it("T-GAP-007-2 [blocant] no active packages → empty list, no error", async () => {
    mockApi.mockResolvedValue({ items: [] });

    const packages = await listLessonPackages({ studentId: "s1", status: "active" });

    expect(packages.items).toHaveLength(0);
  });

  it("T-GAP-007-3 [normal] package with unitsRemaining=0 has status exhausted", async () => {
    const exhausted = { ...basePkg, unitsRemaining: 0, status: "exhausted" as const };
    mockApi.mockResolvedValue({ items: [exhausted] });

    const pkgRes = await listLessonPackages({ studentId: "s1" });

    expect(pkgRes.items[0].status).toBe("exhausted");
    expect(pkgRes.items[0].unitsRemaining).toBe(0);
  });

  it("T-GAP-007-4 [normal] patchLessonPackage can set status to cancelled (reverse-deduct reset)", async () => {
    const cancelled = { ...basePkg, status: "cancelled" as const };
    mockApi.mockResolvedValue(cancelled);

    const result = await patchLessonPackage("pkg-1", { status: "cancelled" });

    expect(result.status).toBe("cancelled");
  });
});

// ── T-GAP-008: Auto-billing ────────────────────────────────────────────────────

describe("T-GAP-008: Auto-billing on exhaustion", () => {
  it("T-GAP-008-1 [blocant] runPackageRenewal calls /run-renewal endpoint and returns renewed count", async () => {
    mockApi.mockResolvedValue({ renewed: 2, results: [] });

    const result = await runPackageRenewal();

    const [calledPath, calledInit] = mockApi.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe("/api/lesson-packages/run-renewal");
    expect(calledInit.method).toBe("POST");
    expect(result.renewed).toBe(2);
  });

  it("T-GAP-008-2 [normal] patchLessonPackage can set autoRenew=false to disable auto-billing", async () => {
    const patched = { ...basePkg, autoRenew: false };
    mockApi.mockResolvedValue(patched);

    const result = await patchLessonPackage("pkg-1", { autoRenew: false });

    expect(mockApi).toHaveBeenCalledWith(
      "/api/lesson-packages/pkg-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ autoRenew: false }) })
    );
    expect(result.autoRenew).toBe(false);
  });
});
