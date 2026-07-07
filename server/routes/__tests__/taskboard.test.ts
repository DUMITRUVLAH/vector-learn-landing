/**
 * TB-001: TaskBoard schema + contract tests
 *
 * T-TB1-SCH-1 [blocant] tasks table: coloanele care fac plan-first posibil
 *   (listId nullable, dueDate nullable, status cu default) există
 * T-TB1-SCH-2 [blocant] board_lists are isDoneList (sync-ul listă↔status depinde de el)
 * T-TB1-SCH-3 [blocant] $inferInsert: un task e valid DOAR cu tenantId+boardId+title+position
 *   (starea plan-first — fără listă, fără date, fără owner)
 * T-TB1-SCH-4 [blocant] template items au offsetAnchor/offsetDays (generarea din Faza 4)
 * T-TB1-SCH-5 [normal] sync-ul status la mutare: logica isDoneList → done
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  boardProducts,
  boards,
  boardLists,
  tasks,
  boardLabels,
  taskLabels,
  taskChecklistItems,
  taskComments,
  taskAttachments,
  boardTaskTemplates,
  boardTaskTemplateItems,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "../../db/schema/taskboard";

describe("TB-001: taskboard schema", () => {
  it("T-TB1-SCH-1 [blocant] tasks has the plan-first seam columns", () => {
    const cols = Object.keys(tasks);
    for (const c of [
      "id",
      "tenantId",
      "boardId",
      "listId",
      "productId",
      "title",
      "position",
      "status",
      "priority",
      "assigneeUserId",
      "assigneeRole",
      "startDate",
      "dueDate",
      "completedAt",
      "templateItemId",
      "archivedAt",
    ]) {
      expect(cols, `tasks.${c} missing`).toContain(c);
    }
  });

  it("T-TB1-SCH-2 [blocant] board_lists has isDoneList + position", () => {
    const cols = Object.keys(boardLists);
    expect(cols).toContain("isDoneList");
    expect(cols).toContain("position");
    expect(cols).toContain("wipLimit");
  });

  it("T-TB1-SCH-3 [blocant] plan-first insert: only tenantId+boardId+title required", () => {
    // Dacă asta compilează, starea plan-first (fără listă/dată/owner) e validă la nivel de tip.
    const row: typeof tasks.$inferInsert = {
      tenantId: "00000000-0000-0000-0000-000000000001",
      boardId: "00000000-0000-0000-0000-000000000002",
      title: "Task planificat, neîncadrat",
    };
    expect(row.title).toBe("Task planificat, neîncadrat");
    expect(row.listId).toBeUndefined(); // opțional — coloana Kanban vine mai târziu
    expect(row.dueDate).toBeUndefined(); // opțional — data vine mai târziu
    expect(row.assigneeUserId).toBeUndefined();
    expect(row.status).toBeUndefined(); // are default DB ("todo")
    expect(row.position).toBeUndefined(); // are default DB (0)
  });

  it("T-TB1-SCH-4 [blocant] template items carry relative-offset scheduling", () => {
    const cols = Object.keys(boardTaskTemplateItems);
    expect(cols).toContain("offsetAnchor");
    expect(cols).toContain("offsetDays");
    expect(cols).toContain("defaultListName");
    expect(cols).toContain("assigneeRole");
    expect(Object.keys(boardTaskTemplates)).toContain("productKind");
  });

  it("T-TB1-SCH-5 [normal] move status-sync logic: isDoneList drives done/completedAt", () => {
    // Aceeași decizie ca în POST /:id/move (boardTasks.ts) — replicată ca funcție pură.
    function moveStatusPatch(
      currentStatus: string,
      target: { isDoneList: boolean } | null
    ): { status?: string; completed?: boolean } {
      const wasDone = currentStatus === "done";
      if (target?.isDoneList && !wasDone) return { status: "done", completed: true };
      if (wasDone && target && !target.isDoneList) return { status: "in_progress", completed: false };
      return {};
    }
    expect(moveStatusPatch("todo", { isDoneList: true })).toEqual({ status: "done", completed: true });
    expect(moveStatusPatch("done", { isDoneList: false })).toEqual({ status: "in_progress", completed: false });
    expect(moveStatusPatch("done", { isDoneList: true })).toEqual({}); // done → done: neschimbat
    expect(moveStatusPatch("todo", { isDoneList: false })).toEqual({}); // mutare normală: statusul rămâne
    expect(moveStatusPatch("todo", null)).toEqual({}); // scoatere în „Neîncadrate": statusul rămâne
  });

  it("T-TB1-SCH-6 [normal] all 10 tables + enum constants exported", () => {
    for (const t of [
      boardProducts,
      boards,
      boardLists,
      tasks,
      boardLabels,
      taskLabels,
      taskChecklistItems,
      taskComments,
      taskAttachments,
      boardTaskTemplates,
      boardTaskTemplateItems,
    ]) {
      expect(t).toBeDefined();
    }
    expect(TASK_STATUSES).toEqual(["todo", "in_progress", "blocked", "done"]);
    expect(TASK_PRIORITIES).toEqual(["low", "normal", "high", "urgent"]);
  });
});
