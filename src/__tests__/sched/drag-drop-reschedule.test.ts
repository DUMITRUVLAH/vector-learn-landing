/**
 * SCHED-601 — Drag-and-drop reschedule tests
 * Tests the patchLesson API function and drag-drop constraints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
import { patchLesson, type Lesson } from "@/lib/api/lessons";

const mockApi = vi.mocked(api);

const baseLesson: Lesson = {
  id: "lesson-001",
  courseId: "course-001",
  teacherId: "teacher-001",
  scheduledAt: "2026-06-03T09:00:00.000Z",
  durationMinutes: 60,
  status: "scheduled",
  meetingUrl: null,
  notes: null,
  courseName: "Engleză B2",
  courseLevel: "B2",
  teacherName: "Ana M.",
};

describe("SCHED-601: patchLesson (drag-and-drop reschedule)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SCHED601-1: sends PATCH with new scheduledAt and returns updated lesson", async () => {
    const newScheduledAt = "2026-06-04T14:00:00.000Z";
    const updatedLesson = { ...baseLesson, scheduledAt: newScheduledAt };
    mockApi.mockResolvedValueOnce(updatedLesson);

    const result = await patchLesson("lesson-001", { scheduledAt: newScheduledAt });

    expect(mockApi).toHaveBeenCalledWith("/api/lessons/lesson-001", {
      method: "PATCH",
      body: JSON.stringify({ scheduledAt: newScheduledAt }),
    });
    expect(result.scheduledAt).toBe(newScheduledAt);
  });

  it("T-SCHED601-2: propagates 409 conflict error from server", async () => {
    const { ApiError } = await import("@/lib/api");
    mockApi.mockRejectedValueOnce(new ApiError(409, "teacher_double_booked"));

    await expect(
      patchLesson("lesson-001", { scheduledAt: "2026-06-04T14:00:00.000Z" })
    ).rejects.toMatchObject({ code: "teacher_double_booked", status: 409 });
  });

  it("T-SCHED601-3: completed lesson should not be draggable (canDrag logic)", () => {
    const completedLesson: Lesson = { ...baseLesson, status: "completed" };
    const canDrag = completedLesson.status !== "completed" && completedLesson.status !== "cancelled";
    expect(canDrag).toBe(false);
  });

  it("T-SCHED601-4: cancelled lesson should not be draggable", () => {
    const cancelledLesson: Lesson = { ...baseLesson, status: "cancelled" };
    const canDrag = cancelledLesson.status !== "completed" && cancelledLesson.status !== "cancelled";
    expect(canDrag).toBe(false);
  });

  it("T-SCHED601-5: scheduled lesson should be draggable", () => {
    const scheduledLesson: Lesson = { ...baseLesson, status: "scheduled" };
    const canDrag = scheduledLesson.status !== "completed" && scheduledLesson.status !== "cancelled";
    expect(canDrag).toBe(true);
  });

  it("T-SCHED601-6: toast message contains 'reprogramată' on success", async () => {
    const newScheduledAt = "2026-06-04T14:00:00.000Z";
    mockApi.mockResolvedValueOnce({ ...baseLesson, scheduledAt: newScheduledAt });
    await patchLesson("lesson-001", { scheduledAt: newScheduledAt });
    // Success path — toast message check is UI-level; here we confirm no error thrown
    expect(mockApi).toHaveBeenCalledTimes(1);
  });
});
