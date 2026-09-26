import { describe, expect, it } from "vitest";
import { addDays, buildGanttLayout, daysBetween, monthTicks } from "../gantt";
import {
  completionTrend,
  computeKpis,
  countByStatus,
  dueSoon,
  loadByPerson,
  pendingApprovalsFor,
  statsByBoard,
} from "../analytics";
import { plannedAdhocCounts, taskSetProgress } from "../filters";
import type { BoardTask } from "../types";
import { en as enTasks, ro as roTasks } from "../i18n";

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    tenant_id: "c1",
    board_id: "b1",
    list_id: null,
    parent_task_id: null,
    title: "Task",
    description: null,
    status: "todo",
    priority: "medium",
    position: 1024,
    assigned_to: null,
    assignees: [],
    assigned_by: null,
    created_by: "u0",
    start_date: null,
    due_date: null,
    estimated_minutes: null,
    actual_minutes: null,
    source_module: "manual",
    source_id: null,
    is_private: false,
    is_recurring: false,
    recurrence_rule: null,
    tags: [],
    sort_order: 0,
    completed_at: null,
    deleted_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Gantt ───────────────────────────────────────────────────────────────────

describe("buildGanttLayout", () => {
  it("bara merge de la start la termen", () => {
    const layout = buildGanttLayout(
      [task({ id: "a", start_date: "2026-08-03T00:00:00Z", due_date: "2026-08-07T00:00:00Z" })],
      { padDays: 0 },
    );
    expect(layout.from).toBe("2026-08-03");
    expect(layout.to).toBe("2026-08-07");
    expect(layout.rows[0]).toMatchObject({ offsetDays: 0, spanDays: 5 });
  });

  it("o singură dată produce o bară de o zi, nu o durată inventată", () => {
    const layout = buildGanttLayout([task({ due_date: "2026-08-05T00:00:00Z" })], { padDays: 0 });
    expect(layout.rows[0].spanDays).toBe(1);
  });

  it("datele inversate se normalizează", () => {
    const layout = buildGanttLayout([task({ start_date: "2026-08-10T00:00:00Z", due_date: "2026-08-04T00:00:00Z" })], {
      padDays: 0,
    });
    expect(layout.rows[0].from).toBe("2026-08-04");
    expect(layout.rows[0].to).toBe("2026-08-10");
  });

  it("task-urile fără nicio dată nu se pierd, ies separat", () => {
    const layout = buildGanttLayout([task({ id: "fara" }), task({ id: "cu", due_date: "2026-08-05T00:00:00Z" })], {
      padDays: 0,
    });
    expect(layout.rows).toHaveLength(1);
    expect(layout.undated.map((t) => t.id)).toEqual(["fara"]);
  });

  it("sub-taskurile nu apar pe axă", () => {
    const layout = buildGanttLayout([task({ parent_task_id: "p", due_date: "2026-08-05T00:00:00Z" })], { padDays: 0 });
    expect(layout.rows).toHaveLength(0);
  });

  it("marchează milestone-urile", () => {
    const layout = buildGanttLayout([task({ is_milestone: true, due_date: "2026-08-05T00:00:00Z" })], { padDays: 0 });
    expect(layout.rows[0].isMilestone).toBe(true);
  });

  it("padding-ul lărgește intervalul la ambele capete", () => {
    const layout = buildGanttLayout([task({ due_date: "2026-08-05T00:00:00Z" })], { padDays: 2 });
    expect(layout.from).toBe("2026-08-03");
    expect(layout.to).toBe("2026-08-07");
    expect(layout.totalDays).toBe(5);
  });

  it("lista goală nu crapă", () => {
    const layout = buildGanttLayout([], { today: "2026-08-01" });
    expect(layout.rows).toEqual([]);
    expect(layout.totalDays).toBe(1);
  });

  it("rândurile sunt ordonate cronologic", () => {
    const layout = buildGanttLayout(
      [
        task({ id: "tarziu", due_date: "2026-08-20T00:00:00Z" }),
        task({ id: "devreme", due_date: "2026-08-02T00:00:00Z" }),
      ],
      { padDays: 0 },
    );
    expect(layout.rows.map((r) => r.task.id)).toEqual(["devreme", "tarziu"]);
  });

  it("aritmetica de zile trece peste schimbarea de oră (DST)", () => {
    // Ultima duminică din martie 2026: ora locală sare, ziua UTC nu.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("monthTicks marchează prima zi vizibilă a fiecărei luni", () => {
    const ticks = monthTicks("2026-08-28", 8);
    expect(ticks).toEqual([
      { iso: "2026-08-28", offsetDays: 0 },
      { iso: "2026-09-01", offsetDays: 4 },
    ]);
  });
});

// ─── Analytics ───────────────────────────────────────────────────────────────

describe("computeKpis", () => {
  const today = "2026-08-01";

  it("numără corect deschise, restante, fără responsabil", () => {
    const kpis = computeKpis(
      [
        task({ status: "done", completed_at: "2026-07-30T00:00:00Z" }),
        task({ due_date: "2026-07-20T00:00:00Z", assignees: ["u1"] }),
        task({ assignees: [] }),
        task({ parent_task_id: "p" }),
      ],
      today,
    );
    expect(kpis).toMatchObject({ total: 3, done: 1, open: 2, overdue: 1, unassigned: 1 });
  });

  it("rata de finalizare e 0 pe listă goală, nu NaN", () => {
    expect(computeKpis([], today).completionPct).toBe(0);
    expect(computeKpis([], today).avgCycleDays).toBeNull();
  });

  it("numără doar finalizările din fereastra cerută", () => {
    const kpis = computeKpis(
      [
        task({ status: "done", completed_at: "2026-07-28T00:00:00Z" }),
        task({ status: "done", completed_at: "2026-05-01T00:00:00Z" }),
      ],
      today,
      30,
    );
    expect(kpis.recentlyCompleted).toBe(1);
  });

  it("durata medie ignoră finalizările anterioare creării (date inconsistente)", () => {
    const kpis = computeKpis(
      [
        task({ status: "done", created_at: "2026-07-01T00:00:00Z", completed_at: "2026-07-05T00:00:00Z" }),
        task({ status: "done", created_at: "2026-07-10T00:00:00Z", completed_at: "2026-07-01T00:00:00Z" }),
      ],
      today,
    );
    expect(kpis.avgCycleDays).toBe(4);
  });

  it("un task gata dar restant nu se numără la restanțe", () => {
    const kpis = computeKpis(
      [task({ status: "done", due_date: "2026-07-01T00:00:00Z", completed_at: "2026-07-02T00:00:00Z" })],
      today,
    );
    expect(kpis.overdue).toBe(0);
  });
});

describe("completionTrend", () => {
  it("produce exact `days` puncte, ultimul fiind ziua curentă", () => {
    const trend = completionTrend([], "2026-08-01", 7);
    expect(trend).toHaveLength(7);
    expect(trend[0].day).toBe("2026-07-26");
    expect(trend[6].day).toBe("2026-08-01");
  });

  it("numără creările și finalizările pe ziua lor", () => {
    const trend = completionTrend(
      [
        task({ created_at: "2026-07-30T10:00:00Z" }),
        task({ created_at: "2026-07-30T18:00:00Z", status: "done", completed_at: "2026-08-01T09:00:00Z" }),
      ],
      "2026-08-01",
      7,
    );
    expect(trend.find((p) => p.day === "2026-07-30")?.created).toBe(2);
    expect(trend.find((p) => p.day === "2026-08-01")?.completed).toBe(1);
  });

  it("evenimentele din afara ferestrei sunt ignorate, nu adăugate la capete", () => {
    const trend = completionTrend([task({ created_at: "2020-01-01T00:00:00Z" })], "2026-08-01", 7);
    expect(trend.reduce((sum, p) => sum + p.created, 0)).toBe(0);
  });
});

describe("loadByPerson", () => {
  it("un task cu doi responsabili se numără la amândoi", () => {
    const rows = loadByPerson([task({ assignees: ["u1", "u2"] })], "2026-08-01");
    expect(rows.map((r) => r.userId).sort()).toEqual(["u1", "u2"]);
    expect(rows.every((r) => r.open === 1)).toBe(true);
  });

  it("separă restante de deschise și de finalizate", () => {
    const rows = loadByPerson(
      [
        task({ assignees: ["u1"], due_date: "2026-07-01T00:00:00Z" }),
        task({ assignees: ["u1"], due_date: "2026-09-01T00:00:00Z" }),
        task({ assignees: ["u1"], status: "done" }),
      ],
      "2026-08-01",
    );
    expect(rows[0]).toMatchObject({ userId: "u1", open: 2, overdue: 1, done: 1 });
  });

  it("task-urile neatribuite nu creează rânduri fantomă", () => {
    expect(loadByPerson([task({ assignees: [] })], "2026-08-01")).toEqual([]);
  });
});

describe("statsByBoard / countByStatus / dueSoon", () => {
  it("grupează pe board și calculează procentul", () => {
    const stats = statsByBoard(
      [task({ board_id: "b1", status: "done" }), task({ board_id: "b1" }), task({ board_id: "b2", status: "done" })],
      "2026-08-01",
    );
    expect(stats.find((s) => s.boardId === "b1")).toMatchObject({ total: 2, done: 1, pct: 50 });
    expect(stats.find((s) => s.boardId === "b2")).toMatchObject({ total: 1, pct: 100 });
  });

  it("task-urile fără board sunt ignorate", () => {
    expect(statsByBoard([task({ board_id: null })], "2026-08-01")).toEqual([]);
  });

  it("countByStatus întoarce toate cheile, chiar și cele cu zero", () => {
    expect(countByStatus([task({ status: "todo" })])).toEqual({
      todo: 1,
      in_progress: 0,
      pending: 0,
      done: 0,
    });
  });

  it("dueSoon include ziua curentă și ultima zi a ferestrei, dar nu restanțele", () => {
    const items = dueSoon(
      [
        task({ id: "restant", due_date: "2026-07-30T00:00:00Z" }),
        task({ id: "azi", due_date: "2026-08-01T00:00:00Z" }),
        task({ id: "z7", due_date: "2026-08-08T00:00:00Z" }),
        task({ id: "z8", due_date: "2026-08-09T00:00:00Z" }),
        task({ id: "gata", due_date: "2026-08-02T00:00:00Z", status: "done" }),
      ],
      "2026-08-01",
      7,
    );
    expect(items.map((t) => t.id)).toEqual(["azi", "z7"]);
  });
});

describe("pendingApprovalsFor", () => {
  it("arată doar task-urile în care sunt APROBATOR, nu cele care mi-s atribuite", () => {
    const items = [
      task({ id: "aprob", approver_ids: ["me"] }),
      task({ id: "executat", assignees: ["me"], approver_ids: ["altcineva"] }),
      task({ id: "fara", assignees: ["me"] }),
    ];
    expect(pendingApprovalsFor(items, "me").map((t) => t.id)).toEqual(["aprob"]);
  });

  it("nu mai cere aprobare pentru ce e deja închis", () => {
    const items = [task({ id: "gata", status: "done", approver_ids: ["me"] })];
    expect(pendingApprovalsFor(items, "me")).toEqual([]);
  });

  it("subtaskurile nu apar separat în coada de aprobare", () => {
    const items = [task({ id: "sub", parent_task_id: "p", approver_ids: ["me"] })];
    expect(pendingApprovalsFor(items, "me")).toEqual([]);
  });

  it("un task cu mai mulți aprobatori apare la fiecare dintre ei", () => {
    const items = [task({ id: "x", approver_ids: ["a", "b"] })];
    expect(pendingApprovalsFor(items, "a")).toHaveLength(1);
    expect(pendingApprovalsFor(items, "b")).toHaveLength(1);
    expect(pendingApprovalsFor(items, "c")).toHaveLength(0);
  });
});

describe("plannedAdhocCounts", () => {
  it("separă ce vine din șablon de ce apare ad-hoc", () => {
    const counts = plannedAdhocCounts([
      task({ source_template_id: "tpl1" }),
      task({ source_module: "template" }),
      task({ source_module: "manual" }),
    ]);
    expect(counts).toEqual({ planned: 2, adhoc: 1 });
  });

  it("sub-taskurile nu se numără — ar dubla cifrele părintelui", () => {
    const counts = plannedAdhocCounts([
      task({ source_template_id: "tpl1" }),
      task({ parent_task_id: "p", source_template_id: "tpl1" }),
    ]);
    expect(counts).toEqual({ planned: 1, adhoc: 0 });
  });

  it("lista goală întoarce zero, nu NaN", () => {
    expect(plannedAdhocCounts([])).toEqual({ planned: 0, adhoc: 0 });
  });
});

describe("taskSetProgress", () => {
  it("grupează inițiativele și calculează progresul fără subtaskuri", () => {
    expect(
      taskSetProgress([
        task({ task_set: "Lansare", status: "done" }),
        task({ task_set: "Lansare", status: "todo" }),
        task({ task_set: "Lansare", parent_task_id: "parent", status: "done" }),
        task({ task_set: "Audit", status: "done" }),
      ]),
    ).toEqual([
      { name: "Audit", done: 1, total: 1, percent: 100 },
      { name: "Lansare", done: 1, total: 2, percent: 50 },
    ]);
  });
});

describe("task board translations", () => {
  it("EN acoperă fiecare cheie din RO (și nimic în plus)", () => {
    // `Translated<typeof ro>` o garantează deja la compilare; testul o păzește și la
    // rulare, pentru cheile construite dinamic (`status.${value}`).
    expect(Object.keys(enTasks).sort()).toEqual(Object.keys(roTasks).sort());
  });
  it("nicio valoare goală și nicio interpolare rămasă în forma i18next", () => {
    for (const dict of [roTasks, enTasks] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe("");
        expect(value, key).not.toMatch(/\{\{/);
      }
    }
  });
});
