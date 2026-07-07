/**
 * TB-001: poziționarea fracționată (stil Trello) — logică pură.
 * T-TB1-POS-1 [blocant] mijlocul dintre doi vecini
 * T-TB1-POS-2 [blocant] capete lipsă (primul/ultimul element)
 * T-TB1-POS-3 [blocant] underflow-ul de gap semnalează rebalansarea
 */
import { describe, it, expect } from "vitest";
import {
  positionBetween,
  positionAtEnd,
  needsRebalance,
  POSITION_STEP,
  MIN_GAP,
} from "@/lib/board/position";

describe("TB-001 position — fractional indexing", () => {
  it("T-TB1-POS-1 [blocant] between two neighbours = midpoint", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("T-TB1-POS-2 [blocant] missing neighbours (start/end/empty)", () => {
    // Listă goală → primul element primește pasul standard.
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    // Plasare înaintea primului element → jumătatea lui.
    expect(positionBetween(null, 1024)).toBe(512);
    // Plasare după ultimul → ultimul + pas.
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_STEP);
  });

  it("T-TB1-POS-2b positionAtEnd ignores order and empty sets", () => {
    expect(positionAtEnd([])).toBe(POSITION_STEP);
    expect(positionAtEnd([3072, 1024, 2048])).toBe(3072 + POSITION_STEP);
  });

  it("T-TB1-POS-3 [blocant] gap underflow triggers rebalance signal", () => {
    // Înjumătățiri repetate: gap-ul scade sub MIN_GAP → rebalansare necesară.
    const prev = 0;
    let next = 1024;
    for (let i = 0; i < 30; i++) next = positionBetween(prev, next);
    expect(next - prev).toBeLessThan(MIN_GAP);
    expect(needsRebalance([prev, next, 2048])).toBe(true);
    // Poziții sănătoase → nu se rebalansează.
    expect(needsRebalance([1024, 2048, 3072])).toBe(false);
    // Ordinea de intrare nu contează (se sortează intern).
    expect(needsRebalance([3072, 1024, 1024 + MIN_GAP / 2])).toBe(true);
  });
});
