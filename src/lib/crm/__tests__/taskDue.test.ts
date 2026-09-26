/**
 * CRM-U04 — scadența cu oră („la taskuri să poți pune și ora").
 */
import { describe, it, expect } from "vitest";
import { combineDue, formatDue, isDueOverdue } from "../taskDue";

describe("combineDue", () => {
  it("[blocant] data + ora → ISO la ora aleasă, marcat „cu oră”", () => {
    const d = combineDue("2026-09-27", "14:30");
    expect(d.dueHasTime).toBe(true);
    expect(new Date(d.dueAt as string).getHours()).toBe(14);
    expect(new Date(d.dueAt as string).getMinutes()).toBe(30);
  });
  it("fără oră: prânz, „toată ziua”; fără dată: nimic", () => {
    const d = combineDue("2026-09-27", "");
    expect(d.dueHasTime).toBe(false);
    expect(new Date(d.dueAt as string).getHours()).toBe(12);
    expect(combineDue("", "14:30")).toEqual({ dueAt: null, dueHasTime: false });
  });
});

describe("isDueOverdue", () => {
  const due = combineDue("2026-09-27", "").dueAt as string;
  it("[blocant] un task „toată ziua” NU e restant la ora 15 în chiar ziua lui", () => {
    expect(isDueOverdue(due, false, new Date(2026, 8, 27, 15, 0))).toBe(false);
    expect(isDueOverdue(due, false, new Date(2026, 8, 28, 0, 1))).toBe(true);
  });
  it("[blocant] un task cu oră e restant imediat după ora lui", () => {
    const timed = combineDue("2026-09-27", "14:30").dueAt as string;
    expect(isDueOverdue(timed, true, new Date(2026, 8, 27, 14, 29))).toBe(false);
    expect(isDueOverdue(timed, true, new Date(2026, 8, 27, 14, 31))).toBe(true);
  });
});

describe("formatDue", () => {
  it("arată ora doar când a fost aleasă", () => {
    expect(formatDue(combineDue("2026-09-27", "14:30").dueAt as string, true)).toMatch(/14:30$/);
    expect(formatDue(combineDue("2026-09-27", "").dueAt as string, false)).not.toMatch(/12:00/);
    expect(formatDue(combineDue("2026-09-27", "09:05").dueAt as string, true, "short")).toMatch(/^27\.09, 09:05$/);
  });
});
