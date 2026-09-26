/**
 * Forma JSON a modulului de task-uri: rândurile Drizzle (camelCase, `Date`) → obiectele
 * snake_case pe care le citesc componentele portate din HR365 (`src/lib/tasks/types.ts`).
 *
 * Un singur loc pentru conversie: o coloană nouă se adaugă aici și în tipul din client, iar
 * restul rutelor o primesc automat.
 */
import type {
  BoardTaskRow,
  TaskActivityRow,
  TaskBoardMemberRow,
  TaskBoardRow,
  TaskCommentRow,
  TaskDependencyRow,
  TaskListRow,
  TaskVisibilityRuleRow,
} from "../../db/schema/tasks";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export interface BoardRights {
  can_edit: boolean;
  can_delete: boolean;
  my_role: "viewer" | "editor" | "admin" | null;
}

export function boardDto(row: TaskBoardRow, rights?: BoardRights) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    description: row.description,
    color: row.color,
    is_default: row.isDefault,
    starred_by: row.starredBy ?? [],
    visibility: row.visibility,
    team_id: row.teamId,
    archived_at: iso(row.archivedAt),
    created_by: row.createdBy,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
    ...(rights ?? {}),
  };
}

export function listDto(row: TaskListRow) {
  return {
    id: row.id,
    board_id: row.boardId,
    name: row.name,
    position: row.position,
    is_done_list: row.isDoneList,
    color: row.color,
    maps_to_status: row.mapsToStatus,
    archived_at: iso(row.archivedAt),
  };
}

export function memberDto(row: TaskBoardMemberRow) {
  return {
    id: row.id,
    board_id: row.boardId,
    user_id: row.userId,
    role: row.role,
    added_by: row.addedBy,
    created_at: iso(row.createdAt),
  };
}

export function taskDto(row: BoardTaskRow) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    board_id: row.boardId,
    list_id: row.listId,
    parent_task_id: row.parentTaskId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    position: row.position,
    assigned_to: row.assignedTo,
    assignees: row.assignees ?? [],
    assigned_by: row.assignedBy,
    created_by: row.createdBy,
    start_date: iso(row.startDate),
    due_date: iso(row.dueDate),
    estimated_minutes: row.estimatedMinutes,
    actual_minutes: row.actualMinutes,
    source_module: row.sourceModule,
    source_id: row.sourceId,
    is_private: row.isPrivate,
    is_recurring: row.isRecurring,
    recurrence_rule: row.recurrenceRule,
    tags: row.tags ?? [],
    task_set: row.taskSet,
    sort_order: row.sortOrder,
    is_milestone: row.isMilestone,
    approver_ids: row.approverIds ?? [],
    approved_at: iso(row.approvedAt),
    approved_by: row.approvedBy,
    recurrence_parent_id: row.recurrenceParentId,
    occurrence_date: row.occurrenceDate,
    completed_at: iso(row.completedAt),
    deleted_at: iso(row.deletedAt),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export type TaskDto = ReturnType<typeof taskDto>;

export function activityDto(row: TaskActivityRow) {
  return {
    id: row.id,
    task_id: row.taskId,
    actor_id: row.actorId,
    action: row.action,
    from_value: row.fromValue ?? null,
    to_value: row.toValue ?? null,
    created_at: iso(row.createdAt),
  };
}

export function commentDto(row: TaskCommentRow) {
  return {
    id: row.id,
    task_id: row.taskId,
    user_id: row.userId,
    content: row.content,
    attachments: row.attachments ?? [],
    mentions: row.mentions ?? [],
    created_at: iso(row.createdAt),
  };
}

export function dependencyDto(row: TaskDependencyRow) {
  return {
    id: row.id,
    task_id: row.taskId,
    depends_on_task_id: row.dependsOnTaskId,
    created_at: iso(row.createdAt),
  };
}

export function ruleDto(row: TaskVisibilityRuleRow) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    subject_type: row.subjectType,
    subject_user_id: row.subjectUserId,
    scope: row.scope,
    created_by: row.createdBy,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}
