/**
 * TB-004: planGeneratedTasks — logica pură de generare din șablon.
 *
 * T-TB4-GEN-1 [blocant] offset negativ/pozitiv față de start: dueDate = start + offsetDays
 * T-TB4-GEN-2 [blocant] ancora "end" folosește endDate; ancoră lipsă → dueDate null + unscheduledCount
 * T-TB4-GEN-3 [blocant] defaultListName: match case-insensitive; nume necunoscut → prima listă;
 *   fără liste → null (Neîncadrate)
 * T-TB4-GEN-4 [normal] pozițiile cresc din basePosition; ordinea itemelor după position
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { planGeneratedTasks, addDaysIso } from "../../lib/board/templateGenerate";
import type { TemplateItemInput, ListRef } from "../../lib/board/templateGenerate";

function mkItem(over: Partial<TemplateItemInput>): TemplateItemInput {
  return {
    id: "it-1",
    title: "Task",
    description: null,
    assigneeRole: null,
    defaultPriority: "normal",
    offsetAnchor: "start",
    offsetDays: 0,
    defaultListName: null,
    position: 1024,
    ...over,
  };
}

const LISTS: ListRef[] = [
  { id: "l-backlog", name: "Backlog", position: 1024 },
  { id: "l-gata", name: "Gata", position: 4096 },
];

const PRODUCT = { startDate: "2026-09-14", endDate: "2026-12-15" };

describe("TB-004: planGeneratedTasks", () => {
  it("T-TB4-GEN-1 [blocant] signed offsets from startDate", () => {
    const { tasks, unscheduledCount } = planGeneratedTasks(
      [
        mkItem({ id: "a", offsetDays: -30, position: 1 }),
        mkItem({ id: "b", offsetDays: -14, position: 2 }),
        mkItem({ id: "c", offsetDays: 0, position: 3 }),
        mkItem({ id: "d", offsetDays: 7, position: 4 }),
      ],
      PRODUCT,
      LISTS,
      0
    );
    expect(tasks.map((t) => t.dueDate)).toEqual([
      "2026-08-15", // -30
      "2026-08-31", // -14 (trece granița de lună)
      "2026-09-14", // 0
      "2026-09-21", // +7
    ]);
    expect(unscheduledCount).toBe(0);
  });

  it("T-TB4-GEN-2 [blocant] end anchor + missing anchor → unscheduled", () => {
    const { tasks } = planGeneratedTasks(
      [mkItem({ id: "a", offsetAnchor: "end", offsetDays: 3 })],
      PRODUCT,
      LISTS,
      0
    );
    expect(tasks[0].dueDate).toBe("2026-12-18");

    // Produs fără endDate → itemul cu ancoră "end" rămâne neprogramat.
    const noEnd = planGeneratedTasks(
      [mkItem({ id: "a", offsetAnchor: "end" }), mkItem({ id: "b", offsetAnchor: "start", position: 2048 })],
      { startDate: "2026-09-14", endDate: null },
      LISTS,
      0
    );
    expect(noEnd.tasks[0].dueDate).toBeNull();
    expect(noEnd.tasks[1].dueDate).toBe("2026-09-14");
    expect(noEnd.unscheduledCount).toBe(1);

    // Fără produs deloc → totul neprogramat (rămâne de planificat manual în Tabel).
    const noProduct = planGeneratedTasks([mkItem({ id: "a" })], null, LISTS, 0);
    expect(noProduct.tasks[0].dueDate).toBeNull();
    expect(noProduct.unscheduledCount).toBe(1);
  });

  it("T-TB4-GEN-3 [blocant] list matching: case-insensitive, fallback first list, else null", () => {
    const { tasks } = planGeneratedTasks(
      [
        mkItem({ id: "a", defaultListName: "  gata " }), // case+spații → match Gata
        mkItem({ id: "b", defaultListName: "Inexistentă", position: 2048 }), // → prima listă
        mkItem({ id: "c", defaultListName: null, position: 3072 }), // → prima listă
      ],
      PRODUCT,
      LISTS,
      0
    );
    expect(tasks[0].listId).toBe("l-gata");
    expect(tasks[1].listId).toBe("l-backlog");
    expect(tasks[2].listId).toBe("l-backlog");

    // Board fără liste → Neîncadrate.
    const noLists = planGeneratedTasks([mkItem({ id: "a" })], PRODUCT, [], 0);
    expect(noLists.tasks[0].listId).toBeNull();
  });

  it("T-TB4-GEN-4 [normal] positions grow from basePosition, item order by position", () => {
    const { tasks } = planGeneratedTasks(
      [mkItem({ id: "b", title: "Al doilea", position: 2048 }), mkItem({ id: "a", title: "Primul", position: 1024 })],
      PRODUCT,
      LISTS,
      5000
    );
    expect(tasks.map((t) => t.title)).toEqual(["Primul", "Al doilea"]);
    expect(tasks.map((t) => t.position)).toEqual([6024, 7048]);
  });

  it("T-TB4-GEN-5 addDaysIso crosses month/year like the client helper", () => {
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });
});
