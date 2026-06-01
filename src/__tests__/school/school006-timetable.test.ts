/**
 * SCHOOL-006 — Unit tests for timetable pure logic (server/lib/timetable.ts)
 *
 * T-SCHOOL-006-5: timeOverlap returns true for overlapping intervals
 * T-SCHOOL-006-6: timeOverlap returns false for adjacent intervals
 * Additional: detectConflicts, slotLabel, dayName
 */
import { describe, it, expect } from "vitest";
import {
  timeOverlap,
  detectConflicts,
  slotLabel,
  dayName,
  type SlotLike,
} from "../../../server/lib/timetable";

// ─── T-SCHOOL-006-5 + T-SCHOOL-006-6: timeOverlap ────────────────────────────

describe("timeOverlap", () => {
  it("[normal] T-SCHOOL-006-5: interval suprapuse → true", () => {
    expect(timeOverlap({ start: "08:00", end: "09:00" }, { start: "08:30", end: "09:30" })).toBe(
      true
    );
  });

  it("[normal] T-SCHOOL-006-6: interval adiacent (start=end) → false", () => {
    expect(timeOverlap({ start: "08:00", end: "09:00" }, { start: "09:00", end: "10:00" })).toBe(
      false
    );
  });

  it("[normal] interval adiacent înainte → false", () => {
    expect(timeOverlap({ start: "08:00", end: "09:00" }, { start: "07:00", end: "08:00" })).toBe(
      false
    );
  });

  it("[normal] interval complet inclus → true", () => {
    expect(timeOverlap({ start: "08:00", end: "10:00" }, { start: "08:30", end: "09:30" })).toBe(
      true
    );
  });

  it("[normal] interval care acoperă complet → true", () => {
    expect(timeOverlap({ start: "08:00", end: "09:00" }, { start: "07:00", end: "10:00" })).toBe(
      true
    );
  });

  it("[normal] fără nicio suprapunere → false", () => {
    expect(timeOverlap({ start: "08:00", end: "09:00" }, { start: "10:00", end: "11:00" })).toBe(
      false
    );
  });
});

// ─── detectConflicts ──────────────────────────────────────────────────────────

describe("detectConflicts", () => {
  const baseSlot: SlotLike = {
    id: "slot-1",
    classId: "class-A",
    teacherId: "teacher-X",
    roomId: "room-1",
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "09:00",
  };

  it("[blocant] T-SCHOOL-006-2: conflict profesor — acelaș profesor, aceeaș zi, interval suprapus", () => {
    const newSlot: SlotLike = {
      classId: "class-B",
      teacherId: "teacher-X",
      roomId: "room-2",
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts.some((c) => c.type === "teacher")).toBe(true);
  });

  it("[blocant] T-SCHOOL-006-3: conflict sală — aceeaș sală, aceeaș zi, interval suprapus", () => {
    const newSlot: SlotLike = {
      classId: "class-B",
      teacherId: "teacher-Y",
      roomId: "room-1",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "08:30",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts.some((c) => c.type === "room")).toBe(true);
  });

  it("[normal] conflict clasă — aceeaș clasă, aceeaș zi, interval suprapus", () => {
    const newSlot: SlotLike = {
      classId: "class-A",
      teacherId: "teacher-Y",
      roomId: "room-2",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts.some((c) => c.type === "class")).toBe(true);
  });

  it("[normal] fără conflict pentru zi diferită", () => {
    const newSlot: SlotLike = {
      classId: "class-A",
      teacherId: "teacher-X",
      roomId: "room-1",
      dayOfWeek: 2, // Marți în loc de Luni
      startTime: "08:00",
      endTime: "09:00",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts).toHaveLength(0);
  });

  it("[normal] fără conflict pentru interval adiacent (nesuprapat)", () => {
    const newSlot: SlotLike = {
      classId: "class-A",
      teacherId: "teacher-X",
      roomId: "room-1",
      dayOfWeek: 1,
      startTime: "09:00", // imediat după
      endTime: "10:00",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts).toHaveLength(0);
  });

  it("[normal] nu se conflictează cu sine însuși (PATCH)", () => {
    const newSlotSameId: SlotLike = {
      id: "slot-1", // Același ID
      classId: "class-A",
      teacherId: "teacher-X",
      roomId: "room-1",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
    };
    const conflicts = detectConflicts([baseSlot], newSlotSameId);
    expect(conflicts).toHaveLength(0);
  });

  it("[normal] teacher null → nu generează conflict de profesor", () => {
    const newSlot: SlotLike = {
      classId: "class-B",
      teacherId: null, // fără profesor
      roomId: "room-2",
      dayOfWeek: 1,
      startTime: "08:30",
      endTime: "09:30",
    };
    const conflicts = detectConflicts([baseSlot], newSlot);
    expect(conflicts.some((c) => c.type === "teacher")).toBe(false);
  });
});

// ─── slotLabel + dayName ──────────────────────────────────────────────────────

describe("slotLabel", () => {
  it("formatează corect: Luni 08:00–09:00", () => {
    expect(slotLabel(1, "08:00", "09:00")).toBe("Luni 08:00–09:00");
  });

  it("formatează Vineri 14:00–15:00", () => {
    expect(slotLabel(5, "14:00", "15:00")).toBe("Vineri 14:00–15:00");
  });

  it("formatează Sâmbătă", () => {
    expect(slotLabel(6, "09:00", "10:00")).toBe("Sâmbătă 09:00–10:00");
  });
});

describe("dayName", () => {
  it("1 → Luni", () => expect(dayName(1)).toBe("Luni"));
  it("2 → Marți", () => expect(dayName(2)).toBe("Marți"));
  it("5 → Vineri", () => expect(dayName(5)).toBe("Vineri"));
  it("6 → Sâmbătă", () => expect(dayName(6)).toBe("Sâmbătă"));
  it("ziua necunoscută → Ziua N", () => expect(dayName(7)).toBe("Ziua 7"));
});
