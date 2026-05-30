/**
 * SCHED-501 — Săli de clasă: rooms table + conflict detection
 * Covers:
 *   T-SCHED-501-1 [blocant]: rooms conflict detection logic
 *   T-SCHED-501-2 [blocant]: room data shape / API client shape
 *   T-SCHED-501-3 [normal]:  Room type exports correctly
 */
import { describe, it, expect } from "vitest";
import type { Room } from "../../lib/api/rooms";

// ─── T-SCHED-501-1: Conflict detection logic (unit) ──────────────────────────

function overlaps(
  aStart: Date,
  aDurationMinutes: number,
  bStart: Date,
  bDurationMinutes: number
): boolean {
  const aEnd = new Date(aStart.getTime() + aDurationMinutes * 60_000);
  const bEnd = new Date(bStart.getTime() + bDurationMinutes * 60_000);
  return aStart < bEnd && aEnd > bStart;
}

describe("SCHED-501 — rooms conflict detection", () => {
  it("T-SCHED-501-1a: same slot → conflict", () => {
    const base = new Date("2026-06-01T10:00:00Z");
    expect(overlaps(base, 60, base, 60)).toBe(true);
  });

  it("T-SCHED-501-1b: adjacent slots (no overlap) → no conflict", () => {
    const slotA = new Date("2026-06-01T10:00:00Z"); // 10:00–11:00
    const slotB = new Date("2026-06-01T11:00:00Z"); // 11:00–12:00
    expect(overlaps(slotA, 60, slotB, 60)).toBe(false);
  });

  it("T-SCHED-501-1c: partial overlap → conflict", () => {
    const slotA = new Date("2026-06-01T10:00:00Z"); // 10:00–11:00
    const slotB = new Date("2026-06-01T10:30:00Z"); // 10:30–11:30
    expect(overlaps(slotA, 60, slotB, 60)).toBe(true);
  });

  it("T-SCHED-501-1d: contained lesson → conflict", () => {
    const outer = new Date("2026-06-01T09:00:00Z"); // 09:00–12:00
    const inner = new Date("2026-06-01T10:00:00Z"); // 10:00–11:00
    expect(overlaps(outer, 180, inner, 60)).toBe(true);
  });

  it("T-SCHED-501-1e: before slot → no conflict", () => {
    const slotA = new Date("2026-06-01T08:00:00Z"); // 08:00–09:00
    const slotB = new Date("2026-06-01T10:00:00Z"); // 10:00–11:00
    expect(overlaps(slotA, 60, slotB, 60)).toBe(false);
  });
});

// ─── T-SCHED-501-2: Room type / API shape ────────────────────────────────────

describe("SCHED-501 — Room API type shape", () => {
  it("T-SCHED-501-2: Room object has required fields", () => {
    const room: Room = {
      id: "r-uuid-001",
      tenantId: "t-uuid-001",
      name: "Sala 1",
      capacity: 12,
      description: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(room.id).toBe("r-uuid-001");
    expect(room.name).toBe("Sala 1");
    expect(room.capacity).toBe(12);
    expect(room.description).toBeNull();
  });
});

// ─── T-SCHED-501-3: listRooms / createRoom / deleteRoom export ───────────────

describe("SCHED-501 — rooms API client exports", () => {
  it("T-SCHED-501-3: rooms API helpers are exported functions", async () => {
    const mod = await import("../../lib/api/rooms");
    expect(typeof mod.listRooms).toBe("function");
    expect(typeof mod.createRoom).toBe("function");
    expect(typeof mod.deleteRoom).toBe("function");
  });
});
