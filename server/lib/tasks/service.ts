/**
 * Operațiile managerului de task-uri — ce făceau în HR365 triggerele și RPC-urile SQL.
 *
 * Fiecare scriere trece prin aceleași etape, în ordinea din sursă (`spec §3.0`):
 *   drept (access.ts) → garda de câmpuri → completare/aprobare → normalizarea responsabililor →
 *   validare → scriere → istoric → notificări → efecte (cascadă, recurență).
 * Rutele doar traduc HTTP ↔ apeluri de aici; niciuna nu scrie direct în tabele.
 *
 * Erorile sunt `TaskError` cu un cod stabil (`needs_approval`, `blocked_by_dependency`…), pe care
 * clientul îl traduce (`src/lib/tasks/errors.ts`) — nu text de afișat.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  boardTasks,
  taskActivity,
  taskBoardMembers,
  taskBoards,
  taskComments,
  taskDependencies,
  taskLists,
  type BoardTaskRow,
  type NewBoardTaskRow,
  type TaskBoardRow,
  type TaskCommentAttachment,
  type TaskListRow,
} from "../../db/schema/tasks";
import {
  boardRolesFor,
  canApprove,
  canEditBoardRole,
  canEditTask,
  canSeeTask,
  canSoftDelete,
  isFullEditor,
  loadBoardWithRole,
  type BoardFacts,
  type BoardRole,
  type TaskContext,
} from "./access";
import {
  DEFAULT_LISTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  listIdForStatus,
  moveStatusPatch,
  positionAtEnd,
  positionBetween,
  type TaskStatus,
} from "./boardStatus";
import { activeStaffIds } from "./people";
import { notifyTaskComment, notifyTaskUsers } from "./notify";
import { isActiveTeamOfTenant } from "../teams";
import { isSafeTenantObjectPath } from "../storage/safePath";
import { nextDueAfterCompletion, parseRecurrence } from "./recurrence";

export class TaskError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 422,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const forbidden = (message?: string) => new TaskError(403, "forbidden", message);
const notFound = () => new TaskError(404, "not_found");

// ─── Încărcare ────────────────────────────────────────────────────────────────

async function loadTaskRow(ctx: TaskContext, id: string, includeDeleted = false): Promise<BoardTaskRow | null> {
  const [row] = await db
    .select()
    .from(boardTasks)
    .where(
      and(
        eq(boardTasks.id, id),
        eq(boardTasks.tenantId, ctx.tenantId),
        includeDeleted ? undefined : isNull(boardTasks.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function boardFactsOf(ctx: TaskContext, boardId: string | null): Promise<BoardFacts | null> {
  if (!boardId) return null;
  const facts = await boardRolesFor(ctx, [boardId]);
  return facts.get(boardId) ?? null;
}

/** Task-ul, doar dacă apelantul îl vede; altfel 404 (nu confirmăm existența). */
export async function loadVisibleTask(ctx: TaskContext, id: string): Promise<{ task: BoardTaskRow; board: BoardFacts | null }> {
  const task = await loadTaskRow(ctx, id);
  if (!task) throw notFound();
  const board = await boardFactsOf(ctx, task.boardId);
  if (!canSeeTask(ctx, task, board)) throw notFound();
  return { task, board };
}

async function activeLists(boardId: string): Promise<TaskListRow[]> {
  return db
    .select()
    .from(taskLists)
    .where(and(eq(taskLists.boardId, boardId), isNull(taskLists.archivedAt)))
    .orderBy(asc(taskLists.position));
}

const listLike = (l: TaskListRow) => ({ id: l.id, name: l.name, is_done_list: l.isDoneList, maps_to_status: l.mapsToStatus });

// ─── Validare (hr_task_validate_write) ──────────────────────────────────────────

const MAX_MINUTES = 1_000_000;

function validateTaskFields(t: Pick<
  NewBoardTaskRow,
  "title" | "description" | "status" | "priority" | "assignees" | "approverIds" | "tags" | "estimatedMinutes" | "actualMinutes" | "startDate" | "dueDate" | "taskSet"
>): void {
  const title = (t.title ?? "").trim();
  if (title.length < 1 || title.length > 500) throw new TaskError(400, "title_length");
  if (t.description && t.description.length > 100_000) throw new TaskError(400, "description_length");
  if (!TASK_STATUSES.includes((t.status ?? "todo") as TaskStatus)) throw new TaskError(400, "invalid_data", "Status invalid");
  if (!(TASK_PRIORITIES as readonly string[]).includes(t.priority ?? "medium")) {
    throw new TaskError(400, "invalid_data", "Prioritate invalidă");
  }
  if ((t.assignees ?? []).length > 50 || (t.approverIds ?? []).length > 50 || (t.tags ?? []).length > 50) {
    throw new TaskError(400, "too_many");
  }
  if ((t.tags ?? []).some((tag) => tag.length > 100)) throw new TaskError(400, "invalid_data", "Un tag depășește 100 caractere");
  for (const minutes of [t.estimatedMinutes, t.actualMinutes]) {
    if (minutes !== null && minutes !== undefined && (minutes < 0 || minutes > MAX_MINUTES || !Number.isInteger(minutes))) {
      throw new TaskError(400, "invalid_data", "Timp invalid");
    }
  }
  if (t.startDate && t.dueDate && t.startDate.getTime() > t.dueDate.getTime()) {
    throw new TaskError(400, "invalid_data", "Data de început nu poate fi după termen");
  }
  if (t.taskSet !== null && t.taskSet !== undefined && (t.taskSet.trim().length < 1 || t.taskSet.trim().length > 120)) {
    throw new TaskError(400, "invalid_data", "Setul de task-uri are între 1 și 120 de caractere");
  }
}

/** Boardul/coloana/părintele unui task trebuie să fie ale aceluiași workspace și coerente între ele. */
async function validatePlacement(
  ctx: TaskContext,
  row: { id?: string; boardId: string | null; listId: string | null; parentTaskId: string | null; deletedAt?: Date | null },
): Promise<void> {
  if (row.listId) {
    if (!row.boardId) throw new TaskError(400, "list_mismatch");
    const [list] = await db
      .select({ boardId: taskLists.boardId })
      .from(taskLists)
      .where(and(eq(taskLists.id, row.listId), eq(taskLists.tenantId, ctx.tenantId)))
      .limit(1);
    if (!list || list.boardId !== row.boardId) throw new TaskError(400, "list_mismatch");
  }
  if (row.parentTaskId) {
    if (row.id && row.parentTaskId === row.id) throw new TaskError(400, "parent_invalid");
    const [parent] = await db
      .select({ boardId: boardTasks.boardId, deletedAt: boardTasks.deletedAt, tenantId: boardTasks.tenantId })
      .from(boardTasks)
      .where(eq(boardTasks.id, row.parentTaskId))
      .limit(1);
    if (!parent || parent.tenantId !== ctx.tenantId || parent.boardId !== row.boardId) throw new TaskError(400, "parent_invalid");
    if (!row.deletedAt && parent.deletedAt) throw new TaskError(400, "parent_invalid");
    // Ierarhie circulară: rândul nu are voie să fie strămoșul noului părinte.
    if (row.id) {
      let cursor: string | null = row.parentTaskId;
      for (let depth = 0; cursor && depth < 50; depth += 1) {
        if (cursor === row.id) throw new TaskError(400, "cycle");
        const [up] = await db
          .select({ parent: boardTasks.parentTaskId })
          .from(boardTasks)
          .where(eq(boardTasks.id, cursor))
          .limit(1);
        cursor = up?.parent ?? null;
      }
    }
  }
}

/** Responsabilii: fără dubluri, doar oameni activi din workspace — ceilalți cad TĂCUT (ca în sursă). */
async function normalizeAssignees(ctx: TaskContext, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const active = await activeStaffIds(ctx.tenantId, unique);
  return unique.filter((id) => active.has(id));
}

/** Aprobatorii trebuie să fie oameni activi — aici un id greșit e o eroare, nu se ignoră. */
async function validateApprovers(ctx: TaskContext, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const active = await activeStaffIds(ctx.tenantId, unique);
  if (unique.some((id) => !active.has(id))) throw new TaskError(400, "approver_invalid");
  return unique;
}

// ─── Istoric (hr_task_record_activity) ───────────────────────────────────────────

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function recordActivity(ctx: TaskContext, before: BoardTaskRow | null, after: BoardTaskRow): Promise<void> {
  const rows: Array<{ action: string; fromValue: unknown; toValue: unknown }> = [];
  if (!before) {
    rows.push({ action: "created", fromValue: null, toValue: { title: after.title, status: after.status, priority: after.priority } });
  } else {
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (!same(before.status, after.status)) rows.push({ action: "status_changed", fromValue: before.status, toValue: after.status });
    if (!same(before.priority, after.priority)) rows.push({ action: "priority_changed", fromValue: before.priority, toValue: after.priority });
    if (!same(before.title, after.title)) rows.push({ action: "title_changed", fromValue: before.title, toValue: after.title });
    if (!same(before.description, after.description)) {
      rows.push({ action: "description_changed", fromValue: before.description, toValue: after.description });
    }
    if (!same(before.listId, after.listId)) rows.push({ action: "list_changed", fromValue: before.listId, toValue: after.listId });
    if (!same(iso(before.dueDate), iso(after.dueDate))) {
      rows.push({ action: "due_date_changed", fromValue: iso(before.dueDate), toValue: iso(after.dueDate) });
    }
    if (!same(before.boardId, after.boardId)) rows.push({ action: "board_changed", fromValue: before.boardId, toValue: after.boardId });
    if (!same(before.assignees, after.assignees)) {
      rows.push({ action: "assignees_changed", fromValue: before.assignees, toValue: after.assignees });
    }
    if (!before.deletedAt && after.deletedAt) rows.push({ action: "deleted", fromValue: null, toValue: null });
  }
  if (rows.length === 0) return;
  await db.insert(taskActivity).values(
    rows.map((r) => ({ tenantId: ctx.tenantId, taskId: after.id, actorId: ctx.userId, action: r.action, fromValue: r.fromValue, toValue: r.toValue })),
  );
}

// ─── Poziții ──────────────────────────────────────────────────────────────────

/** Coada coloanei (sau a „găleții" board/listă NULL pentru task-urile personale ale workspace-ului). */
async function appendPosition(ctx: TaskContext, boardId: string | null, listId: string | null): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${boardTasks.position})` })
    .from(boardTasks)
    .where(
      and(
        eq(boardTasks.tenantId, ctx.tenantId),
        boardId ? eq(boardTasks.boardId, boardId) : isNull(boardTasks.boardId),
        listId ? eq(boardTasks.listId, listId) : isNull(boardTasks.listId),
        isNull(boardTasks.deletedAt),
      ),
    );
  return positionAtEnd(row?.max !== null && row?.max !== undefined ? [Number(row.max)] : []);
}

// ─── Boarduri ─────────────────────────────────────────────────────────────────

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  color?: string;
  visibility?: "private" | "team" | "company";
  team_id?: string | null;
  lists?: Array<{ name: string; is_done_list?: boolean; color?: string; maps_to_status?: TaskStatus | null }>;
}

function validateBoardMeta(name: string, description: string | null | undefined, color: string): void {
  if (name.trim().length < 1 || name.trim().length > 200) throw new TaskError(400, "invalid_data", "Numele boardului are între 1 și 200 de caractere");
  if (description && description.length > 10_000) throw new TaskError(400, "invalid_data", "Descriere prea lungă");
  if (color.length < 1 || color.length > 50) throw new TaskError(400, "invalid_data", "Culoare invalidă");
}

async function validateBoardVisibility(
  ctx: TaskContext,
  visibility: string,
  teamId: string | null | undefined,
): Promise<{ visibility: "private" | "team" | "company"; teamId: string | null }> {
  if (visibility !== "private" && visibility !== "team" && visibility !== "company") {
    throw new TaskError(400, "invalid_data", "Vizibilitate invalidă");
  }
  if (visibility === "team") {
    if (!teamId) throw new TaskError(400, "invalid_data", "Alege echipa care vede boardul");
    if (!(await isActiveTeamOfTenant(teamId, ctx.tenantId))) throw new TaskError(400, "invalid_data", "Echipa nu există");
    return { visibility, teamId };
  }
  return { visibility, teamId: null };
}

/** Board nou + coloanele implicite + creatorul ca admin — o singură tranzacție logică. */
export async function createBoard(ctx: TaskContext, input: CreateBoardInput): Promise<TaskBoardRow> {
  const name = input.name.trim();
  const color = input.color ?? "pastel-sky";
  validateBoardMeta(name, input.description, color);
  const vis = await validateBoardVisibility(ctx, input.visibility ?? "private", input.team_id);
  const seeds = (input.lists ?? []).filter((l) => l.name.trim().length > 0).slice(0, 12);
  const lists = seeds.length > 0 ? seeds : DEFAULT_LISTS;
  // Mai multe coloane marcate „gata": rămâne ULTIMA (în sursă, triggerul „single done" o fura la fiecare inserare).
  const doneIndex = lists.map((l) => !!l.is_done_list).lastIndexOf(true);

  return db.transaction(async (tx) => {
    const [board] = await tx
      .insert(taskBoards)
      .values({
        tenantId: ctx.tenantId,
        name,
        description: input.description?.trim() || null,
        color,
        visibility: vis.visibility,
        teamId: vis.teamId,
        createdBy: ctx.userId,
      })
      .returning();
    await tx.insert(taskBoardMembers).values({ tenantId: ctx.tenantId, boardId: board.id, userId: ctx.userId, role: "admin", addedBy: ctx.userId });
    await tx.insert(taskLists).values(
      lists.map((list, index) => {
        const isDone = index === doneIndex;
        return {
          tenantId: ctx.tenantId,
          boardId: board.id,
          name: list.name.trim().slice(0, 100),
          position: (index + 1) * 1024,
          isDoneList: isDone,
          color: list.color ?? "pastel-sky",
          mapsToStatus: list.maps_to_status ?? null,
        };
      }),
    );
    return board;
  });
}

export interface BoardPatchInput {
  name?: string;
  description?: string | null;
  color?: string;
  visibility?: "private" | "team" | "company";
  team_id?: string | null;
  archived?: boolean;
}

/** Numele, descrierea, culoarea, vizibilitatea, arhivarea — doar adminul boardului. */
export async function updateBoard(ctx: TaskContext, boardId: string, patch: BoardPatchInput): Promise<void> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  if (loaded.role !== "admin") throw forbidden();
  const { board } = loaded;
  const next: Partial<TaskBoardRow> = { updatedAt: new Date() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.description !== undefined) next.description = patch.description?.trim() || null;
  if (patch.color !== undefined) next.color = patch.color;
  validateBoardMeta(next.name ?? board.name, next.description !== undefined ? next.description : board.description, next.color ?? board.color);
  if (patch.visibility !== undefined || patch.team_id !== undefined) {
    // Boardul implicit rămâne spațiul întregii organizații.
    if (board.isDefault) throw forbidden("Boardul implicit rămâne deschis întregii organizații");
    const vis = await validateBoardVisibility(ctx, patch.visibility ?? board.visibility, patch.team_id !== undefined ? patch.team_id : board.teamId);
    next.visibility = vis.visibility;
    next.teamId = vis.teamId;
  }
  if (patch.archived !== undefined) next.archivedAt = patch.archived ? new Date() : null;
  await db.update(taskBoards).set(next).where(and(eq(taskBoards.id, boardId), eq(taskBoards.tenantId, ctx.tenantId)));
}

/** Câte task-uri active are boardul — pentru dialogul de confirmare a ștergerii. */
export async function countBoardTasks(ctx: TaskContext, boardId: string): Promise<number> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)));
  return Number(row?.n ?? 0);
}

/**
 * Șterge boardul CU TOT CU task-uri. Fără pasul explicit, `board_id` ar deveni NULL (FK
 * `SET NULL`) și task-urile ar ateriza tăcut, ca „personale", la creatorii lor.
 */
export async function deleteBoard(ctx: TaskContext, boardId: string): Promise<number> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  if (loaded.role !== "admin") throw forbidden();
  if (loaded.board.isDefault) throw forbidden("Boardul implicit nu se șterge");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(boardTasks)
      .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)));
    // Copiii întâi nu e nevoie: `parent_task_id` e ON DELETE CASCADE, la fel istoricul/comentariile.
    await tx.delete(boardTasks).where(and(eq(boardTasks.boardId, boardId), eq(boardTasks.tenantId, ctx.tenantId)));
    await tx.delete(taskBoards).where(and(eq(taskBoards.id, boardId), eq(taskBoards.tenantId, ctx.tenantId)));
    return Number(row?.n ?? 0);
  });
}

/** Steaua e per om; oricine vede boardul și-l poate fixa. */
export async function toggleStar(ctx: TaskContext, boardId: string): Promise<boolean> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  const current = loaded.board.starredBy ?? [];
  const starred = !current.includes(ctx.userId);
  const next = starred ? [...current, ctx.userId] : current.filter((u) => u !== ctx.userId);
  await db.update(taskBoards).set({ starredBy: next }).where(eq(taskBoards.id, boardId));
  return starred;
}

// ─── Coloane ──────────────────────────────────────────────────────────────────

async function requireEditableBoard(ctx: TaskContext, boardId: string): Promise<{ board: TaskBoardRow; role: BoardRole }> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  if (!canEditBoardRole(loaded.role)) throw forbidden();
  return { board: loaded.board, role: loaded.role };
}

async function loadListForEdit(ctx: TaskContext, listId: string): Promise<TaskListRow> {
  const [list] = await db
    .select()
    .from(taskLists)
    .where(and(eq(taskLists.id, listId), eq(taskLists.tenantId, ctx.tenantId)))
    .limit(1);
  if (!list) throw notFound();
  await requireEditableBoard(ctx, list.boardId);
  return list;
}

function validateListMeta(name: string, color: string, position: number): void {
  if (name.trim().length < 1 || name.trim().length > 200) throw new TaskError(400, "invalid_data", "Numele coloanei are între 1 și 200 de caractere");
  if (color.length < 1 || color.length > 50) throw new TaskError(400, "invalid_data", "Culoare invalidă");
  if (!Number.isFinite(position)) throw new TaskError(400, "invalid_data", "Poziție invalidă");
}

/** O singură coloană de finalizare activă per board: cea nouă „fură" bifa celei vechi. */
async function stealDoneFlag(boardId: string, keepId: string): Promise<void> {
  await db
    .update(taskLists)
    .set({ isDoneList: false, updatedAt: new Date() })
    .where(and(eq(taskLists.boardId, boardId), ne(taskLists.id, keepId), eq(taskLists.isDoneList, true), isNull(taskLists.archivedAt)));
}

export async function createList(
  ctx: TaskContext,
  boardId: string,
  input: { name: string; is_done_list?: boolean; color?: string; maps_to_status?: TaskStatus | null },
): Promise<TaskListRow> {
  await requireEditableBoard(ctx, boardId);
  const existing = await activeLists(boardId);
  const position = positionAtEnd(existing.map((l) => l.position));
  const color = input.color ?? "pastel-sky";
  validateListMeta(input.name, color, position);
  const [list] = await db
    .insert(taskLists)
    .values({
      tenantId: ctx.tenantId,
      boardId,
      name: input.name.trim(),
      position,
      isDoneList: input.is_done_list ?? false,
      color,
      mapsToStatus: input.maps_to_status ?? null,
    })
    .returning();
  if (list.isDoneList) await stealDoneFlag(boardId, list.id);
  return list;
}

export async function updateList(
  ctx: TaskContext,
  listId: string,
  patch: { name?: string; position?: number; is_done_list?: boolean; color?: string; maps_to_status?: TaskStatus | null; archived?: boolean },
): Promise<void> {
  const list = await loadListForEdit(ctx, listId);
  const next: Partial<TaskListRow> = { updatedAt: new Date() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.position !== undefined) next.position = patch.position;
  if (patch.is_done_list !== undefined) next.isDoneList = patch.is_done_list;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.maps_to_status !== undefined) {
    if (patch.maps_to_status !== null && !TASK_STATUSES.includes(patch.maps_to_status)) throw new TaskError(400, "invalid_data", "Status invalid");
    next.mapsToStatus = patch.maps_to_status;
  }
  if (patch.archived !== undefined) next.archivedAt = patch.archived ? new Date() : null;
  validateListMeta(next.name ?? list.name, next.color ?? list.color, next.position ?? list.position);
  await db.update(taskLists).set(next).where(eq(taskLists.id, listId));
  const becomesActiveDone =
    (next.isDoneList ?? list.isDoneList) && (next.archivedAt !== undefined ? next.archivedAt === null : list.archivedAt === null);
  const wasActiveDone = list.isDoneList && list.archivedAt === null;
  if (becomesActiveDone && !wasActiveDone) await stealDoneFlag(list.boardId, list.id);
}

export async function listBoardLists(ctx: TaskContext, boardId: string, archived: boolean): Promise<TaskListRow[]> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  return db
    .select()
    .from(taskLists)
    .where(and(eq(taskLists.boardId, boardId), archived ? isNotNull(taskLists.archivedAt) : isNull(taskLists.archivedAt)))
    .orderBy(archived ? desc(taskLists.archivedAt) : asc(taskLists.position));
}

export async function countListTasks(ctx: TaskContext, listId: string): Promise<number> {
  const list = await loadListForEdit(ctx, listId);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardTasks)
    .where(and(eq(boardTasks.listId, list.id), isNull(boardTasks.deletedAt)));
  return Number(row?.n ?? 0);
}

/** Duplică o coloană cu task-urile ei de nivel principal (fără subtaskuri, fără istoric). */
export async function duplicateList(ctx: TaskContext, listId: string, copySuffix: string): Promise<void> {
  const source = await loadListForEdit(ctx, listId);
  const copy = await createList(ctx, source.boardId, {
    name: `${source.name} ${copySuffix}`.slice(0, 200),
    is_done_list: false,
    color: source.color,
    maps_to_status: source.mapsToStatus as TaskStatus | null,
  });
  const tasks = await db
    .select()
    .from(boardTasks)
    .where(and(eq(boardTasks.listId, listId), isNull(boardTasks.parentTaskId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position));
  if (tasks.length === 0) return;
  const inserted = await db
    .insert(boardTasks)
    .values(
      tasks.map((t, i) => ({
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        boardId: t.boardId,
        listId: copy.id,
        title: t.title,
        description: t.description,
        status: t.status === "done" ? "todo" : t.status,
        priority: t.priority,
        assignees: t.assignees,
        assignedTo: t.assignedTo,
        assignedBy: t.assignees.length > 0 ? ctx.userId : null,
        dueDate: t.dueDate,
        startDate: t.startDate,
        tags: t.tags,
        taskSet: t.taskSet,
        position: (i + 1) * 1024,
      })),
    )
    .returning();
  for (const row of inserted) await recordActivity(ctx, null, row);
}

/** Toate task-urile unei coloane în alta, în ordine, cu statusul aliniat la coloana-țintă. */
export async function moveAllToList(ctx: TaskContext, fromListId: string, toListId: string): Promise<number> {
  const from = await loadListForEdit(ctx, fromListId);
  const to = await loadListForEdit(ctx, toListId);
  if (from.boardId !== to.boardId) throw new TaskError(400, "list_mismatch");
  if (from.id === to.id) return 0;
  // Toată coloana, subtaskuri incluse: altfel ele rămâneau în coloana golită (de obicei arhivată după).
  const tasks = await db
    .select()
    .from(boardTasks)
    .where(and(eq(boardTasks.listId, fromListId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.createdAt));
  let position = await appendPosition(ctx, to.boardId, to.id);
  const target = { is_done_list: to.isDoneList, name: to.name, maps_to_status: to.mapsToStatus };
  for (const task of tasks) {
    const patch = moveStatusPatch(task.status as TaskStatus, target);
    // Mutarea în bloc nu are voie să ocolească aprobările și dependențele unei închideri.
    await applyTaskUpdate(ctx, task, { listId: to.id, position, ...(patch.status ? { status: patch.status } : {}) }, { system: false });
    position += 1024;
  }
  return tasks.length;
}

const SORT_KEYS = ["title", "due_date", "priority", "created_at", "status"] as const;
export type ListSortKey = (typeof SORT_KEYS)[number];
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { todo: 0, in_progress: 1, pending: 2, done: 3 };

/** Reordonează persistent task-urile unei coloane după o cheie. */
export async function sortList(ctx: TaskContext, listId: string, key: string): Promise<void> {
  if (!(SORT_KEYS as readonly string[]).includes(key)) throw new TaskError(400, "bad_sort_key");
  await loadListForEdit(ctx, listId);
  const tasks = await db
    .select()
    .from(boardTasks)
    .where(and(eq(boardTasks.listId, listId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position));
  const sorted = [...tasks].sort((a, b) => {
    if (key === "title") return a.title.localeCompare(b.title, "ro");
    if (key === "status") return (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    if (key === "due_date") return (iso(a.dueDate) ?? "9999").localeCompare(iso(b.dueDate) ?? "9999");
    if (key === "priority") return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  for (let i = 0; i < sorted.length; i += 1) {
    const position = (i + 1) * 1024;
    if (sorted[i].position !== position) await db.update(boardTasks).set({ position }).where(eq(boardTasks.id, sorted[i].id));
  }
}

/** Mută coloana la stânga/dreapta: poziție între vecini, un singur UPDATE. */
export async function reorderList(ctx: TaskContext, listId: string, direction: -1 | 1): Promise<void> {
  const list = await loadListForEdit(ctx, listId);
  const lists = await activeLists(list.boardId);
  const index = lists.findIndex((l) => l.id === listId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= lists.length) return;
  const before = direction === 1 ? lists[target] : lists[target - 1] ?? null;
  const after = direction === 1 ? lists[target + 1] ?? null : lists[target];
  const position = positionBetween(before?.position ?? null, after?.position ?? null);
  await db.update(taskLists).set({ position, updatedAt: new Date() }).where(eq(taskLists.id, listId));
}

// ─── Membri ───────────────────────────────────────────────────────────────────

export async function listMembers(ctx: TaskContext, boardId: string) {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  return db.select().from(taskBoardMembers).where(eq(taskBoardMembers.boardId, boardId));
}

async function requireBoardAdmin(ctx: TaskContext, boardId: string): Promise<TaskBoardRow> {
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw notFound();
  if (loaded.role !== "admin") throw forbidden();
  return loaded.board;
}

/** Adaugă sau schimbă rolul unui membru (upsert). Doar oameni activi din workspace. */
export async function upsertMember(ctx: TaskContext, boardId: string, userId: string, role: string): Promise<void> {
  if (role !== "viewer" && role !== "editor" && role !== "admin") throw new TaskError(400, "invalid_data", "Rol de board invalid");
  await requireBoardAdmin(ctx, boardId);
  const active = await activeStaffIds(ctx.tenantId, [userId]);
  if (!active.has(userId)) throw new TaskError(400, "invalid_data", "Persoana nu face parte din organizație");
  await db
    .insert(taskBoardMembers)
    .values({ tenantId: ctx.tenantId, boardId, userId, role, addedBy: ctx.userId })
    .onConflictDoUpdate({ target: [taskBoardMembers.boardId, taskBoardMembers.userId], set: { role } });
}

export async function removeMember(ctx: TaskContext, boardId: string, userId: string): Promise<void> {
  await requireBoardAdmin(ctx, boardId);
  await db.delete(taskBoardMembers).where(and(eq(taskBoardMembers.boardId, boardId), eq(taskBoardMembers.userId, userId)));
}

/** O echipă întreagă devine membră (cu același rol) — cei deja pe board își păstrează rolul. */
export async function addTeamToBoard(ctx: TaskContext, boardId: string, memberIds: string[], role: string): Promise<number> {
  if (role !== "viewer" && role !== "editor" && role !== "admin") throw new TaskError(400, "invalid_data", "Rol de board invalid");
  await requireBoardAdmin(ctx, boardId);
  const active = [...(await activeStaffIds(ctx.tenantId, memberIds))];
  if (active.length === 0) return 0;
  const inserted = await db
    .insert(taskBoardMembers)
    .values(active.map((userId) => ({ tenantId: ctx.tenantId, boardId, userId, role, addedBy: ctx.userId })))
    .onConflictDoNothing()
    .returning({ id: taskBoardMembers.id });
  return inserted.length;
}

// ─── Task-uri: creare ─────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  board_id?: string | null;
  list_id?: string | null;
  parent_task_id?: string | null;
  description?: string | null;
  status?: TaskStatus;
  priority?: string;
  assignees?: string[];
  start_date?: string | null;
  due_date?: string | null;
  estimated_minutes?: number | null;
  tags?: string[];
  task_set?: string | null;
  is_private?: boolean;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  source_module?: string;
  position?: number;
  approver_ids?: string[];
}

const toDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new TaskError(400, "invalid_data", "Dată invalidă");
  return d;
};

export async function createTask(ctx: TaskContext, input: CreateTaskInput): Promise<BoardTaskRow> {
  const boardId = input.board_id ?? null;
  let lists: TaskListRow[] = [];
  if (boardId) {
    await requireEditableBoard(ctx, boardId);
    lists = await activeLists(boardId);
  }
  let listId = boardId ? input.list_id ?? null : null;
  let status: TaskStatus = input.status ?? "todo";
  // Coloana și statusul spun același lucru de la naștere: un card creat în „Gata" e gata, iar
  // un task „În lucru" creat din listă ajunge în coloana „În lucru".
  if (listId && !input.status) {
    const list = lists.find((l) => l.id === listId);
    if (list) status = moveStatusPatch("todo", listLike(list)).status ?? "todo";
  } else if (!listId && boardId && lists.length > 0) {
    listId = listIdForStatus(status, "todo", null, lists.map(listLike)) ?? lists.find((l) => !l.isDoneList)?.id ?? null;
  }

  const assignees = await normalizeAssignees(ctx, input.assignees ?? []);
  const approverIds = await validateApprovers(ctx, input.approver_ids ?? []);
  const values: NewBoardTaskRow = {
    tenantId: ctx.tenantId,
    boardId,
    listId,
    parentTaskId: input.parent_task_id ?? null,
    title: input.title.trim(),
    description: input.description ?? null,
    status,
    priority: input.priority ?? "medium",
    assignees,
    assignedTo: assignees[0] ?? null,
    assignedBy: assignees.length > 0 ? ctx.userId : null,
    createdBy: ctx.userId,
    startDate: toDate(input.start_date),
    dueDate: toDate(input.due_date),
    estimatedMinutes: input.estimated_minutes ?? null,
    tags: input.tags ?? [],
    taskSet: input.task_set?.trim() || null,
    isPrivate: input.is_private ?? false,
    isRecurring: input.is_recurring ?? false,
    recurrenceRule: input.recurrence_rule ?? null,
    sourceModule: input.source_module ?? "manual",
    approverIds,
  };
  validateTaskFields(values);
  await validatePlacement(ctx, { boardId, listId, parentTaskId: values.parentTaskId ?? null });

  // Completarea la creare: aceleași reguli de aprobare ca la o tranziție (fără dependențe).
  if (status === "done") {
    if (approverIds.length > 0 && !approverIds.includes(ctx.userId) && !ctx.isAdmin) throw new TaskError(403, "needs_approval");
    values.completedAt = new Date();
    if (approverIds.length > 0) {
      values.approvedAt = new Date();
      values.approvedBy = ctx.userId;
    }
  }
  values.position = input.position && input.position > 0 ? input.position : await appendPosition(ctx, boardId, listId);

  const [row] = await db.insert(boardTasks).values(values).returning();
  await recordActivity(ctx, null, row);
  await notifyTaskUsers(ctx, row, { assignees: row.assignees, approvers: row.approverIds });
  return row;
}

/** Creare în masă (o linie = un task), în ordinea scrisă, la coada coloanei. */
export async function bulkCreateTasks(ctx: TaskContext, base: Omit<CreateTaskInput, "title">, titles: string[]): Promise<BoardTaskRow[]> {
  const clean = titles.map((t) => t.trim()).filter(Boolean).slice(0, 200);
  const out: BoardTaskRow[] = [];
  for (const title of clean) out.push(await createTask(ctx, { ...base, title, position: 0 }));
  return out;
}

// ─── Task-uri: actualizare ────────────────────────────────────────────────────

export interface TaskPatchInput {
  title?: string;
  description?: string | null;
  list_id?: string | null;
  status?: TaskStatus;
  priority?: string;
  assignees?: string[];
  start_date?: string | null;
  due_date?: string | null;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  tags?: string[];
  task_set?: string | null;
  position?: number;
  is_private?: boolean;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  board_id?: string | null;
  is_milestone?: boolean;
  approver_ids?: string[];
}

/** Câmpurile pe care le poate mișca un responsabil / aprobator fără drept deplin: progresul. */
const PROGRESS_FIELDS = new Set(["status", "listId", "position", "actualMinutes"]);

type RowPatch = Partial<Omit<BoardTaskRow, "id" | "tenantId" | "createdBy" | "createdAt">>;

function toRowPatch(patch: TaskPatchInput): RowPatch {
  const out: RowPatch = {};
  if (patch.title !== undefined) out.title = patch.title.trim();
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.list_id !== undefined) out.listId = patch.list_id;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.assignees !== undefined) out.assignees = patch.assignees;
  if (patch.start_date !== undefined) out.startDate = toDate(patch.start_date);
  if (patch.due_date !== undefined) out.dueDate = toDate(patch.due_date);
  if (patch.estimated_minutes !== undefined) out.estimatedMinutes = patch.estimated_minutes;
  if (patch.actual_minutes !== undefined) out.actualMinutes = patch.actual_minutes;
  if (patch.tags !== undefined) out.tags = patch.tags;
  if (patch.task_set !== undefined) out.taskSet = patch.task_set?.trim() || null;
  if (patch.position !== undefined) out.position = patch.position;
  if (patch.is_private !== undefined) out.isPrivate = patch.is_private;
  if (patch.is_recurring !== undefined) out.isRecurring = patch.is_recurring;
  if (patch.recurrence_rule !== undefined) out.recurrenceRule = patch.recurrence_rule;
  if (patch.is_milestone !== undefined) out.isMilestone = patch.is_milestone;
  if (patch.approver_ids !== undefined) out.approverIds = patch.approver_ids;
  return out;
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date || b instanceof Date) return iso(a as Date | null) === iso(b as Date | null);
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

async function openBlockers(ctx: TaskContext, taskId: string): Promise<{ visible: string[]; hidden: number }> {
  const rows = await db
    .select({ blocker: boardTasks })
    .from(taskDependencies)
    .innerJoin(boardTasks, eq(boardTasks.id, taskDependencies.dependsOnTaskId))
    .where(and(eq(taskDependencies.taskId, taskId), ne(boardTasks.status, "done"), isNull(boardTasks.deletedAt)));
  if (rows.length === 0) return { visible: [], hidden: 0 };
  const facts = await boardRolesFor(ctx, rows.map((r) => r.blocker.boardId).filter((id): id is string => !!id));
  const visible: string[] = [];
  let hidden = 0;
  for (const { blocker } of rows) {
    if (canSeeTask(ctx, blocker, blocker.boardId ? facts.get(blocker.boardId) ?? null : null)) visible.push(blocker.title);
    else hidden += 1;
  }
  return { visible, hidden };
}

/**
 * Scrierea unui task după ce dreptul general a fost verificat. Aici trăiesc garda de câmpuri,
 * completarea/aprobarea, sincronizarea status ↔ coloană și efectele de după scriere.
 * `system: true` = scriere făcută de server (recurență, cascadă) — ocolește garda de câmpuri.
 */
async function applyTaskUpdate(
  ctx: TaskContext,
  before: BoardTaskRow,
  requested: RowPatch,
  opts: { system: boolean },
): Promise<BoardTaskRow> {
  const board = await boardFactsOf(ctx, before.boardId);
  const patch: RowPatch = { ...requested };
  const changed = (key: keyof RowPatch) => key in patch && !sameValue(patch[key], before[key as keyof BoardTaskRow]);

  if (!opts.system) {
    if (!canEditTask(ctx, before, board)) throw forbidden();
    const full = isFullEditor(ctx, before, board);
    if (!full) {
      const blocked = (Object.keys(patch) as Array<keyof RowPatch>).filter((key) => !PROGRESS_FIELDS.has(key) && changed(key));
      if (blocked.length > 0) throw forbidden("Responsabilul poate schimba doar progresul task-ului");
    } else if (changed("isPrivate") && before.createdBy !== ctx.userId && !ctx.isAdmin) {
      throw forbidden("Doar creatorul sau administratorul poate schimba confidențialitatea");
    }
  }

  // Coloana ↔ status, în ambele direcții (sursa o făcea în client; aici o face serverul, deci și
  // vederile globale — care nu știu coloanele boardului — mută cardul corect).
  if (before.boardId) {
    const statusRequested = "status" in patch && patch.status !== before.status;
    const listRequested = "listId" in patch && patch.listId !== before.listId;
    if (statusRequested && !listRequested) {
      const lists = await activeLists(before.boardId);
      const target = listIdForStatus(patch.status as TaskStatus, before.status as TaskStatus, before.listId, lists.map(listLike));
      if (target) patch.listId = target;
    } else if (listRequested && !statusRequested && patch.listId) {
      const [list] = await db.select().from(taskLists).where(eq(taskLists.id, patch.listId)).limit(1);
      if (list) {
        const derived = moveStatusPatch(before.status as TaskStatus, listLike(list));
        if (derived.status) patch.status = derived.status;
      }
    }
  }

  // Responsabili și aprobatori.
  if ("assignees" in patch) {
    patch.assignees = await normalizeAssignees(ctx, patch.assignees ?? []);
    patch.assignedTo = patch.assignees[0] ?? null;
    if (patch.assignees.length > 0 && before.assignees.length === 0) patch.assignedBy = ctx.userId;
  }
  const nextStatus = (patch.status ?? before.status) as TaskStatus;
  if ("approverIds" in patch && changed("approverIds")) {
    if (nextStatus === "done") throw new TaskError(409, "reopen_first");
    patch.approverIds = await validateApprovers(ctx, patch.approverIds ?? []);
    patch.approvedAt = null;
    patch.approvedBy = null;
  }
  const approvers = patch.approverIds ?? before.approverIds ?? [];

  // Completarea (hr_task_guard_completion).
  if (nextStatus === "done" && before.status !== "done") {
    const blockers = await openBlockers(ctx, before.id);
    if (blockers.visible.length > 0 || blockers.hidden > 0) {
      const parts = [...blockers.visible];
      if (blockers.hidden > 0) parts.push(`${blockers.hidden} task(uri) fără acces`);
      throw new TaskError(409, "blocked_by_dependency", `Nu poți finaliza task-ul cât timp dependențele nu sunt gata: ${parts.join(", ")}`);
    }
    if (approvers.length > 0) {
      if (!canApprove(ctx, { approverIds: approvers })) throw new TaskError(403, "needs_approval");
      patch.approvedAt = new Date();
      patch.approvedBy = ctx.userId;
    } else {
      patch.approvedAt = null;
      patch.approvedBy = null;
    }
    patch.completedAt = new Date();
  } else if (nextStatus !== "done") {
    patch.completedAt = null;
    patch.approvedAt = null;
    patch.approvedBy = null;
  }

  const merged = { ...before, ...patch } as BoardTaskRow;
  validateTaskFields(merged);
  if (changed("listId") || changed("parentTaskId") || changed("boardId")) {
    await validatePlacement(ctx, { id: before.id, boardId: merged.boardId, listId: merged.listId, parentTaskId: merged.parentTaskId, deletedAt: merged.deletedAt });
  }

  const [after] = await db
    .update(boardTasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(boardTasks.id, before.id), eq(boardTasks.tenantId, ctx.tenantId)))
    .returning();

  await recordActivity(ctx, before, after);
  await notifyTaskUsers(ctx, after, {
    assignees: after.assignees.filter((a) => !before.assignees.includes(a)),
    approvers: after.approverIds.filter((a) => !before.approverIds.includes(a)),
  });
  if (after.isRecurring && after.status === "done" && before.status !== "done" && !after.deletedAt) {
    await spawnNextOccurrence(ctx, after);
    // Seria a trecut pe rândul nou: cel întors aici nu mai e recurent — recitit, ca UI-ul să nu
    // arate insigna de recurență pe task-ul tocmai închis.
    const [fresh] = await db.select().from(boardTasks).where(eq(boardTasks.id, after.id)).limit(1);
    return fresh ?? after;
  }
  return after;
}

export async function updateTask(ctx: TaskContext, id: string, patch: TaskPatchInput): Promise<BoardTaskRow> {
  const { task } = await loadVisibleTask(ctx, id);
  if (patch.board_id !== undefined && patch.board_id !== task.boardId) {
    await moveTaskToBoard(ctx, id, patch.board_id);
    const rest = { ...patch };
    delete rest.board_id;
    delete rest.list_id;
    const { task: moved } = await loadVisibleTask(ctx, id);
    if (Object.keys(rest).length === 0) return moved;
    return applyTaskUpdate(ctx, moved, toRowPatch(rest), { system: false });
  }
  return applyTaskUpdate(ctx, task, toRowPatch(patch), { system: false });
}

/** Mutarea Kanban: coloană + poziție; statusul îl aliniază coloana-țintă. */
export async function moveTask(ctx: TaskContext, id: string, listId: string | null, position: number): Promise<BoardTaskRow> {
  const { task } = await loadVisibleTask(ctx, id);
  if (!Number.isFinite(position)) throw new TaskError(400, "invalid_data", "Poziție invalidă");
  return applyTaskUpdate(ctx, task, { listId, position }, { system: false });
}

/** Aprobarea = închiderea de către un aprobator (sau administrator). */
export async function approveTask(ctx: TaskContext, id: string): Promise<BoardTaskRow> {
  const { task } = await loadVisibleTask(ctx, id);
  if (!canApprove(ctx, task)) throw new TaskError(403, "needs_approval");
  return applyTaskUpdate(ctx, task, { status: "done" }, { system: false });
}

/** Respingerea trimite task-ul înapoi în lucru, cu motivul ca comentariu. */
export async function rejectTask(ctx: TaskContext, id: string, reason: string): Promise<BoardTaskRow> {
  const { task } = await loadVisibleTask(ctx, id);
  if (!canApprove(ctx, task)) throw forbidden();
  const after = await applyTaskUpdate(ctx, task, { status: "in_progress" }, { system: false });
  if (reason.trim()) await addComment(ctx, id, reason.trim(), []);
  return after;
}

/** „Ia în lucru": un task liber devine al meu, în lucru. */
export async function claimTask(ctx: TaskContext, id: string): Promise<BoardTaskRow> {
  const { task, board } = await loadVisibleTask(ctx, id);
  if (task.assignees.length > 0 || task.isPrivate) throw new TaskError(409, "invalid_data", "Task-ul are deja un responsabil");
  if (!canEditTask(ctx, task, board) && !canEditBoardRole(board?.role ?? null)) throw forbidden();
  if (task.status === "done") throw new TaskError(409, "invalid_data", "Task-ul e deja gata");
  return applyTaskUpdate(ctx, task, { assignees: [ctx.userId], status: "in_progress" }, { system: true });
}

// ─── Mutarea pe alt board ─────────────────────────────────────────────────────

async function descendantIds(rootId: string, onlyDeletedAt?: Date | null): Promise<string[]> {
  const out: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth += 1) {
    const rows = await db
      .select({ id: boardTasks.id, deletedAt: boardTasks.deletedAt })
      .from(boardTasks)
      .where(inArray(boardTasks.parentTaskId, frontier));
    const next: string[] = [];
    for (const row of rows) {
      next.push(row.id);
      if (onlyDeletedAt === undefined || iso(row.deletedAt) === iso(onlyDeletedAt)) out.push(row.id);
    }
    frontier = next;
  }
  return out;
}

/**
 * Cardul aterizează „neîncadrat" pe boardul nou (coloanele diferă), iar subtaskurile îl urmează.
 * `toBoardId = null` = task personal. Se mută doar rădăcina: un subtask nu pleacă singur.
 */
export async function moveTaskToBoard(ctx: TaskContext, id: string, toBoardId: string | null): Promise<void> {
  const { task, board } = await loadVisibleTask(ctx, id);
  if (task.boardId === toBoardId) return;
  if (!isFullEditor(ctx, task, board)) throw forbidden();
  if (task.parentTaskId) throw new TaskError(400, "parent_invalid");
  if (toBoardId) await requireEditableBoard(ctx, toBoardId);
  const position = await appendPosition(ctx, toBoardId, null);
  const ids = [task.id, ...(await descendantIds(task.id))];
  await db.update(boardTasks).set({ boardId: toBoardId, listId: null, updatedAt: new Date() }).where(inArray(boardTasks.id, ids));
  await db.update(boardTasks).set({ position }).where(eq(boardTasks.id, task.id));
  const [after] = await db.select().from(boardTasks).where(eq(boardTasks.id, task.id)).limit(1);
  if (after) await recordActivity(ctx, task, after);
}

// ─── Ștergere / restaurare ────────────────────────────────────────────────────

/** Ștergere soft, cu subtaskurile pe orice adâncime, toate cu ACELAȘI moment (ca să se poată restaura împreună). */
export async function deleteTask(ctx: TaskContext, id: string): Promise<void> {
  const { task, board } = await loadVisibleTask(ctx, id);
  const subtaskAssignee = !!task.parentTaskId && task.assignees.includes(ctx.userId);
  if (!isFullEditor(ctx, task, board) && !subtaskAssignee) throw forbidden();
  const at = new Date();
  const ids = [task.id, ...(await descendantIds(task.id))];
  const deleted = await db
    .update(boardTasks)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(inArray(boardTasks.id, ids), isNull(boardTasks.deletedAt)))
    .returning();
  await db.insert(taskActivity).values(
    deleted.map((row) => ({ tenantId: ctx.tenantId, taskId: row.id, actorId: ctx.userId, action: "deleted", fromValue: null, toValue: null })),
  );
}

/** Anulează o ștergere: task-ul și subtaskurile plecate în ACEEAȘI cascadă (același `deleted_at`). */
export async function restoreTask(ctx: TaskContext, id: string): Promise<number> {
  const task = await loadTaskRow(ctx, id, true);
  if (!task || !task.deletedAt) throw notFound();
  const board = await boardFactsOf(ctx, task.boardId);
  if (!canSoftDelete(ctx, task, board)) throw notFound();
  if (task.parentTaskId) {
    const [parent] = await db.select({ deletedAt: boardTasks.deletedAt }).from(boardTasks).where(eq(boardTasks.id, task.parentTaskId)).limit(1);
    if (parent?.deletedAt) throw new TaskError(400, "parent_invalid");
  }
  const ids = [task.id, ...(await descendantIds(task.id, task.deletedAt))];
  const restored = await db
    .update(boardTasks)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(inArray(boardTasks.id, ids), eq(boardTasks.deletedAt, task.deletedAt)))
    .returning({ id: boardTasks.id });
  return restored.length;
}

// ─── Recurență ────────────────────────────────────────────────────────────────

/** Seria trece pe rândul nou: următoarea ocurență, cu aceleași date, iar rândul închis nu mai e seria. */
async function spawnNextOccurrence(ctx: TaskContext, done: BoardTaskRow): Promise<void> {
  const rule = parseRecurrence(done.recurrenceRule);
  if (!rule) return;
  const next = nextDueAfterCompletion(done.dueDate ?? done.completedAt ?? new Date(), rule);
  if (!next) return;
  let listId = done.listId;
  if (done.boardId) {
    const lists = await activeLists(done.boardId);
    listId = lists.find((l) => l.mapsToStatus === "todo")?.id ?? lists.find((l) => !l.isDoneList)?.id ?? done.listId;
  }
  const startDate =
    done.startDate && done.dueDate ? new Date(next.getTime() - (done.dueDate.getTime() - done.startDate.getTime())) : null;
  const [row] = await db
    .insert(boardTasks)
    .values({
      tenantId: done.tenantId,
      boardId: done.boardId,
      listId,
      createdBy: done.createdBy,
      assignedTo: done.assignedTo,
      assignedBy: done.assignedBy,
      title: done.title,
      description: done.description,
      status: "todo",
      priority: done.priority,
      dueDate: next,
      startDate,
      estimatedMinutes: done.estimatedMinutes,
      sourceModule: done.sourceModule,
      sourceId: done.sourceId,
      isPrivate: done.isPrivate,
      isRecurring: true,
      recurrenceRule: done.recurrenceRule,
      tags: done.tags,
      assignees: done.assignees,
      approverIds: done.approverIds,
      taskSet: done.taskSet,
      isMilestone: done.isMilestone,
      position: await appendPosition(ctx, done.boardId, listId),
    })
    .returning();
  await db.update(boardTasks).set({ isRecurring: false }).where(eq(boardTasks.id, done.id));
  await recordActivity(ctx, null, row);
  await notifyTaskUsers(ctx, row, { assignees: row.assignees, approvers: row.approverIds });
}

/**
 * O zi viitoare a unei serii devine task real — o singură dată per (serie, zi): al doilea apel
 * întoarce același id. Termenul păstrează ora seriei.
 */
export async function materializeOccurrence(ctx: TaskContext, seriesId: string, day: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TaskError(400, "invalid_data", "Zi invalidă");
  // Ziua de azi și trecutul au deja rânduri reale (seria însăși); se materializează doar viitorul.
  if (day <= new Date().toISOString().slice(0, 10)) throw new TaskError(400, "invalid_data", "Se pot materializa doar zile viitoare");
  const { task: series, board } = await loadVisibleTask(ctx, seriesId);
  if (!series.isRecurring) throw new TaskError(400, "invalid_data", "Task-ul nu e recurent");
  if (!canEditTask(ctx, series, board)) throw forbidden();
  const [existing] = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.recurrenceParentId, seriesId), eq(boardTasks.occurrenceDate, day), isNull(boardTasks.deletedAt)))
    .limit(1);
  if (existing) return existing.id;
  const time = series.dueDate ? series.dueDate.toISOString().slice(10) : "T09:00:00.000Z";
  const dueDate = new Date(`${day}${time}`);
  let listId = series.listId;
  if (series.boardId) {
    const lists = await activeLists(series.boardId);
    listId = lists.find((l) => l.mapsToStatus === "todo")?.id ?? lists.find((l) => !l.isDoneList)?.id ?? series.listId;
  }
  try {
    const [row] = await db
      .insert(boardTasks)
      .values({
        tenantId: ctx.tenantId,
        boardId: series.boardId,
        listId,
        createdBy: ctx.userId,
        title: series.title,
        description: series.description,
        status: "todo",
        priority: series.priority,
        assignees: series.assignees,
        assignedTo: series.assignedTo,
        assignedBy: series.assignees.length > 0 ? ctx.userId : null,
        dueDate,
        estimatedMinutes: series.estimatedMinutes,
        isPrivate: series.isPrivate,
        tags: series.tags,
        approverIds: series.approverIds,
        taskSet: series.taskSet,
        recurrenceParentId: series.id,
        occurrenceDate: day,
        position: await appendPosition(ctx, series.boardId, listId),
      })
      .returning();
    await recordActivity(ctx, null, row);
    await notifyTaskUsers(ctx, row, { assignees: row.assignees, approvers: row.approverIds });
    return row.id;
  } catch (error) {
    // Două clicuri simultane pe aceeași zi: indexul unic a păstrat primul rând — îl întoarcem.
    const [again] = await db
      .select({ id: boardTasks.id })
      .from(boardTasks)
      .where(and(eq(boardTasks.recurrenceParentId, seriesId), eq(boardTasks.occurrenceDate, day)))
      .limit(1);
    if (again) return again.id;
    throw error;
  }
}

// ─── Comentarii ───────────────────────────────────────────────────────────────

const MENTION_TOKEN = /@\[([0-9a-fA-F-]{36})\]/g;

export function extractMentions(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(MENTION_TOKEN)) {
    const id = match[1].toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export async function listComments(ctx: TaskContext, taskId: string) {
  await loadVisibleTask(ctx, taskId);
  return db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).orderBy(asc(taskComments.createdAt));
}

/** Cine vede task-ul poate comenta. Mențiunile se derivă din text și primesc notificare. */
export async function addComment(ctx: TaskContext, taskId: string, content: string, attachments: TaskCommentAttachment[]) {
  const { task } = await loadVisibleTask(ctx, taskId);
  const text = content.trim();
  if (!text && attachments.length === 0) throw new TaskError(400, "invalid_data", "Comentariul gol nu este permis");
  if (text.length > 20_000) throw new TaskError(400, "invalid_data", "Comentariul depășește 20000 caractere");
  if (attachments.length > 10) throw new TaskError(400, "too_many");
  for (const a of attachments) {
    // Calea vine de la client: doar obiecte din folderul workspace-ului, fără „..".
    if (!isSafeTenantObjectPath(a.path, ctx.tenantId) || a.path.length > 500 || !a.name || a.name.length > 255 || a.size > 10 * 1024 * 1024) {
      throw new TaskError(400, "invalid_data", "Metadate de atașament invalide");
    }
  }
  const mentioned = extractMentions(text);
  if (mentioned.length > 25) throw new TaskError(400, "too_many");
  const valid = await activeStaffIds(ctx.tenantId, mentioned);
  if (mentioned.some((id) => !valid.has(id))) throw forbidden("Poți menționa doar colegi activi din organizație");
  const [row] = await db
    .insert(taskComments)
    .values({ tenantId: ctx.tenantId, taskId, userId: ctx.userId, content: text, attachments, mentions: mentioned })
    .returning();
  await notifyTaskComment(ctx, task, row);
  return row;
}

export async function deleteComment(ctx: TaskContext, commentId: string): Promise<void> {
  const [comment] = await db
    .select()
    .from(taskComments)
    .where(and(eq(taskComments.id, commentId), eq(taskComments.tenantId, ctx.tenantId)))
    .limit(1);
  if (!comment) throw notFound();
  await loadVisibleTask(ctx, comment.taskId);
  if (comment.userId !== ctx.userId && !ctx.isAdmin) throw forbidden();
  await db.delete(taskComments).where(eq(taskComments.id, commentId));
}

// ─── Dependențe ───────────────────────────────────────────────────────────────

export async function addDependency(ctx: TaskContext, taskId: string, dependsOnId: string): Promise<void> {
  if (taskId === dependsOnId) throw new TaskError(400, "cycle");
  const { task, board } = await loadVisibleTask(ctx, taskId);
  if (!canEditTask(ctx, task, board)) throw forbidden();
  await loadVisibleTask(ctx, dependsOnId);
  // Circular: `dependsOnId` nu are voie să aștepte (direct sau prin lanț) după `taskId`.
  const chain = new Set([taskId]);
  let frontier = [taskId];
  for (let depth = 0; depth < 200 && frontier.length > 0; depth += 1) {
    const rows = await db
      .select({ id: taskDependencies.taskId })
      .from(taskDependencies)
      .where(inArray(taskDependencies.dependsOnTaskId, frontier));
    frontier = rows.map((r) => r.id).filter((id) => !chain.has(id));
    for (const id of frontier) chain.add(id);
  }
  if (chain.has(dependsOnId)) throw new TaskError(400, "cycle");
  await db
    .insert(taskDependencies)
    .values({ tenantId: ctx.tenantId, taskId, dependsOnTaskId: dependsOnId })
    .onConflictDoNothing();
}

export async function removeDependency(ctx: TaskContext, id: string): Promise<void> {
  const [dep] = await db
    .select()
    .from(taskDependencies)
    .where(and(eq(taskDependencies.id, id), eq(taskDependencies.tenantId, ctx.tenantId)))
    .limit(1);
  if (!dep) throw notFound();
  const { task, board } = await loadVisibleTask(ctx, dep.taskId);
  if (!canEditTask(ctx, task, board)) throw forbidden();
  await db.delete(taskDependencies).where(eq(taskDependencies.id, id));
}

/** Legăturile vizibile (ambele capete vizibile) pentru task-urile date, într-un sens sau altul. */
export async function queryDependencies(ctx: TaskContext, taskIds: string[], direction: "blocked_by" | "blocking") {
  const ids = [...new Set(taskIds)].slice(0, 2000);
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.tenantId, ctx.tenantId),
        direction === "blocked_by" ? inArray(taskDependencies.taskId, ids) : inArray(taskDependencies.dependsOnTaskId, ids),
      ),
    );
  if (rows.length === 0) return [];
  const involved = [...new Set(rows.flatMap((r) => [r.taskId, r.dependsOnTaskId]))];
  const tasks = await db.select().from(boardTasks).where(and(inArray(boardTasks.id, involved), eq(boardTasks.tenantId, ctx.tenantId)));
  const facts = await boardRolesFor(ctx, tasks.map((t) => t.boardId).filter((b): b is string => !!b));
  const visible = new Set(
    tasks.filter((t) => canSeeTask(ctx, t, t.boardId ? facts.get(t.boardId) ?? null : null)).map((t) => t.id),
  );
  return rows.filter((r) => visible.has(r.taskId) && visible.has(r.dependsOnTaskId));
}

// ─── Aprobări ─────────────────────────────────────────────────────────────────

/** Câte task-uri îmi așteaptă aprobarea: sunt aprobator, task-ul nu e gata și nici aprobat. */
export async function countPendingApprovals(ctx: TaskContext): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardTasks)
    .where(
      and(
        eq(boardTasks.tenantId, ctx.tenantId),
        isNull(boardTasks.deletedAt),
        ne(boardTasks.status, "done"),
        eq(boardTasks.isPrivate, false),
        isNull(boardTasks.parentTaskId),
        sql`${boardTasks.approverIds} @> ${JSON.stringify([ctx.userId])}::jsonb`,
      ),
    );
  return Number(row?.n ?? 0);
}

