/**
 * TB-001: helper-e de date (Date nativ, fără date-fns) — logică pură.
 * T-TB1-DAT-1 [blocant] addDays peste granițe de lună/an (inclusiv offset negativ — șabloane)
 * T-TB1-DAT-2 [blocant] scheduling-ul din șablon: dueDate = ancoră + offsetDays
 * T-TB1-DAT-3 [blocant] isOverdue: doar termen trecut și status ≠ done
 */
import { describe, it, expect } from "vitest";
import { addDays, isOverdue, todayIso, formatDateRo } from "@/lib/board/dates";

describe("TB-001 dates — native Date helpers", () => {
  it("T-TB1-DAT-1 [blocant] addDays crosses month/year boundaries", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // An bisect: 2028 e bisect.
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
  });

  it("T-TB1-DAT-2 [blocant] template offset math (-30 before start, +7 after)", () => {
    // Exact cazul din plan: start 2026-09-14, offset -14 → 2026-08-31.
    const start = "2026-09-14";
    expect(addDays(start, -14)).toBe("2026-08-31");
    expect(addDays(start, -30)).toBe("2026-08-15");
    expect(addDays(start, 7)).toBe("2026-09-21");
  });

  it("T-TB1-DAT-3 [blocant] isOverdue only for past due + not done", () => {
    const yesterday = addDays(todayIso(), -1);
    const tomorrow = addDays(todayIso(), 1);
    expect(isOverdue(yesterday, "todo")).toBe(true);
    expect(isOverdue(yesterday, "in_progress")).toBe(true);
    expect(isOverdue(yesterday, "done")).toBe(false); // done nu mai e întârziat
    expect(isOverdue(tomorrow, "todo")).toBe(false);
    expect(isOverdue(todayIso(), "todo")).toBe(false); // azi nu e încă depășit
    expect(isOverdue(null, "todo")).toBe(false); // fără termen = fără întârziere
  });

  it("T-TB1-DAT-4 formatDateRo renders Romanian short date and dash for null", () => {
    expect(formatDateRo(null)).toBe("—");
    expect(formatDateRo("2026-09-14")).toMatch(/14/);
    expect(formatDateRo("2026-09-14")).toMatch(/2026/);
  });
});
