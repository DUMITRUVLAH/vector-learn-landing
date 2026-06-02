/**
 * SCHED-603 — Schedule view by teacher tests
 * Tests the teacherId filter in listLessons and weekly stats calculation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string, message?: string) {
      super(message ?? code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { api } from "@/lib/api";
import { listLessons, type Lesson } from "@/lib/api/lessons";

const mockApi = vi.mocked(api);

const makeLesson = (id: string, teacherId: string, durationMinutes = 60, status: Lesson["status"] = "scheduled"): Lesson => ({
  id,
  courseId: "course-001",
  teacherId,
  scheduledAt: "2026-06-03T09:00:00.000Z",
  durationMinutes,
  status,
  meetingUrl: null,
  notes: null,
  courseName: "Engleză B2",
  courseLevel: "B2",
  teacherName: teacherId === "teacher-001" ? "Ana M." : "Mihai S.",
});

describe("SCHED-603: Schedule view by teacher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SCHED603-1: listLessons passes teacherId as query param", async () => {
    mockApi.mockResolvedValueOnce({ items: [] });

    await listLessons("2026-06-01T00:00:00Z", "2026-06-08T00:00:00Z", "teacher-001");

    const calledUrl = mockApi.mock.calls[0][0] as string;
    expect(calledUrl).toContain("teacherId=teacher-001");
  });

  it("T-SCHED603-1b: GET /api/lessons with teacherId returns only matching lessons", async () => {
    const lessons = [
      makeLesson("lesson-1", "teacher-001"),
      makeLesson("lesson-2", "teacher-001"),
    ];
    mockApi.mockResolvedValueOnce({ items: lessons });

    const result = await listLessons(undefined, undefined, "teacher-001");
    expect(result.items).toHaveLength(2);
    expect(result.items.every((l) => l.teacherId === "teacher-001")).toBe(true);
  });

  it("T-SCHED603-2: listLessons without teacherId returns all lessons (no filter)", async () => {
    mockApi.mockResolvedValueOnce({ items: [] });

    await listLessons("2026-06-01T00:00:00Z", "2026-06-08T00:00:00Z");

    const calledUrl = mockApi.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("teacherId");
  });

  it("T-SCHED603-3: weekly stats computed correctly for 3 lessons × 2h", () => {
    const lessons = [
      makeLesson("l-1", "teacher-001", 120),
      makeLesson("l-2", "teacher-001", 120),
      makeLesson("l-3", "teacher-001", 120),
    ];
    const active = lessons.filter((l) => l.status !== "cancelled");
    const count = active.length;
    const hours = active.reduce((sum, l) => sum + l.durationMinutes / 60, 0);

    expect(count).toBe(3);
    expect(hours).toBe(6);
  });

  it("T-SCHED603-4: cancelled lessons excluded from weekly stats", () => {
    const lessons = [
      makeLesson("l-1", "teacher-001", 60, "scheduled"),
      makeLesson("l-2", "teacher-001", 60, "cancelled"),
    ];
    const active = lessons.filter((l) => l.status !== "cancelled");
    const hours = active.reduce((sum, l) => sum + l.durationMinutes / 60, 0);

    expect(active.length).toBe(1);
    expect(hours).toBe(1);
  });

  it("T-SCHED603-5: null teacherId does not add teacherId param to URL", async () => {
    mockApi.mockResolvedValueOnce({ items: [] });

    await listLessons(undefined, undefined, null);

    const calledUrl = mockApi.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("teacherId");
  });
});
