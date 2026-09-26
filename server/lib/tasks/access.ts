/**
 * Cine poate ce în managerul de task-uri — O SINGURĂ sursă, folosită de citire ȘI de scriere.
 *
 * În HR365 regulile trăiau în funcții SQL (`hr_task_board_access`, `hr_task_can_see`,
 * `hr_task_can_edit`, `hr_task_can_soft_delete`) apelate de RLS, triggere și RPC-uri. Aici sunt
 * aceleași reguli, în aceeași ordine de evaluare, ca funcții TypeScript — iar rutele NU au voie
 * să-și scrie propriile verificări: altfel un buton afișat (calculat cu o regulă) și o scriere
 * (verificată cu alta) ajung să spună lucruri diferite.
 *
 * Maparea rolurilor:
 *   HR admin (sursă)          → administratorul workspace-ului (`users.role = 'admin'`)
 *   manager (`is_manager`)    → `users.role = 'manager'`
 *   organigrama (șef/subalterni/departament) → ECHIPELE workspace-ului (`par_teams`)
 *   super admin               → nu există în interiorul unui workspace (impersonarea intră ca omul)
 *
 * Extensia față de forma finală a sursei — echipele: un board poate fi deschis unei echipe
 * (`visibility = 'team'`) sau întregii organizații (`'company'`). Sursa introdusese exact asta
 * (v10, „modelul Asana") și o pierduse ulterior la rescrierea funcției de acces; ownerul a cerut
 * explicit echipe. Membrul nominal bate întotdeauna grantul de echipă.
 */
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import type { User } from "../../db/schema/users";
import {
  boardTasks,
  taskBoardMembers,
  taskBoards,
  taskVisibilityRules,
  type BoardTaskRow,
  type TaskBoardRow,
} from "../../db/schema/tasks";
import { teammateUserIds } from "../par/teamScope";
import { activeTeamIdsOf } from "../teams";

export type BoardRole = "viewer" | "editor" | "admin";
export type VisibilityScope = "own" | "team" | "company";

export interface TaskContext {
  userId: string;
  tenantId: string;
  /** Administratorul workspace-ului: vede și poate tot (mai puțin task-urile private ale altora). */
  isAdmin: boolean;
  isManager: boolean;
  /** Echipele ACTIVE din care fac parte. */
  teamIds: Set<string>;
  /** Oamenii cu care împart cel puțin o echipă activă (fără mine). */
  teammateIds: Set<string>;
  /** Ce task-uri ale ALTORA văd, pe lângă ale mele (regulile de vizibilitate). */
  scope: VisibilityScope;
}

// ─── Contextul cererii ────────────────────────────────────────────────────────

/**
 * Domeniul de vizibilitate, cu precedența din sursă: regula pe persoană > regula pentru manageri
 * (doar dacă ești manager) > regula pentru toți > presetarea (manager → echipa, restul → doar ale lui).
 * Administratorul vede mereu toată organizația.
 */
export function resolveScope(
  isAdmin: boolean,
  isManager: boolean,
  rules: { subjectType: string; subjectUserId: string | null; scope: string }[],
  userId: string,
): VisibilityScope {
  if (isAdmin) return "company";
  const valid = (s: string | undefined): s is VisibilityScope => s === "own" || s === "team" || s === "company";
  const personal = rules.find((r) => r.subjectType === "user" && r.subjectUserId === userId)?.scope;
  if (valid(personal)) return personal;
  if (isManager) {
    const managers = rules.find((r) => r.subjectType === "managers")?.scope;
    if (valid(managers)) return managers;
  }
  const everyone = rules.find((r) => r.subjectType === "all_employees")?.scope;
  if (valid(everyone)) return everyone;
  return isManager ? "team" : "own";
}

export async function loadTaskContext(user: Pick<User, "id" | "tenantId" | "role">): Promise<TaskContext> {
  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const [teamIds, teammates, rules] = await Promise.all([
    activeTeamIdsOf(user.id, user.tenantId),
    teammateUserIds(user.id, user.tenantId),
    isAdmin
      ? Promise.resolve([])
      : db
          .select({
            subjectType: taskVisibilityRules.subjectType,
            subjectUserId: taskVisibilityRules.subjectUserId,
            scope: taskVisibilityRules.scope,
          })
          .from(taskVisibilityRules)
          .where(eq(taskVisibilityRules.tenantId, user.tenantId)),
  ]);
  return {
    userId: user.id,
    tenantId: user.tenantId,
    isAdmin,
    isManager,
    teamIds: new Set(teamIds),
    teammateIds: new Set(teammates),
    scope: resolveScope(isAdmin, isManager, rules, user.id),
  };
}

// ─── Boarduri ─────────────────────────────────────────────────────────────────

type BoardAccessInput = Pick<TaskBoardRow, "tenantId" | "visibility" | "teamId" | "createdBy">;

/**
 * Rolul apelantului pe un board, sau `null` dacă nu-l vede. Ordinea contează:
 * administratorul → membrul nominal → creatorul → grantul de organizație → grantul de echipă.
 */
export function boardRole(ctx: TaskContext, board: BoardAccessInput, memberRole: string | null | undefined): BoardRole | null {
  if (board.tenantId !== ctx.tenantId) return null;
  if (ctx.isAdmin) return "admin";
  if (memberRole === "viewer" || memberRole === "editor" || memberRole === "admin") return memberRole;
  // Creatorul intră ca admin la creare; dacă rândul lui de membru dispare, boardul rămâne al lui.
  if (board.createdBy && board.createdBy === ctx.userId) return "admin";
  if (board.visibility === "company") return "editor";
  if (board.visibility === "team" && board.teamId && ctx.teamIds.has(board.teamId)) return "editor";
  return null;
}

export const canViewBoardRole = (role: BoardRole | null): boolean => role !== null;
export const canEditBoardRole = (role: BoardRole | null): boolean => role === "editor" || role === "admin";

/** Drepturile pe care UI-ul le primește odată cu boardul — ca butoanele să nu mintă. */
export function boardRights(
  role: BoardRole | null,
  board: Pick<TaskBoardRow, "isDefault">,
): { can_edit: boolean; can_delete: boolean; my_role: BoardRole | null } {
  return { can_edit: role === "admin", can_delete: role === "admin" && !board.isDefault, my_role: role };
}

/** Toate boardurile workspace-ului pe care apelantul le vede, cu rolul lui pe fiecare. */
export async function visibleBoards(ctx: TaskContext): Promise<Array<{ board: TaskBoardRow; role: BoardRole }>> {
  const [boards, memberships] = await Promise.all([
    db.select().from(taskBoards).where(eq(taskBoards.tenantId, ctx.tenantId)),
    db
      .select({ boardId: taskBoardMembers.boardId, role: taskBoardMembers.role })
      .from(taskBoardMembers)
      .where(and(eq(taskBoardMembers.tenantId, ctx.tenantId), eq(taskBoardMembers.userId, ctx.userId))),
  ]);
  const mine = new Map(memberships.map((m) => [m.boardId, m.role]));
  const out: Array<{ board: TaskBoardRow; role: BoardRole }> = [];
  for (const board of boards) {
    const role = boardRole(ctx, board, mine.get(board.id));
    if (role) out.push({ board, role });
  }
  return out;
}

/** Un singur board, cu rolul apelantului (`null` dacă nu-l vede sau nu există în workspace). */
export async function loadBoardWithRole(
  ctx: TaskContext,
  boardId: string,
): Promise<{ board: TaskBoardRow; role: BoardRole | null } | null> {
  const [board] = await db
    .select()
    .from(taskBoards)
    .where(and(eq(taskBoards.id, boardId), eq(taskBoards.tenantId, ctx.tenantId)))
    .limit(1);
  if (!board) return null;
  const [member] = await db
    .select({ role: taskBoardMembers.role })
    .from(taskBoardMembers)
    .where(and(eq(taskBoardMembers.boardId, boardId), eq(taskBoardMembers.userId, ctx.userId)))
    .limit(1);
  return { board, role: boardRole(ctx, board, member?.role) };
}

/** Rolurile apelantului pe boardurile date (o interogare), pentru deciziile pe mai multe task-uri. */
export async function boardRolesFor(
  ctx: TaskContext,
  boardIds: string[],
): Promise<Map<string, { role: BoardRole | null; createdBy: string | null }>> {
  const ids = [...new Set(boardIds)];
  const out = new Map<string, { role: BoardRole | null; createdBy: string | null }>();
  if (ids.length === 0) return out;
  const [boards, memberships] = await Promise.all([
    db
      .select()
      .from(taskBoards)
      .where(and(eq(taskBoards.tenantId, ctx.tenantId), inArray(taskBoards.id, ids))),
    db
      .select({ boardId: taskBoardMembers.boardId, role: taskBoardMembers.role })
      .from(taskBoardMembers)
      .where(and(eq(taskBoardMembers.userId, ctx.userId), inArray(taskBoardMembers.boardId, ids))),
  ]);
  const mine = new Map(memberships.map((m) => [m.boardId, m.role]));
  for (const board of boards) {
    out.set(board.id, { role: boardRole(ctx, board, mine.get(board.id)), createdBy: board.createdBy });
  }
  return out;
}

// ─── Task-uri ─────────────────────────────────────────────────────────────────

type TaskAccessInput = Pick<
  BoardTaskRow,
  "tenantId" | "deletedAt" | "isPrivate" | "createdBy" | "assignees" | "approverIds" | "boardId" | "parentTaskId"
>;

export interface BoardFacts {
  role: BoardRole | null;
  createdBy: string | null;
}

/** Task-ul e „al cuiva din aria mea"? Aria se aplică RESPONSABILILOR (task-ul e al celor care îl fac). */
export function ownerInScope(ctx: TaskContext, assignees: readonly string[]): boolean {
  if (assignees.includes(ctx.userId)) return true;
  if (ctx.scope === "company") return assignees.length > 0;
  if (ctx.scope === "team") return assignees.some((a) => ctx.teammateIds.has(a));
  return false;
}

/**
 * Vede apelantul task-ul? (`hr_task_can_see`, forma finală + grantul de echipă prin rolul de board)
 * - șters → nimeni; privat → doar creatorul (nici administratorul, nici responsabilii);
 * - administratorul vede tot restul;
 * - altfel: creatorul, responsabilii (și cei care îi au în arie), aprobatorii, editorii/adminii
 *   boardului și creatorul boardului. Un membru `viewer` NU vede task-urile altora de pe board.
 */
export function canSeeTask(ctx: TaskContext, task: TaskAccessInput, board: BoardFacts | null): boolean {
  if (task.tenantId !== ctx.tenantId || task.deletedAt) return false;
  if (task.isPrivate) return task.createdBy === ctx.userId;
  if (ctx.isAdmin) return true;
  if (task.createdBy === ctx.userId) return true;
  if (ownerInScope(ctx, task.assignees ?? [])) return true;
  if ((task.approverIds ?? []).includes(ctx.userId)) return true;
  if (task.boardId && board) {
    if (canEditBoardRole(board.role)) return true;
    if (board.createdBy && board.createdBy === ctx.userId) return true;
  }
  return false;
}

/** Poate scrie ceva pe task? (`hr_task_can_edit`) — CE anume decide `isFullEditor`. */
export function canEditTask(ctx: TaskContext, task: TaskAccessInput, board: BoardFacts | null): boolean {
  if (!canSeeTask(ctx, task, board)) return false;
  return (
    ctx.isAdmin ||
    task.createdBy === ctx.userId ||
    (task.assignees ?? []).includes(ctx.userId) ||
    (task.approverIds ?? []).includes(ctx.userId) ||
    canEditBoardRole(board?.role ?? null)
  );
}

/**
 * Drept DEPLIN (titlu, descriere, responsabili, termene, ștergere…): administratorul, creatorul
 * task-ului, editorii/adminii boardului lui și creatorul boardului. Responsabilii și aprobatorii
 * fără drept deplin mută doar progresul (vezi `PROGRESS_FIELDS`).
 */
export function isFullEditor(ctx: TaskContext, task: TaskAccessInput, board: BoardFacts | null): boolean {
  if (ctx.isAdmin) return true;
  if (task.createdBy === ctx.userId) return true;
  if (!task.boardId || !board) return false;
  return canEditBoardRole(board.role) || (!!board.createdBy && board.createdBy === ctx.userId);
}

/** Poate șterge (soft) sau restaura task-ul? Responsabilul poate doar pe SUBTASK-uri. */
export function canSoftDelete(ctx: TaskContext, task: TaskAccessInput, board: BoardFacts | null): boolean {
  if (task.tenantId !== ctx.tenantId) return false;
  if (ctx.isAdmin || task.createdBy === ctx.userId) return true;
  if (task.boardId && canEditBoardRole(board?.role ?? null)) return true;
  return !!task.parentTaskId && (task.assignees ?? []).includes(ctx.userId);
}

/** Poate aproba închiderea? Orice aprobator ajunge; administratorul poate oricând. */
export function canApprove(ctx: TaskContext, task: Pick<BoardTaskRow, "approverIds">): boolean {
  return ctx.isAdmin || (task.approverIds ?? []).includes(ctx.userId);
}

/** `ARRAY['a','b']::text[]` cu parametri legați — pentru operatorul jsonb `?|` („oricare dintre"). */
function textArray(values: string[]): SQL {
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * Filtrul SQL pentru „task-urile pe care le vede apelantul" — aceeași regulă ca `canSeeTask`,
 * exprimată ca WHERE, ca listele mari să nu fie aduse întregi și filtrate în memorie.
 * `boardIds` = boardurile unde e editor/admin (inclusiv prin echipă/organizație) plus cele create
 * de el: acolo vede toate task-urile nepersonale.
 */
export function visibleTasksWhere(ctx: TaskContext, boardIds: string[]): SQL {
  const tenant = eq(boardTasks.tenantId, ctx.tenantId);
  const alive = isNull(boardTasks.deletedAt);
  const privateMine = and(eq(boardTasks.isPrivate, true), eq(boardTasks.createdBy, ctx.userId)) as SQL;
  if (ctx.isAdmin) return and(tenant, alive, or(eq(boardTasks.isPrivate, false), privateMine)) as SQL;

  const paths: SQL[] = [
    eq(boardTasks.createdBy, ctx.userId),
    sql`${boardTasks.assignees} @> ${JSON.stringify([ctx.userId])}::jsonb`,
    sql`${boardTasks.approverIds} @> ${JSON.stringify([ctx.userId])}::jsonb`,
  ];
  if (ctx.scope === "company") paths.push(sql`jsonb_array_length(${boardTasks.assignees}) > 0`);
  else if (ctx.scope === "team" && ctx.teammateIds.size > 0) {
    paths.push(sql`${boardTasks.assignees} ?| ${textArray([...ctx.teammateIds])}`);
  }
  const boards = [...new Set(boardIds)];
  if (boards.length > 0) paths.push(inArray(boardTasks.boardId, boards));
  return and(tenant, alive, or(and(eq(boardTasks.isPrivate, false), or(...paths)), privateMine)) as SQL;
}

/** Boardurile unde apelantul vede toate task-urile nepersonale: editor/admin sau creator. */
export function taskBoardIds(visible: Array<{ board: TaskBoardRow; role: BoardRole }>, ctx: TaskContext): string[] {
  return visible
    .filter(({ board, role }) => canEditBoardRole(role) || board.createdBy === ctx.userId)
    .map(({ board }) => board.id);
}
