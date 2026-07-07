/**
 * TB-002: Mutarea optimistă Kanban — logică pură, testabilă izolat.
 *
 * Oglindește exact decizia serverului din POST /api/board/tasks/:id/move
 * (boardTasks.ts): sync listă↔status pe isDoneList. UI-ul aplică întâi local
 * (fără flicker), apoi cheamă API-ul și re-sincronizează silent.
 */
import type { BoardTask } from "@/lib/api/boardTasks";
import type { BoardList } from "@/lib/api/board";
import { positionBetween } from "./position";

/** Patch-ul de status pe care îl va face și serverul la mutare (sursa: boardTasks.ts /move). */
export function moveStatusPatch(
  currentStatus: BoardTask["status"],
  targetList: Pick<BoardList, "isDoneList"> | null
): Partial<Pick<BoardTask, "status" | "completedAt">> {
  const wasDone = currentStatus === "done";
  if (targetList?.isDoneList && !wasDone) {
    return { status: "done", completedAt: new Date().toISOString() };
  }
  if (wasDone && targetList && !targetList.isDoneList) {
    return { status: "in_progress", completedAt: null };
  }
  return {};
}

/**
 * Aplică local mutarea unui task în (targetListId, position).
 * Nu mută alte taskuri — poziția fracționată face restul (ordonarea la randare).
 */
export function applyOptimisticMove(
  tasks: BoardTask[],
  taskId: string,
  targetListId: string | null,
  position: number,
  lists: BoardList[]
): BoardTask[] {
  const targetList = targetListId ? (lists.find((l) => l.id === targetListId) ?? null) : null;
  return tasks.map((t) => {
    if (t.id !== taskId) return t;
    return { ...t, listId: targetListId, position, ...moveStatusPatch(t.status, targetList) };
  });
}

/**
 * Poziția pentru un drop: înaintea lui `beforeTaskId`, sau la finalul coloanei (null).
 * `tasks` = TOATE taskurile boardului; se filtrează pe lista țintă, fără taskul tras.
 */
export function dropPosition(
  tasks: BoardTask[],
  draggedTaskId: string,
  targetListId: string | null,
  beforeTaskId: string | null
): number {
  const inList = tasks
    .filter((t) => t.listId === targetListId && t.id !== draggedTaskId)
    .sort((a, b) => a.position - b.position);
  if (beforeTaskId === null) {
    // Drop pe corpul coloanei → la final.
    const last = inList[inList.length - 1];
    return positionBetween(last ? last.position : null, null);
  }
  const idx = inList.findIndex((t) => t.id === beforeTaskId);
  if (idx === -1) {
    const last = inList[inList.length - 1];
    return positionBetween(last ? last.position : null, null);
  }
  const prev = idx > 0 ? inList[idx - 1].position : null;
  return positionBetween(prev, inList[idx].position);
}
