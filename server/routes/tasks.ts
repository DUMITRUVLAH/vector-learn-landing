/**
 * TASKS-001 — API-ul managerului de task-uri. Montat în server/app.ts: `/api/tasks`, după
 * `requireAuth` + `requireTenantModule("tasks")` (modulul se pornește per workspace din Consola
 * Platformă).
 *
 * Rutele sunt subțiri: validează forma cererii (zod) și cheamă `server/lib/tasks/service.ts`,
 * unde trăiesc regulile. Drepturile se decid într-un singur loc, `server/lib/tasks/access.ts`,
 * pentru citire și scriere deopotrivă. Răspunsurile au forma din `src/lib/tasks/types.ts`
 * (snake_case, ca în HR365, de unde e portat modulul).
 *
 *   GET    /me                                   identitatea în modul
 *   GET    /boards?archived=true|false|all&boardId=   boardurile vizibile, cu drepturile mele
 *   POST   /boards                               board nou (+ coloane, creatorul admin)
 *   PATCH  /boards/:id                           nume/descriere/culoare/vizibilitate/echipă/arhivare
 *   DELETE /boards/:id                           șterge boardul cu task-urile lui
 *   GET    /boards/:id/task-count                câte task-uri active are
 *   POST   /boards/:id/star                      steaua mea (toggle)
 *   GET    /boards/:id/lists?archived=1          coloanele
 *   POST   /boards/:id/lists                     coloană nouă
 *   GET    /boards/:id/members                   membrii
 *   PUT    /boards/:id/members/:userId           adaugă / schimbă rolul
 *   DELETE /boards/:id/members/:userId           scoate
 *   POST   /boards/:id/members/team              adaugă o echipă întreagă
 *   GET    /boards/:id/tasks                     task-urile boardului (fără coloanele arhivate)
 *   PATCH  /lists/:id                            coloana (nume, poziție, culoare, statusul impus, arhivare)
 *   GET    /lists/:id/task-count · POST /lists/:id/duplicate · /move-all · /sort · /reorder
 *   GET    /tasks?scope=all|mine|available       vederile transversale
 *   POST   /tasks · POST /tasks/bulk             creare
 *   GET    /tasks/:id · PATCH /tasks/:id · DELETE /tasks/:id
 *   POST   /tasks/:id/move · /move-board · /restore · /approve · /reject · /claim · /occurrences
 *   GET    /tasks/:id/subtasks · /activity · /comments   POST /tasks/:id/comments
 *   POST   /tasks/:id/attachments/sign · /finalize   GET /tasks/:id/attachments/file?path=
 *   DELETE /comments/:id
 *   POST   /comment-counts · /occurrences · /dependencies/query · /dependencies   DELETE /dependencies/:id
 *   GET    /approvals/count · /search?q= · /people · /assignable?boardId=
 *   GET|PUT /view-prefs/:key
 *   GET|PUT /visibility-rules · DELETE /visibility-rules/:id             (administratorul)
 *   GET    /teams · /teams/selectable   POST /teams · PATCH|DELETE /teams/:id
 *   POST   /teams/:id/members · DELETE /teams/:id/members/:userId       (administratorul)
 */
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parTeams } from "../db/schema/par";
import {
  boardTasks,
  taskActivity,
  taskComments,
  taskLists,
  taskViewPrefs,
  taskVisibilityRules,
} from "../db/schema/tasks";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  boardRights,
  canEditBoardRole,
  loadBoardWithRole,
  loadTaskContext,
  taskBoardIds,
  visibleBoards,
  visibleTasksWhere,
  type TaskContext,
} from "../lib/tasks/access";
import {
  activityDto,
  boardDto,
  commentDto,
  dependencyDto,
  listDto,
  memberDto,
  ruleDto,
  taskDto,
} from "../lib/tasks/dto";
import * as svc from "../lib/tasks/service";
import { TaskError } from "../lib/tasks/service";
import { syncDueSoon } from "../lib/tasks/notify";
import { activeStaffIds, listAssignable, listPeople } from "../lib/tasks/people";
import { addTeamMembers, listWorkspaceTeams, selectableTeams, teamsWithMembers } from "../lib/teams";
import { parTeamMembers } from "../db/schema/par";
import { downloadObject, removeObjects, signUploads } from "../lib/storage/objectStore";
import { isSafeTenantObjectPath } from "../lib/storage/safePath";
import { magicBytesMatchBuffer } from "./parAttachments";
import { contentDisposition } from "../lib/http/contentDisposition";
import { writeAuditLog } from "../lib/auditLogger";
import { clientIp } from "../lib/clientIp";

type Vars = AuthVariables & { taskCtx: TaskContext };

export const tasksRoutes = new Hono<{ Variables: Vars }>();
tasksRoutes.use("*", requireAuth);
// Contextul (echipe, coechipieri, regula de vizibilitate) se încarcă o dată per cerere.
tasksRoutes.use("*", async (c, next) => {
  c.set("taskCtx", await loadTaskContext(c.get("user")));
  await next();
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_RE);

/** Parametrii de rută care nu sunt UUID-uri → 404, nu 500 din Postgres („invalid input syntax"). */
function idParam(c: Context<{ Variables: Vars }>, name = "id"): string {
  const value = c.req.param(name) ?? "";
  if (!UUID_RE.test(value)) throw new TaskError(404, "not_found");
  return value;
}

tasksRoutes.onError((error, c) => {
  if (error instanceof TaskError) return c.json({ error: error.code, detail: error.message }, error.status);
  console.error("[tasks] eroare neașteptată:", error);
  return c.json({ error: "server_error" }, 500);
});

const ctxOf = (c: Context<{ Variables: Vars }>) => c.get("taskCtx");

// ─── Identitate ───────────────────────────────────────────────────────────────

tasksRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const ctx = ctxOf(c);
  await syncDueSoon(ctx);
  return c.json({
    me: {
      user_id: user.id,
      full_name: user.name?.trim() || user.email,
      is_admin: ctx.isAdmin,
      is_manager: ctx.isManager,
      tenant_id: user.tenantId,
    },
  });
});

// ─── Boarduri ─────────────────────────────────────────────────────────────────

tasksRoutes.get("/boards", async (c) => {
  const ctx = ctxOf(c);
  const archived = c.req.query("archived") ?? "false";
  const boardId = c.req.query("boardId");
  const rows = await visibleBoards(ctx);
  const filtered = rows
    .filter(({ board }) => (boardId ? board.id === boardId : true))
    .filter(({ board }) => (archived === "all" ? true : archived === "true" ? !!board.archivedAt : !board.archivedAt))
    .sort((a, b) => Number(b.board.isDefault) - Number(a.board.isDefault) || a.board.createdAt.getTime() - b.board.createdAt.getTime());
  // `starred_by` spune doar dacă EU am dat stea — nu cine altcineva și-a fixat boardul.
  return c.json({
    boards: filtered.map(({ board, role }) =>
      boardDto({ ...board, starredBy: (board.starredBy ?? []).includes(ctx.userId) ? [ctx.userId] : [] }, boardRights(role, board)),
    ),
  });
});

const listSeed = z.object({
  name: z.string().trim().min(1).max(200),
  is_done_list: z.boolean().optional(),
  color: z.string().max(50).optional(),
  maps_to_status: z.enum(["todo", "in_progress", "pending", "done"]).nullable().optional(),
});

const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  color: z.string().min(1).max(50).optional(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  team_id: uuid.nullable().optional(),
  lists: z.array(listSeed).max(20).nullable().optional(),
});

tasksRoutes.post("/boards", zValidator("json", createBoardSchema), async (c) => {
  const ctx = ctxOf(c);
  const body = c.req.valid("json");
  const board = await svc.createBoard(ctx, { ...body, lists: body.lists ?? undefined });
  return c.json({ board: boardDto(board, boardRights("admin", board)) }, 201);
});

const boardPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(10_000).nullable().optional(),
  color: z.string().min(1).max(50).optional(),
  visibility: z.enum(["private", "team", "company"]).optional(),
  team_id: uuid.nullable().optional(),
  archived: z.boolean().optional(),
});

tasksRoutes.patch("/boards/:id", zValidator("json", boardPatchSchema), async (c) => {
  await svc.updateBoard(ctxOf(c), idParam(c), c.req.valid("json"));
  return c.json({ ok: true });
});

tasksRoutes.delete("/boards/:id", async (c) => {
  const deleted = await svc.deleteBoard(ctxOf(c), idParam(c));
  return c.json({ deleted });
});

tasksRoutes.get("/boards/:id/task-count", async (c) => c.json({ count: await svc.countBoardTasks(ctxOf(c), idParam(c)) }));

tasksRoutes.post("/boards/:id/star", async (c) => c.json({ starred: await svc.toggleStar(ctxOf(c), idParam(c)) }));

tasksRoutes.get("/boards/:id/lists", async (c) => {
  const lists = await svc.listBoardLists(ctxOf(c), idParam(c), c.req.query("archived") === "1");
  return c.json({ lists: lists.map(listDto) });
});

tasksRoutes.post("/boards/:id/lists", zValidator("json", listSeed), async (c) => {
  const list = await svc.createList(ctxOf(c), idParam(c), c.req.valid("json"));
  return c.json({ list: listDto(list) }, 201);
});

tasksRoutes.get("/boards/:id/members", async (c) => {
  const members = await svc.listMembers(ctxOf(c), idParam(c));
  return c.json({ members: members.map(memberDto) });
});

tasksRoutes.post(
  "/boards/:id/members/team",
  zValidator("json", z.object({ team_id: uuid, role: z.enum(["viewer", "editor", "admin"]).default("editor") })),
  async (c) => {
    const ctx = ctxOf(c);
    const { team_id, role } = c.req.valid("json");
    const [team] = await db
      .select({ id: parTeams.id })
      .from(parTeams)
      .where(and(eq(parTeams.id, team_id), eq(parTeams.tenantId, ctx.tenantId)))
      .limit(1);
    if (!team) throw new TaskError(404, "not_found");
    const [withMembers] = await teamsWithMembers(ctx.tenantId, [{ id: team.id, name: "", active: true, createdAt: new Date() }]);
    const added = await svc.addTeamToBoard(ctx, idParam(c), withMembers.members.map((m) => m.userId), role);
    return c.json({ added });
  },
);

tasksRoutes.put(
  "/boards/:id/members/:userId",
  zValidator("json", z.object({ role: z.enum(["viewer", "editor", "admin"]) })),
  async (c) => {
    await svc.upsertMember(ctxOf(c), idParam(c), idParam(c, "userId"), c.req.valid("json").role);
    return c.json({ ok: true });
  },
);

tasksRoutes.delete("/boards/:id/members/:userId", async (c) => {
  await svc.removeMember(ctxOf(c), idParam(c), idParam(c, "userId"));
  return c.json({ ok: true });
});

/** Task-urile unui board pe care apelantul le vede, fără cele din coloane arhivate. */
tasksRoutes.get("/boards/:id/tasks", async (c) => {
  const ctx = ctxOf(c);
  const boardId = idParam(c);
  const loaded = await loadBoardWithRole(ctx, boardId);
  if (!loaded || !loaded.role) throw new TaskError(404, "not_found");
  const boardsForTasks = canEditBoardRole(loaded.role) || loaded.board.createdBy === ctx.userId ? [boardId] : [];
  const [rows, archived] = await Promise.all([
    db
      .select()
      .from(boardTasks)
      .where(and(eq(boardTasks.boardId, boardId), visibleTasksWhere(ctx, boardsForTasks)))
      .orderBy(asc(boardTasks.position)),
    db
      .select({ id: taskLists.id })
      .from(taskLists)
      .where(and(eq(taskLists.boardId, boardId), isNotNull(taskLists.archivedAt))),
  ]);
  const hidden = new Set(archived.map((l) => l.id));
  return c.json({ tasks: rows.filter((t) => !t.listId || !hidden.has(t.listId)).map(taskDto) });
});

// ─── Coloane ──────────────────────────────────────────────────────────────────

const listPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  position: z.number().finite().optional(),
  is_done_list: z.boolean().optional(),
  color: z.string().min(1).max(50).optional(),
  maps_to_status: z.enum(["todo", "in_progress", "pending", "done"]).nullable().optional(),
  archived: z.boolean().optional(),
});

tasksRoutes.patch("/lists/:id", zValidator("json", listPatchSchema), async (c) => {
  await svc.updateList(ctxOf(c), idParam(c), c.req.valid("json"));
  return c.json({ ok: true });
});

tasksRoutes.get("/lists/:id/task-count", async (c) => c.json({ count: await svc.countListTasks(ctxOf(c), idParam(c)) }));

tasksRoutes.post("/lists/:id/duplicate", zValidator("json", z.object({ copy_suffix: z.string().max(40).default("(copie)") })), async (c) => {
  await svc.duplicateList(ctxOf(c), idParam(c), c.req.valid("json").copy_suffix);
  return c.json({ ok: true });
});

tasksRoutes.post("/lists/:id/move-all", zValidator("json", z.object({ to_list_id: uuid })), async (c) => {
  const moved = await svc.moveAllToList(ctxOf(c), idParam(c), c.req.valid("json").to_list_id);
  return c.json({ moved });
});

tasksRoutes.post("/lists/:id/sort", zValidator("json", z.object({ key: z.string().max(20) })), async (c) => {
  await svc.sortList(ctxOf(c), idParam(c), c.req.valid("json").key);
  return c.json({ ok: true });
});

tasksRoutes.post("/lists/:id/reorder", zValidator("json", z.object({ direction: z.union([z.literal(-1), z.literal(1)]) })), async (c) => {
  await svc.reorderList(ctxOf(c), idParam(c), c.req.valid("json").direction);
  return c.json({ ok: true });
});

// ─── Task-uri: vederi transversale ────────────────────────────────────────────

/** Plafonul unei vederi transversale: peste el, clientul trebuie să filtreze pe server. */
const MAX_LIST = 5000;

tasksRoutes.get("/tasks", async (c) => {
  const ctx = ctxOf(c);
  const scope = c.req.query("scope") ?? "all";
  const boards = await visibleBoards(ctx);
  const where = visibleTasksWhere(ctx, taskBoardIds(boards, ctx));
  if (scope === "mine") {
    const rows = await db
      .select()
      .from(boardTasks)
      .where(and(where, sql`${boardTasks.assignees} @> ${JSON.stringify([ctx.userId])}::jsonb`))
      .orderBy(asc(boardTasks.dueDate), asc(boardTasks.id))
      .limit(MAX_LIST);
    return c.json({ tasks: rows.map(taskDto) });
  }
  if (scope === "available") {
    const rows = await db
      .select()
      .from(boardTasks)
      .where(
        and(
          where,
          isNull(boardTasks.parentTaskId),
          sql`${boardTasks.status} <> 'done'`,
          sql`jsonb_array_length(${boardTasks.assignees}) = 0`,
          eq(boardTasks.isPrivate, false),
        ),
      )
      .orderBy(asc(boardTasks.dueDate))
      .limit(100);
    return c.json({ tasks: rows.map(taskDto) });
  }
  const rows = await db.select().from(boardTasks).where(where).orderBy(asc(boardTasks.dueDate), asc(boardTasks.id)).limit(MAX_LIST + 1);
  if (rows.length > MAX_LIST) throw new TaskError(422, "too_many", "Prea multe task-uri vizibile; filtrează vederea.");
  return c.json({ tasks: rows.map(taskDto) });
});

tasksRoutes.get("/search", async (c) => {
  const ctx = ctxOf(c);
  const q = (c.req.query("q") ?? "").trim().replace(/[%_\\]/g, (ch) => `\\${ch}`).slice(0, 100);
  if (q.length < 2) return c.json({ tasks: [] });
  const boards = await visibleBoards(ctx);
  const rows = await db
    .select()
    .from(boardTasks)
    .where(and(visibleTasksWhere(ctx, taskBoardIds(boards, ctx)), ilike(boardTasks.title, `%${q}%`)))
    .orderBy(desc(boardTasks.updatedAt))
    .limit(20);
  return c.json({ tasks: rows.map(taskDto) });
});

// ─── Task-uri: creare și citire ───────────────────────────────────────────────

const dateLike = z.string().max(40).nullable().optional();
const taskFields = {
  board_id: uuid.nullable().optional(),
  list_id: uuid.nullable().optional(),
  parent_task_id: uuid.nullable().optional(),
  description: z.string().max(100_000).nullable().optional(),
  status: z.enum(["todo", "in_progress", "pending", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignees: z.array(uuid).max(50).optional(),
  start_date: dateLike,
  due_date: dateLike,
  estimated_minutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  task_set: z.string().max(120).nullable().optional(),
  is_private: z.boolean().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: z.string().max(300).nullable().optional(),
  source_module: z.string().max(40).optional(),
  position: z.number().finite().optional(),
  approver_ids: z.array(uuid).max(50).optional(),
};

tasksRoutes.post("/tasks", zValidator("json", z.object({ title: z.string().max(500), ...taskFields })), async (c) => {
  const task = await svc.createTask(ctxOf(c), c.req.valid("json"));
  return c.json({ task: taskDto(task) }, 201);
});

tasksRoutes.post(
  "/tasks/bulk",
  zValidator("json", z.object({ titles: z.array(z.string().max(500)).min(1).max(200), ...taskFields })),
  async (c) => {
    const { titles, ...base } = c.req.valid("json");
    const tasks = await svc.bulkCreateTasks(ctxOf(c), base, titles);
    return c.json({ tasks: tasks.map(taskDto) }, 201);
  },
);

tasksRoutes.get("/tasks/:id", async (c) => {
  const { task } = await svc.loadVisibleTask(ctxOf(c), idParam(c));
  return c.json({ task: taskDto(task) });
});

const taskPatchSchema = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(100_000).nullable().optional(),
  list_id: uuid.nullable().optional(),
  status: z.enum(["todo", "in_progress", "pending", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignees: z.array(uuid).max(50).optional(),
  start_date: dateLike,
  due_date: dateLike,
  estimated_minutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  actual_minutes: z.number().int().min(0).max(1_000_000).nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  task_set: z.string().max(120).nullable().optional(),
  position: z.number().finite().optional(),
  is_private: z.boolean().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: z.string().max(300).nullable().optional(),
  board_id: uuid.nullable().optional(),
  is_milestone: z.boolean().optional(),
  approver_ids: z.array(uuid).max(50).optional(),
  // Trimis de UI-ul portat odată cu statusul; îl calculează serverul, deci e ignorat.
  completed_at: z.string().nullable().optional(),
});

tasksRoutes.patch("/tasks/:id", zValidator("json", taskPatchSchema), async (c) => {
  const { completed_at: _ignored, ...patch } = c.req.valid("json");
  const task = await svc.updateTask(ctxOf(c), idParam(c), patch);
  return c.json({ task: taskDto(task) });
});

tasksRoutes.delete("/tasks/:id", async (c) => {
  await svc.deleteTask(ctxOf(c), idParam(c));
  return c.json({ ok: true });
});

tasksRoutes.post(
  "/tasks/:id/move",
  zValidator("json", z.object({ list_id: uuid.nullable(), position: z.number().finite() })),
  async (c) => {
    const { list_id, position } = c.req.valid("json");
    const task = await svc.moveTask(ctxOf(c), idParam(c), list_id, position);
    return c.json({ task: taskDto(task) });
  },
);

tasksRoutes.post("/tasks/:id/move-board", zValidator("json", z.object({ board_id: uuid.nullable() })), async (c) => {
  await svc.moveTaskToBoard(ctxOf(c), idParam(c), c.req.valid("json").board_id);
  return c.json({ ok: true });
});

tasksRoutes.post("/tasks/:id/restore", async (c) => c.json({ restored: await svc.restoreTask(ctxOf(c), idParam(c)) }));

tasksRoutes.post("/tasks/:id/approve", async (c) => {
  const task = await svc.approveTask(ctxOf(c), idParam(c));
  return c.json({ task: taskDto(task) });
});

tasksRoutes.post("/tasks/:id/reject", zValidator("json", z.object({ reason: z.string().max(20_000).default("") })), async (c) => {
  const task = await svc.rejectTask(ctxOf(c), idParam(c), c.req.valid("json").reason);
  return c.json({ task: taskDto(task) });
});

tasksRoutes.post("/tasks/:id/claim", async (c) => {
  const task = await svc.claimTask(ctxOf(c), idParam(c));
  return c.json({ task: taskDto(task) });
});

tasksRoutes.post("/tasks/:id/occurrences", zValidator("json", z.object({ date: z.string().max(10) })), async (c) => {
  const id = await svc.materializeOccurrence(ctxOf(c), idParam(c), c.req.valid("json").date);
  return c.json({ id });
});

tasksRoutes.get("/tasks/:id/subtasks", async (c) => {
  const ctx = ctxOf(c);
  const parentId = idParam(c);
  const { task } = await svc.loadVisibleTask(ctx, parentId);
  const boards = await visibleBoards(ctx);
  // Subtaskurile vizibile apelantului — același filtru ca listele, restrâns la părinte.
  const rows = await db
    .select()
    .from(boardTasks)
    .where(and(eq(boardTasks.parentTaskId, task.id), visibleTasksWhere(ctx, taskBoardIds(boards, ctx))))
    .orderBy(asc(boardTasks.position));
  return c.json({ tasks: rows.map(taskDto) });
});

tasksRoutes.get("/tasks/:id/activity", async (c) => {
  const ctx = ctxOf(c);
  const { task } = await svc.loadVisibleTask(ctx, idParam(c));
  const rows = await db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskId, task.id))
    .orderBy(desc(taskActivity.createdAt))
    .limit(100);
  return c.json({ activity: rows.map(activityDto) });
});

// ─── Comentarii și atașamente ─────────────────────────────────────────────────

tasksRoutes.get("/tasks/:id/comments", async (c) => {
  const rows = await svc.listComments(ctxOf(c), idParam(c));
  return c.json({ comments: rows.map(commentDto) });
});

const attachmentSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  type: z.string().max(150),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
});

tasksRoutes.post(
  "/tasks/:id/comments",
  zValidator("json", z.object({ content: z.string().max(20_000).default(""), attachments: z.array(attachmentSchema).max(10).default([]) })),
  async (c) => {
    const { content, attachments } = c.req.valid("json");
    const row = await svc.addComment(ctxOf(c), idParam(c), content, attachments);
    return c.json({ comment: commentDto(row) }, 201);
  },
);

tasksRoutes.delete("/comments/:id", async (c) => {
  await svc.deleteComment(ctxOf(c), idParam(c));
  return c.json({ ok: true });
});

tasksRoutes.post("/comment-counts", zValidator("json", z.object({ task_ids: z.array(uuid).max(5000) })), async (c) => {
  const ctx = ctxOf(c);
  const ids = c.req.valid("json").task_ids;
  if (ids.length === 0) return c.json({ counts: {} });
  const rows = await db
    .select({ taskId: taskComments.taskId, n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(and(eq(taskComments.tenantId, ctx.tenantId), inArray(taskComments.taskId, ids)))
    .groupBy(taskComments.taskId);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.taskId] = Number(row.n);
  return c.json({ counts });
});

/** Bucket propriu: fișierele task-urilor n-au ce căuta lângă dosarele de plată. */
export const TASK_ATTACHMENT_BUCKET = "task-attachments";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

/** Pasul 1: dreptul se verifică ÎNAINTE să dăm un URL de scriere. */
tasksRoutes.post(
  "/tasks/:id/attachments/sign",
  zValidator("json", z.object({ fileName: z.string().min(1).max(255), mime: z.string().max(150), sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES) })),
  async (c) => {
    const ctx = ctxOf(c);
    await svc.loadVisibleTask(ctx, idParam(c));
    const body = c.req.valid("json");
    if (!ALLOWED_ATTACHMENT_TYPES.has(body.mime)) throw new TaskError(400, "invalid_data", "Tipul fișierului nu este permis");
    try {
      const [signed] = await signUploads(TASK_ATTACHMENT_BUCKET, ctx.tenantId, [{ fileName: body.fileName }]);
      return c.json({ path: signed.path, signedUrl: signed.signedUrl });
    } catch {
      return c.json({ error: "storage_unavailable", detail: "Nu pot pregăti încărcarea. Încearcă din nou." }, 503);
    }
  },
);

/** Pasul 3: octeții reali trebuie să fie ce spune tipul declarat — altfel obiectul se șterge. */
tasksRoutes.post(
  "/tasks/:id/attachments/finalize",
  zValidator("json", z.object({ path: z.string().min(1).max(500), fileName: z.string().min(1).max(255), mime: z.string().max(150) })),
  async (c) => {
    const ctx = ctxOf(c);
    await svc.loadVisibleTask(ctx, idParam(c));
    const body = c.req.valid("json");
    if (!isSafeTenantObjectPath(body.path, ctx.tenantId)) throw new TaskError(400, "invalid_data", "Cale invalidă");
    if (!ALLOWED_ATTACHMENT_TYPES.has(body.mime)) throw new TaskError(400, "invalid_data", "Tipul fișierului nu este permis");
    let bytes: Buffer;
    try {
      bytes = await downloadObject(TASK_ATTACHMENT_BUCKET, body.path);
    } catch {
      throw new TaskError(400, "invalid_data", "Fișierul nu a ajuns în întregime. Încearcă din nou.");
    }
    const textual = body.mime.startsWith("text/");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES || (!textual && !magicBytesMatchBuffer(bytes, body.mime))) {
      await removeObjects(TASK_ATTACHMENT_BUCKET, [body.path]);
      throw new TaskError(400, "invalid_data", "Conținutul fișierului nu corespunde tipului declarat.");
    }
    return c.json({ attachment: { path: body.path, name: body.fileName, type: body.mime, size: bytes.byteLength } });
  },
);

/** Deschiderea: doar un fișier atașat unui comentariu al unui task pe care apelantul îl vede. */
tasksRoutes.get("/tasks/:id/attachments/file", async (c) => {
  const ctx = ctxOf(c);
  const { task } = await svc.loadVisibleTask(ctx, idParam(c));
  const path = c.req.query("path") ?? "";
  if (!isSafeTenantObjectPath(path, ctx.tenantId)) throw new TaskError(404, "not_found");
  const comments = await db
    .select({ attachments: taskComments.attachments })
    .from(taskComments)
    .where(eq(taskComments.taskId, task.id));
  const attachment = comments.flatMap((r) => r.attachments ?? []).find((a) => a.path === path);
  if (!attachment) throw new TaskError(404, "not_found");
  let bytes: Buffer;
  try {
    bytes = await downloadObject(TASK_ATTACHMENT_BUCKET, path);
  } catch {
    return c.json({ error: "preview_unavailable" }, 422);
  }
  c.header("Content-Type", attachment.type || "application/octet-stream");
  c.header("Content-Disposition", contentDisposition("inline", attachment.name, "fisier"));
  c.header("Cache-Control", "private, max-age=3600");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
});

// ─── Recurență, dependențe, aprobări ──────────────────────────────────────────

tasksRoutes.post("/occurrences", zValidator("json", z.object({ series_ids: z.array(uuid).max(2000) })), async (c) => {
  const ctx = ctxOf(c);
  const ids = c.req.valid("json").series_ids;
  if (ids.length === 0) return c.json({ occurrences: [] });
  const rows = await db
    .select({ parent: boardTasks.recurrenceParentId, day: boardTasks.occurrenceDate })
    .from(boardTasks)
    .where(and(eq(boardTasks.tenantId, ctx.tenantId), inArray(boardTasks.recurrenceParentId, ids), isNull(boardTasks.deletedAt)));
  return c.json({
    occurrences: rows
      .filter((r) => r.parent && r.day)
      .map((r) => ({ recurrence_parent_id: r.parent as string, occurrence_date: r.day as string })),
  });
});

tasksRoutes.post(
  "/dependencies/query",
  zValidator("json", z.object({ task_ids: z.array(uuid).max(2000), direction: z.enum(["blocked_by", "blocking"]) })),
  async (c) => {
    const { task_ids, direction } = c.req.valid("json");
    const rows = await svc.queryDependencies(ctxOf(c), task_ids, direction);
    return c.json({ dependencies: rows.map(dependencyDto) });
  },
);

tasksRoutes.post("/dependencies", zValidator("json", z.object({ task_id: uuid, depends_on_task_id: uuid })), async (c) => {
  const { task_id, depends_on_task_id } = c.req.valid("json");
  await svc.addDependency(ctxOf(c), task_id, depends_on_task_id);
  return c.json({ ok: true }, 201);
});

tasksRoutes.delete("/dependencies/:id", async (c) => {
  await svc.removeDependency(ctxOf(c), idParam(c));
  return c.json({ ok: true });
});

tasksRoutes.get("/approvals/count", async (c) => c.json({ count: await svc.countPendingApprovals(ctxOf(c)) }));

// ─── Oameni ───────────────────────────────────────────────────────────────────

tasksRoutes.get("/people", async (c) => c.json({ people: await listPeople(ctxOf(c).tenantId) }));

tasksRoutes.get("/assignable", async (c) => {
  const ctx = ctxOf(c);
  const boardId = c.req.query("boardId") ?? null;
  if (boardId) {
    if (!UUID_RE.test(boardId)) throw new TaskError(404, "not_found");
    // Un board străin nu e o ușă prin care să enumeri colegii: trebuie să-l vezi.
    const loaded = await loadBoardWithRole(ctx, boardId);
    if (!loaded || !loaded.role) throw new TaskError(404, "not_found");
  }
  return c.json({ people: await listAssignable(ctx, boardId) });
});

// ─── Vederi salvate ───────────────────────────────────────────────────────────

tasksRoutes.get("/view-prefs/:key", async (c) => {
  const ctx = ctxOf(c);
  const key = c.req.param("key").slice(0, 100);
  const [row] = await db
    .select({ config: taskViewPrefs.config })
    .from(taskViewPrefs)
    .where(and(eq(taskViewPrefs.userId, ctx.userId), eq(taskViewPrefs.viewKey, key)))
    .limit(1);
  return c.json({ config: row?.config ?? null });
});

tasksRoutes.put("/view-prefs/:key", zValidator("json", z.object({ config: z.unknown() })), async (c) => {
  const ctx = ctxOf(c);
  const key = c.req.param("key").slice(0, 100);
  const config = c.req.valid("json").config ?? null;
  if (JSON.stringify(config ?? null).length > 50_000) throw new TaskError(400, "invalid_data", "Preferință prea mare");
  await db
    .insert(taskViewPrefs)
    .values({ tenantId: ctx.tenantId, userId: ctx.userId, viewKey: key, config })
    .onConflictDoUpdate({ target: [taskViewPrefs.userId, taskViewPrefs.viewKey], set: { config, updatedAt: new Date() } });
  return c.json({ ok: true });
});

// ─── Reguli de vizibilitate (administratorul) ─────────────────────────────────

function requireAdmin(ctx: TaskContext): void {
  if (!ctx.isAdmin) throw new TaskError(403, "forbidden", "Doar administratorul organizației");
}

tasksRoutes.get("/visibility-rules", async (c) => {
  const ctx = ctxOf(c);
  requireAdmin(ctx);
  const rows = await db
    .select()
    .from(taskVisibilityRules)
    .where(eq(taskVisibilityRules.tenantId, ctx.tenantId))
    .orderBy(asc(taskVisibilityRules.subjectType));
  return c.json({ rules: rows.map(ruleDto) });
});

tasksRoutes.put(
  "/visibility-rules",
  zValidator(
    "json",
    z.object({
      subject_type: z.enum(["user", "managers", "all_employees"]),
      subject_user_id: uuid.nullable().optional(),
      scope: z.enum(["own", "team", "company"]),
    }),
  ),
  async (c) => {
    const ctx = ctxOf(c);
    requireAdmin(ctx);
    const body = c.req.valid("json");
    const subjectUserId = body.subject_type === "user" ? body.subject_user_id ?? null : null;
    if (body.subject_type === "user") {
      if (!subjectUserId) throw new TaskError(400, "invalid_data", "Alege întâi persoana");
      const active = await activeStaffIds(ctx.tenantId, [subjectUserId]);
      if (!active.has(subjectUserId)) throw new TaskError(400, "invalid_data", "Persoana nu face parte din organizație");
    }
    // O regulă per subiect: înlocuim rândul echivalent în loc să adăugăm unul nou.
    await db.transaction(async (tx) => {
      await tx
        .delete(taskVisibilityRules)
        .where(
          and(
            eq(taskVisibilityRules.tenantId, ctx.tenantId),
            eq(taskVisibilityRules.subjectType, body.subject_type),
            subjectUserId ? eq(taskVisibilityRules.subjectUserId, subjectUserId) : isNull(taskVisibilityRules.subjectUserId),
          ),
        );
      await tx.insert(taskVisibilityRules).values({
        tenantId: ctx.tenantId,
        subjectType: body.subject_type,
        subjectUserId,
        scope: body.scope,
        createdBy: ctx.userId,
      });
    });
    return c.json({ ok: true });
  },
);

tasksRoutes.delete("/visibility-rules/:id", async (c) => {
  const ctx = ctxOf(c);
  requireAdmin(ctx);
  await db
    .delete(taskVisibilityRules)
    .where(and(eq(taskVisibilityRules.id, idParam(c)), eq(taskVisibilityRules.tenantId, ctx.tenantId)));
  return c.json({ ok: true });
});

// ─── Echipe (aceleași ca în PAR; administrarea: administratorul workspace-ului) ─

tasksRoutes.get("/teams/selectable", async (c) => {
  const teams = await selectableTeams(ctxOf(c).tenantId);
  return c.json({ teams: teams.map((t) => ({ team_id: t.teamId, name: t.name, member_count: t.memberCount })) });
});

function teamDto(team: { id: string; name: string; active: boolean; createdAt: Date; members: { userId: string; name: string | null; email: string | null }[] }) {
  return {
    id: team.id,
    name: team.name,
    active: team.active,
    created_at: team.createdAt.toISOString(),
    members: team.members.map((m) => ({ user_id: m.userId, name: m.name, email: m.email })),
  };
}

tasksRoutes.get("/teams", async (c) => {
  const teams = await listWorkspaceTeams(ctxOf(c).tenantId);
  return c.json({ teams: teams.map(teamDto) });
});

async function audit(c: Context<{ Variables: Vars }>, actionType: string, teamId: string, values: { newValue?: unknown; oldValue?: unknown }) {
  const ctx = ctxOf(c);
  await writeAuditLog({ tenantId: ctx.tenantId, actorId: ctx.userId, actionType, targetType: "par_team", targetId: teamId, ...values, ipAddress: clientIp(c) });
}

tasksRoutes.post(
  "/teams",
  zValidator("json", z.object({ name: z.string().trim().min(2).max(200), user_ids: z.array(uuid).max(100).optional() })),
  async (c) => {
    const ctx = ctxOf(c);
    requireAdmin(ctx);
    const { name, user_ids } = c.req.valid("json");
    const [existing] = await db
      .select({ id: parTeams.id })
      .from(parTeams)
      .where(and(eq(parTeams.tenantId, ctx.tenantId), eq(parTeams.name, name)))
      .limit(1);
    if (existing) return c.json({ error: "duplicate_name", detail: "Există deja o echipă cu numele ăsta." }, 409);
    const [team] = await db.insert(parTeams).values({ tenantId: ctx.tenantId, name }).returning();
    const memberIds = await addTeamMembers(ctx.tenantId, team.id, user_ids ?? []);
    await audit(c, "team_created", team.id, { newValue: { name: team.name, members: memberIds, from: "tasks" } });
    const [withMembers] = await teamsWithMembers(ctx.tenantId, [team]);
    return c.json({ team: teamDto(withMembers) }, 201);
  },
);

tasksRoutes.patch(
  "/teams/:id",
  zValidator("json", z.object({ name: z.string().trim().min(2).max(200).optional(), active: z.boolean().optional() })),
  async (c) => {
    const ctx = ctxOf(c);
    requireAdmin(ctx);
    const id = idParam(c);
    const patch = c.req.valid("json");
    if (patch.name === undefined && patch.active === undefined) throw new TaskError(400, "invalid_data", "Nimic de schimbat");
    if (patch.name !== undefined) {
      const [clash] = await db
        .select({ id: parTeams.id })
        .from(parTeams)
        .where(and(eq(parTeams.tenantId, ctx.tenantId), eq(parTeams.name, patch.name)))
        .limit(1);
      if (clash && clash.id !== id) return c.json({ error: "duplicate_name", detail: "Există deja o echipă cu numele ăsta." }, 409);
    }
    const [updated] = await db
      .update(parTeams)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, ctx.tenantId)))
      .returning();
    if (!updated) throw new TaskError(404, "not_found");
    await audit(c, "team_updated", id, { newValue: { name: updated.name, active: updated.active, from: "tasks" } });
    return c.json({ ok: true });
  },
);

tasksRoutes.delete("/teams/:id", async (c) => {
  const ctx = ctxOf(c);
  requireAdmin(ctx);
  const id = idParam(c);
  const [deleted] = await db
    .delete(parTeams)
    .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, ctx.tenantId)))
    .returning({ id: parTeams.id, name: parTeams.name });
  if (!deleted) throw new TaskError(404, "not_found");
  await audit(c, "team_deleted", id, { oldValue: { name: deleted.name, from: "tasks" } });
  return c.json({ ok: true });
});

tasksRoutes.post("/teams/:id/members", zValidator("json", z.object({ user_id: uuid })), async (c) => {
  const ctx = ctxOf(c);
  requireAdmin(ctx);
  const id = idParam(c);
  const { user_id } = c.req.valid("json");
  const [team] = await db
    .select({ id: parTeams.id })
    .from(parTeams)
    .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, ctx.tenantId)))
    .limit(1);
  if (!team) throw new TaskError(404, "not_found");
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, user_id), eq(users.tenantId, ctx.tenantId)))
    .limit(1);
  if (!target) throw new TaskError(400, "invalid_data", "Utilizatorul nu face parte din organizație.");
  const added = await addTeamMembers(ctx.tenantId, id, [user_id]);
  if (added.length > 0) await audit(c, "team_member_added", id, { newValue: { userId: user_id, from: "tasks" } });
  return c.json({ ok: true, added: added.length > 0 });
});

tasksRoutes.delete("/teams/:id/members/:userId", async (c) => {
  const ctx = ctxOf(c);
  requireAdmin(ctx);
  const id = idParam(c);
  const userId = idParam(c, "userId");
  const [removed] = await db
    .delete(parTeamMembers)
    .where(and(eq(parTeamMembers.tenantId, ctx.tenantId), eq(parTeamMembers.teamId, id), eq(parTeamMembers.userId, userId)))
    .returning({ id: parTeamMembers.id });
  if (!removed) throw new TaskError(404, "not_found");
  await audit(c, "team_member_removed", id, { oldValue: { userId, from: "tasks" } });
  return c.json({ ok: true });
});
