/**
 * SCHOOL-006 — Funcții pure pentru orarul master
 *
 * Toate funcțiile sunt pure (fără DB) — ușor de testat în vitest.
 */

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type ConflictType = "teacher" | "room" | "class";

export interface SlotLike {
  id?: string;
  classId: string;
  teacherId?: string | null;
  roomId?: string | null;
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export interface TimetableConflict {
  type: ConflictType;
  /** ID-ul slotului existent cu care există conflict (undefined pentru slot nou fără id) */
  conflictingSlotId?: string;
  message: string;
}

// ─── Overlap de timp ──────────────────────────────────────────────────────────

/**
 * Returnează true dacă intervalele [a.start, a.end) și [b.start, b.end) se suprapun.
 * Adiacent (a.end == b.start) NU este overlap.
 *
 * Exemple:
 *   timeOverlap("08:00","09:00", "08:30","09:30") → true
 *   timeOverlap("08:00","09:00", "09:00","10:00") → false  (adiacent)
 *   timeOverlap("08:00","09:00", "07:00","08:00") → false  (adiacent înainte)
 */
export function timeOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string }
): boolean {
  return a.start < b.end && b.start < a.end;
}

// ─── Detectare conflicte ──────────────────────────────────────────────────────

/**
 * Detectează conflicte pentru un slot nou propus față de o listă de sloturi existente.
 * Ignoră slotul cu `id === newSlot.id` (util la PATCH — nu se conflictează cu sine însuși).
 *
 * Tipuri de conflict:
 *   - teacher: același profesor, aceeași zi, interval suprapus
 *   - room: aceeași sală (non-null), aceeași zi, interval suprapus
 *   - class: aceeași clasă, aceeași zi, interval suprapus
 */
export function detectConflicts(
  existingSlots: SlotLike[],
  newSlot: SlotLike
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];

  for (const slot of existingSlots) {
    // Nu verificăm slotul față de sine însuși (la PATCH)
    if (slot.id && newSlot.id && slot.id === newSlot.id) continue;

    // Trebuie să fie aceeași zi ca să existe conflict
    if (slot.dayOfWeek !== newSlot.dayOfWeek) continue;

    const newInterval = { start: newSlot.startTime, end: newSlot.endTime };
    const existInterval = { start: slot.startTime, end: slot.endTime };

    if (!timeOverlap(newInterval, existInterval)) continue;

    // Conflict profesor
    if (
      newSlot.teacherId &&
      slot.teacherId &&
      newSlot.teacherId === slot.teacherId
    ) {
      conflicts.push({
        type: "teacher",
        conflictingSlotId: slot.id,
        message: `Profesorul este deja ocupat ${dayName(newSlot.dayOfWeek)} ${slotTimeLabel(slot.startTime, slot.endTime)}`,
      });
    }

    // Conflict sală
    if (
      newSlot.roomId &&
      slot.roomId &&
      newSlot.roomId === slot.roomId
    ) {
      conflicts.push({
        type: "room",
        conflictingSlotId: slot.id,
        message: `Sala este deja ocupată ${dayName(newSlot.dayOfWeek)} ${slotTimeLabel(slot.startTime, slot.endTime)}`,
      });
    }

    // Conflict clasă (aceeași clasă nu poate fi în două locuri simultan)
    if (newSlot.classId === slot.classId) {
      conflicts.push({
        type: "class",
        conflictingSlotId: slot.id,
        message: `Clasa are deja o oră programată ${dayName(newSlot.dayOfWeek)} ${slotTimeLabel(slot.startTime, slot.endTime)}`,
      });
    }
  }

  return conflicts;
}

// ─── Etichete ─────────────────────────────────────────────────────────────────

/**
 * Numele zilei săptămânii în română.
 * 1=Luni, 2=Marți, 3=Miercuri, 4=Joi, 5=Vineri, 6=Sâmbătă
 */
export function dayName(dow: number): string {
  const DAYS: Record<number, string> = {
    1: "Luni",
    2: "Marți",
    3: "Miercuri",
    4: "Joi",
    5: "Vineri",
    6: "Sâmbătă",
  };
  return DAYS[dow] ?? `Ziua ${dow}`;
}

/**
 * Eticheta intervalului orar: „08:00–09:00"
 */
export function slotTimeLabel(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

/**
 * Eticheta completă a slotului: „Luni 08:00–09:00"
 */
export function slotLabel(dayOfWeek: number, startTime: string, endTime: string): string {
  return `${dayName(dayOfWeek)} ${slotTimeLabel(startTime, endTime)}`;
}
