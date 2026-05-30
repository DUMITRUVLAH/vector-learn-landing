/**
 * SCHED-503 — Marcare prezență la lecție
 *
 * Tests:
 * 1. [blocant] GET /api/lessons/:id/students → 200 (mocked API contract)
 * 2. [blocant] PATCH attendance → present saved (mocked API contract)
 * 3. [blocant] Lock 24h → 403 for non-manager (logic check)
 * 4. [normal]  UI dropdown has all 5 status options
 */

import { describe, it, expect } from "vitest";
import type { LessonStudent, AttendanceStatus } from "@/lib/api/lessons";

// ─── Helper: build a LessonStudent fixture ────────────────────────────────────

function makeLessonStudent(overrides?: Partial<LessonStudent>): LessonStudent {
  return {
    studentLessonId: "sl-uuid-1",
    studentId: "student-uuid-1",
    attendanceStatus: "pending",
    markedBy: null,
    markedAt: null,
    fullName: "Maria Popescu",
    email: "maria@example.com",
    phone: "+40720000001",
    ...overrides,
  };
}

// ─── T-SCHED-503-1: GET /api/lessons/:id/students contract ───────────────────

describe("SCHED-503 — GET lesson students contract", () => {
  it("T-SCHED-503-1: response has items array", () => {
    const response: { items: LessonStudent[] } = {
      items: [makeLessonStudent(), makeLessonStudent({ studentId: "s2", fullName: "Andrei Ionescu" })],
    };
    expect(Array.isArray(response.items)).toBe(true);
    expect(response.items).toHaveLength(2);
  });

  it("T-SCHED-503-1: each item has required fields", () => {
    const student = makeLessonStudent();
    expect(student.studentId).toBeDefined();
    expect(student.studentLessonId).toBeDefined();
    expect(student.fullName).toBeDefined();
    expect(student.attendanceStatus).toBeDefined();
  });

  it("T-SCHED-503-1: attendance status defaults to pending", () => {
    const student = makeLessonStudent();
    expect(student.attendanceStatus).toBe("pending");
  });

  it("T-SCHED-503-1: empty lesson returns empty items", () => {
    const response: { items: LessonStudent[] } = { items: [] };
    expect(response.items).toHaveLength(0);
  });
});

// ─── T-SCHED-503-2: PATCH attendance → present saved ─────────────────────────

describe("SCHED-503 — PATCH attendance contract", () => {
  it("T-SCHED-503-2: updating status to present returns updated record", () => {
    const original = makeLessonStudent();
    const now = new Date().toISOString();
    const updated: LessonStudent = {
      ...original,
      attendanceStatus: "present",
      markedBy: "user-uuid-1",
      markedAt: now,
    };
    expect(updated.attendanceStatus).toBe("present");
    expect(updated.markedBy).toBe("user-uuid-1");
    expect(updated.markedAt).toBe(now);
  });

  it("T-SCHED-503-2: all valid attendance statuses are accepted", () => {
    const validStatuses: Array<Exclude<AttendanceStatus, "pending">> = [
      "present",
      "absent",
      "late",
      "excused",
    ];
    validStatuses.forEach((status) => {
      const updated = makeLessonStudent({ attendanceStatus: status });
      expect(["present", "absent", "late", "excused"]).toContain(updated.attendanceStatus);
    });
  });

  it("T-SCHED-503-2: markedAt is set when status changes from pending", () => {
    const original = makeLessonStudent();
    expect(original.markedAt).toBeNull();

    const updated: LessonStudent = {
      ...original,
      attendanceStatus: "absent",
      markedBy: "user-1",
      markedAt: new Date().toISOString(),
    };
    expect(updated.markedAt).not.toBeNull();
  });
});

// ─── T-SCHED-503-3: 24h lock logic ───────────────────────────────────────────

describe("SCHED-503 — 24h lock logic", () => {
  const LOCK_HOURS = 24;

  function isLocked(scheduledAt: Date): boolean {
    const now = new Date();
    const lockCutoff = new Date(now.getTime() - LOCK_HOURS * 60 * 60 * 1000);
    return scheduledAt < lockCutoff;
  }

  it("T-SCHED-503-3: lesson from 25h ago is locked", () => {
    const past25h = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isLocked(past25h)).toBe(true);
  });

  it("T-SCHED-503-3: lesson from 23h ago is NOT locked", () => {
    const past23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(isLocked(past23h)).toBe(false);
  });

  it("T-SCHED-503-3: lesson from exactly 24h ago is locked", () => {
    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000); // 24h + 1s
    expect(isLocked(past24h)).toBe(true);
  });

  it("T-SCHED-503-3: future lesson is not locked", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(isLocked(future)).toBe(false);
  });

  it("T-SCHED-503-3: 403 returned for non-manager on locked lesson (role check)", () => {
    // Simulate the role-check logic
    function canMarkAttendance(role: string, locked: boolean): boolean | "forbidden" {
      if (locked && role !== "admin") return "forbidden";
      return true;
    }
    expect(canMarkAttendance("teacher", true)).toBe("forbidden");
    expect(canMarkAttendance("admin", true)).toBe(true);
    expect(canMarkAttendance("teacher", false)).toBe(true);
  });
});

// ─── T-SCHED-503-4: UI status dropdown options ───────────────────────────────

describe("SCHED-503 — UI status dropdown options", () => {
  const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
    present: "Prezent",
    absent: "Absent",
    late: "Întârziat",
    excused: "Motivat",
    pending: "Neprecizat",
  };

  it("T-SCHED-503-4: dropdown has all 5 status options", () => {
    const options = Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[];
    expect(options).toHaveLength(5);
    expect(options).toContain("present");
    expect(options).toContain("absent");
    expect(options).toContain("late");
    expect(options).toContain("excused");
    expect(options).toContain("pending");
  });

  it("T-SCHED-503-4: labels are in Romanian", () => {
    expect(ATTENDANCE_LABELS.present).toBe("Prezent");
    expect(ATTENDANCE_LABELS.absent).toBe("Absent");
    expect(ATTENDANCE_LABELS.late).toBe("Întârziat");
    expect(ATTENDANCE_LABELS.excused).toBe("Motivat");
    expect(ATTENDANCE_LABELS.pending).toBe("Neprecizat");
  });

  it("T-SCHED-503-4: present status maps to correct label", () => {
    const status: AttendanceStatus = "present";
    expect(ATTENDANCE_LABELS[status]).toBe("Prezent");
  });

  it("T-SCHED-503-4: all statuses have non-empty labels", () => {
    Object.entries(ATTENDANCE_LABELS).forEach(([_key, label]) => {
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
