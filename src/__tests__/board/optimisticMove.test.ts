/**
 * TB-002: mutarea optimistă Kanban — logică pură.
 * T-TB2-MOV-1 [blocant] mutare între liste: listId + position se schimbă, restul taskurilor neatinse
 * T-TB2-MOV-2 [blocant] mutare în lista done → status=done + completedAt; scoatere → in_progress
 * T-TB2-MOV-3 [blocant] dropPosition: pe corpul coloanei = final; pe un card = înaintea lui;
 *   taskul tras e exclus din calcul (nu se auto-blochează)
 * T-TB2-MOV-4 [normal] reordonare în ACEEAȘI listă prin drop pe un card
 */
import { describe, it, expect } from "vitest";
import { applyOptimisticMove, dropPosition, moveStatusPatch } from "@/lib/board/optimisticMove";
import type { BoardTask } from "@/lib/api/boardTasks";
import type { BoardList } from "@/lib/api/board";

function mkTask(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t-0",
    tenantId: "tn",
    boardId: "b-1",
    listId: null,
    productId: null,
    title: "Task",
    description: null,
    position: 1024,
    status: "todo",
    priority: "normal",
    assigneeUserId: null,
    assigneeRole: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    templateItemId: null,
    sourceTemplateId: null,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

function mkList(over: Partial<BoardList>): BoardList {
  return {
    id: "l-1",
    tenantId: "tn",
    boardId: "b-1",
    name: "Lista",
    position: 1024,
    wipLimit: null,
    isDoneList: false,
    colorToken: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const LISTS = [
  mkList({ id: "l-todo", name: "Backlog", position: 1024 }),
  mkList({ id: "l-done", name: "Gata", position: 2048, isDoneList: true }),
];

describe("TB-002 optimistic move", () => {
  it("T-TB2-MOV-1 [blocant] cross-list move updates only the moved task", () => {
    const tasks = [
      mkTask({ id: "a", listId: "l-todo", position: 1024 }),
      mkTask({ id: "b", listId: "l-todo", position: 2048 }),
    ];
    const next = applyOptimisticMove(tasks, "a", "l-done", 512, LISTS);
    const a = next.find((t) => t.id === "a")!;
    const b = next.find((t) => t.id === "b")!;
    expect(a.listId).toBe("l-done");
    expect(a.position).toBe(512);
    expect(b).toEqual(tasks[1]); // neatins
  });

  it("T-TB2-MOV-2 [blocant] done-list sync mirrors the server", () => {
    const tasks = [mkTask({ id: "a", listId: "l-todo" })];
    const moved = applyOptimisticMove(tasks, "a", "l-done", 1024, LISTS)[0];
    expect(moved.status).toBe("done");
    expect(moved.completedAt).toBeTruthy();

    // Scoaterea din done → in_progress + completedAt null.
    const back = applyOptimisticMove(
      [mkTask({ id: "a", listId: "l-done", status: "done", completedAt: "2026-01-01" })],
      "a",
      "l-todo",
      4096,
      LISTS
    )[0];
    expect(back.status).toBe("in_progress");
    expect(back.completedAt).toBeNull();

    // Mutarea în „Neîncadrate" (null) NU schimbă statusul.
    expect(moveStatusPatch("todo", null)).toEqual({});
  });

  it("T-TB2-MOV-3 [blocant] dropPosition: end-of-column and before-card", () => {
    const tasks = [
      mkTask({ id: "a", listId: "l-todo", position: 1024 }),
      mkTask({ id: "b", listId: "l-todo", position: 2048 }),
      mkTask({ id: "c", listId: null, position: 1024 }),
    ];
    // Drop pe corpul coloanei → după ultimul (2048 + 1024).
    expect(dropPosition(tasks, "c", "l-todo", null)).toBe(3072);
    // Drop pe cardul "a" (primul) → jumătatea lui.
    expect(dropPosition(tasks, "c", "l-todo", "a")).toBe(512);
    // Drop pe cardul "b" → între a și b.
    expect(dropPosition(tasks, "c", "l-todo", "b")).toBe(1536);
    // Coloană goală → pasul standard.
    expect(dropPosition(tasks, "c", "l-empty", null)).toBe(1024);
  });

  it("T-TB2-MOV-4 [normal] within-list reorder excludes the dragged task", () => {
    const tasks = [
      mkTask({ id: "a", listId: "l-todo", position: 1024 }),
      mkTask({ id: "b", listId: "l-todo", position: 2048 }),
      mkTask({ id: "c", listId: "l-todo", position: 3072 }),
    ];
    // Trage "c" înaintea lui "a" → jumătatea lui 1024 (c exclus din vecini).
    expect(dropPosition(tasks, "c", "l-todo", "a")).toBe(512);
    // Trage "a" înaintea lui "c" → între b(2048) și c(3072).
    expect(dropPosition(tasks, "a", "l-todo", "c")).toBe(2560);
    // Trage "a" pe corpul propriei liste → după c (3072+1024) — nu după el însuși.
    expect(dropPosition(tasks, "a", "l-todo", null)).toBe(4096);
    // Drop pe un card care nu mai există (race) → fallback la final.
    expect(dropPosition(tasks, "a", "l-todo", "ghost")).toBe(4096);
  });
});
