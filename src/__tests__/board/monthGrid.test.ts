/**
 * TB-003: grila lunară a Calendarului — logică pură (Date nativ).
 * T-TB3-CAL-1 [blocant] 42 celule, săptămâna începe LUNI, toate zilele lunii prezente
 * T-TB3-CAL-2 [blocant] plasare corectă: prima zi a lunii cade pe coloana corectă
 * T-TB3-CAL-3 [blocant] shiftMonth peste granițe de an (dec→ian, ian→dec)
 * T-TB3-CAL-4 [normal] celulele de umplutură au inMonth=false
 */
import { describe, it, expect } from "vitest";
import { buildMonthGrid, shiftMonth, monthLabelRo } from "@/lib/board/dates";

describe("TB-003 month grid", () => {
  it("T-TB3-CAL-1 [blocant] 42 cells, Monday start, full month covered", () => {
    // Septembrie 2026: 1 sept. e MARȚI → prima celulă e luni 31 aug.
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid[0].iso).toBe("2026-08-31");
    const inMonth = grid.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30); // septembrie are 30 de zile
    expect(inMonth[0].iso).toBe("2026-09-01");
    expect(inMonth[29].iso).toBe("2026-09-30");
  });

  it("T-TB3-CAL-2 [blocant] first-of-month lands on the correct weekday column", () => {
    // 1 sept. 2026 = marți → index 1 în rândul întâi (0=luni).
    const grid = buildMonthGrid(2026, 9);
    expect(grid[1].iso).toBe("2026-09-01");
    // Iunie 2026: 1 iunie e LUNI → chiar prima celulă, fără umplutură.
    const june = buildMonthGrid(2026, 6);
    expect(june[0].iso).toBe("2026-06-01");
    expect(june[0].inMonth).toBe(true);
    // Februarie 2026 (28 zile, 1 feb = duminică) → offset 6.
    const feb = buildMonthGrid(2026, 2);
    expect(feb[6].iso).toBe("2026-02-01");
    expect(feb.filter((c) => c.inMonth)).toHaveLength(28);
  });

  it("T-TB3-CAL-3 [blocant] shiftMonth crosses year boundaries", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual([2027, 1]);
    expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
    expect(shiftMonth(2026, 6, 0)).toEqual([2026, 6]);
    expect(shiftMonth(2026, 1, 13)).toEqual([2027, 2]);
  });

  it("T-TB3-CAL-4 [normal] filler cells flagged + month label in Romanian", () => {
    const grid = buildMonthGrid(2026, 9);
    // Prima celulă (31 aug.) și ultimele (octombrie) sunt umplutură.
    expect(grid[0].inMonth).toBe(false);
    expect(grid[41].inMonth).toBe(false);
    expect(monthLabelRo(2026, 9)).toMatch(/septembrie/i);
    expect(monthLabelRo(2026, 9)).toMatch(/2026/);
  });
});
