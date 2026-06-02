/**
 * SCHED-602 — Teacher substitute tests
 * Tests the substituteTeacher and listAvailableTeachers API functions.
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
import { substituteTeacher, listAvailableTeachers, type Teacher } from "@/lib/api/lessons";

const mockApi = vi.mocked(api);

const baseTeacher: Teacher = {
  id: "teacher-002",
  userId: "user-002",
  hourlyRateCents: 5000,
  commissionPct: 10,
  name: "Mihai S.",
  email: "mihai@school.ro",
};

describe("SCHED-602: Teacher substitute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SCHED602-1: substituteTeacher sends PATCH to correct endpoint", async () => {
    const updatedLesson = {
      id: "lesson-001",
      courseId: "course-001",
      teacherId: "teacher-002",
      scheduledAt: "2026-06-03T09:00:00.000Z",
      durationMinutes: 60,
      status: "scheduled" as const,
      meetingUrl: null,
      notes: null,
      courseName: "Engleză B2",
      courseLevel: "B2",
      teacherName: "Mihai S.",
    };
    mockApi.mockResolvedValueOnce(updatedLesson);

    const result = await substituteTeacher("lesson-001", "teacher-002");

    expect(mockApi).toHaveBeenCalledWith("/api/lessons/lesson-001/substitute", {
      method: "PATCH",
      body: JSON.stringify({ teacherId: "teacher-002" }),
    });
    expect(result.teacherName).toBe("Mihai S.");
  });

  it("T-SCHED602-2: returns 409 when substitute teacher has conflict", async () => {
    const { ApiError } = await import("@/lib/api");
    mockApi.mockRejectedValueOnce(new ApiError(409, "teacher_double_booked"));

    await expect(
      substituteTeacher("lesson-001", "teacher-busy")
    ).rejects.toMatchObject({ code: "teacher_double_booked", status: 409 });
  });

  it("T-SCHED602-3: listAvailableTeachers fetches from correct endpoint", async () => {
    const teachers: Teacher[] = [baseTeacher];
    mockApi.mockResolvedValueOnce({ items: teachers });

    const result = await listAvailableTeachers("lesson-001");

    expect(mockApi).toHaveBeenCalledWith(
      "/api/teachers/available?lessonId=lesson-001"
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("teacher-002");
  });

  it("T-SCHED602-4: returns empty list when all teachers have conflicts", async () => {
    mockApi.mockResolvedValueOnce({ items: [] });

    const result = await listAvailableTeachers("lesson-001");
    expect(result.items).toHaveLength(0);
  });

  it("T-SCHED602-5: substitute with valid teacher updates teacherId", async () => {
    const updatedLesson = {
      id: "lesson-001",
      courseId: "course-001",
      teacherId: "teacher-002",
      scheduledAt: "2026-06-03T09:00:00.000Z",
      durationMinutes: 60,
      status: "scheduled" as const,
      meetingUrl: null,
      notes: null,
      courseName: "Engleză B2",
      courseLevel: "B2",
      teacherName: "Mihai S.",
    };
    mockApi.mockResolvedValueOnce(updatedLesson);

    const result = await substituteTeacher("lesson-001", "teacher-002");
    expect(result.teacherId).toBe("teacher-002");
  });
});
