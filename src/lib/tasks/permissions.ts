// Cine poate ce, pe un task — oglindă a gardului din DB
// (`hr_task_validate_write`, migrația v7).
//
// De ce trebuie oglindit în client: triggerul îi lasă unui RESPONSABIL doar
// progresul (status, procent), nu și titlul, responsabilii sau `deleted_at`.
// Interfața nu știa asta și arăta coșul de ștergere oricui putea deschide
// task-ul, deci apăsarea lui se termina cu „nu ai dreptul" pe propriul task —
// exact butonul-activ-care-eșuează din CLAUDE.md #24.

import type { BoardTask, TaskBoard } from "./types";

export interface TaskRightsContext {
  userId: string | null | undefined;
  isHRAdmin: boolean;
  isSuperAdmin: boolean;
  /** Boardul task-ului, dacă e cunoscut. `can_edit` vine din `hr_task_list_boards`. */
  board?: Pick<TaskBoard, "id" | "created_by" | "can_edit"> | null;
}

/**
 * Drept DEPLIN: titlu, descriere, responsabili, termen, ștergere.
 *
 * Aceleași ramuri ca `v_full` din trigger, în aceeași ordine:
 * HR/super admin → creatorul task-ului → editor/admin pe board → creatorul
 * boardului. Un task PERSONAL (fără board) n-are membri, deci rămâne al
 * creatorului lui.
 */
export function canFullyEditTask(
  task: Pick<BoardTask, "created_by" | "board_id"> | null | undefined,
  ctx: TaskRightsContext,
): boolean {
  if (!task) return false;
  if (ctx.isHRAdmin || ctx.isSuperAdmin) return true;
  if (!ctx.userId) return false;
  if (task.created_by === ctx.userId) return true;
  if (!task.board_id) return false;
  const board = ctx.board;
  if (!board || board.id !== task.board_id) return false;
  // `can_edit` lipsește cât timp migrația care l-a adăugat nu e aplicată; atunci
  // nu presupunem drepturi pe care serverul le-ar putea refuza (#3 invers: aici
  // tăcerea înseamnă „nu știu", iar un buton în plus minte).
  if (board.can_edit === true) return true;
  return board.created_by === ctx.userId;
}

/** Responsabilul poate elimina doar un subtask pe care este alocat. */
export function canDeleteSubtask(
  task: Pick<BoardTask, "created_by" | "board_id" | "parent_task_id" | "assignees"> | null | undefined,
  ctx: TaskRightsContext,
): boolean {
  if (!task || !ctx.userId || !task.parent_task_id) return false;
  if (canFullyEditTask(task, ctx)) return true;
  return task.assignees.includes(ctx.userId);
}

/**
 * Ce poate face un responsabil fără drept deplin: să mute progresul. Îl ținem
 * explicit ca lista de câmpuri permise să fie citibilă dintr-un singur loc.
 */
export const ASSIGNEE_EDITABLE_FIELDS = ["status", "actual_minutes"] as const;
