/**
 * TB-001: TaskBoard — Taskuri (sursa unică pentru Tabel/Kanban/Calendar)
 *   GET  /api/board/tasks?boardId&productId&status&assignee&hasDueDate
 *   GET  /api/board/tasks/:id        (task + labels + checklist + comments + attachments)
 *   POST /api/board/tasks            (task individual)
 *   POST /api/board/tasks/bulk       (N taskuri plan-first dintr-o listă de titluri)
 *   PATCH /api/board/tasks/:id       (editare inline per câmp)
 *   POST /api/board/tasks/:id/move   ({listId, position} — deține sync listă↔status + rebalans)
 *   DELETE /api/board/tasks/:id      (arhivare soft, stil Trello)
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, isNull, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import {
  tasks,
  boards,
  boardLists,
  taskLabels,
  boardLabels,
  taskChecklistItems,
  taskComments,
  taskAttachments,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardTasksRoutes = new Hono<{ Variables: AuthVariables }>();
boardTasksRoutes.use("*", requireAuth);
// Guard-ul UUID se aplică per rută (nu .use("/:id")): literalul `/bulk` e un singur
// segment și ar fi 404-uit de un guard montat pe pattern-ul "/:id".

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const taskCreateSchema = z.object({
  boardId: z.string().uuid(),
  listId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  assigneeRole: z.string().max(48).nullable().optional(),
  startDate: z.string().regex(DATE_RE).nullable().optional(),
  dueDate: z.string().regex(DATE_RE).nullable().optional(),
  position: z.number().optional(),
});

const taskPatchSchema = taskCreateSchema.omit({ boardId: true }).partial();

const bulkSchema = z.object({
  boardId: z.string().uuid(),
  titles: z.array(z.string().min(1).max(300)).min(1).max(200),
  listId: z.string().uuid().nullable().optional(),
});

const moveSchema = z.object({
  listId: z.string().uuid().nullable(),
  position: z.number(),
});

/** Gap sub care pozițiile fracționate se consideră epuizate → renumerotare. */
const MIN_GAP = 0.0001;

async function assertBoardInTenant(tenantId: string, boardId: string) {
  const [board] = await db
    .select({ id: boards.id, productId: boards.productId })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.tenantId, tenantId)));
  return board ?? null;
}

boardTasksRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { boardId, productId, status, assignee, hasDueDate } = c.req.query();
  const conditions = [eq(tasks.tenantId, tenantId), isNull(tasks.archivedAt)];
  if (boardId) conditions.push(eq(tasks.boardId, boardId));
  if (productId) conditions.push(eq(tasks.productId, productId));
  if (status) conditions.push(eq(tasks.status, status));
  if (assignee) conditions.push(eq(tasks.assigneeUserId, assignee));
  if (hasDueDate === "true") conditions.push(isNotNull(tasks.dueDate));
  if (hasDueDate === "false") conditions.push(isNull(tasks.dueDate));
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return c.json({ tasks: rows });
});

boardTasksRoutes.get("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
  if (!task) return c.json({ error: "not_found" }, 404);
  const labels = await db
    .select({
      id: boardLabels.id,
      name: boardLabels.name,
      colorToken: boardLabels.colorToken,
    })
    .from(taskLabels)
    .innerJoin(boardLabels, eq(taskLabels.labelId, boardLabels.id))
    .where(eq(taskLabels.taskId, id));
  const checklist = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id))
    .orderBy(asc(taskChecklistItems.position));
  const comments = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, id))
    .orderBy(asc(taskComments.createdAt));
  const attachments = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, id))
    .orderBy(asc(taskAttachments.createdAt));
  return c.json({ task, labels, checklist, comments, attachments });
});

boardTasksRoutes.post("/", zValidator("json", taskCreateSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const board = await assertBoardInTenant(tenantId, body.boardId);
  if (!board) return c.json({ error: "board_not_found" }, 404);

  let position = body.position;
  if (position === undefined) {
    const siblings = await db
      .select({ position: tasks.position })
      .from(tasks)
      .where(
        and(
          eq(tasks.boardId, body.boardId),
          body.listId ? eq(tasks.listId, body.listId) : isNull(tasks.listId)
        )
      );
    position = siblings.reduce((m, r) => Math.max(m, r.position), 0) + 1024;
  }
  const [row] = await db
    .insert(tasks)
    .values({
      tenantId,
      boardId: body.boardId,
      listId: body.listId ?? null,
      productId: board.productId, // denormalizat pt. rollup per produs
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "todo",
      priority: body.priority ?? "normal",
      assigneeUserId: body.assigneeUserId ?? null,
      assigneeRole: body.assigneeRole ?? null,
      startDate: body.startDate ?? null,
      dueDate: body.dueDate ?? null,
      position,
    })
    .returning();
  return c.json(row, 201);
});

/** POST /bulk — planul-first: N taskuri doar cu titlu, restul null (se programează ulterior). */
boardTasksRoutes.post("/bulk", zValidator("json", bulkSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const board = await assertBoardInTenant(tenantId, body.boardId);
  if (!board) return c.json({ error: "board_not_found" }, 404);

  const siblings = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(
      and(
        eq(tasks.boardId, body.boardId),
        body.listId ? eq(tasks.listId, body.listId) : isNull(tasks.listId)
      )
    );
  const base = siblings.reduce((m, r) => Math.max(m, r.position), 0);
  const rows = await db
    .insert(tasks)
    .values(
      body.titles.map((title, i) => ({
        tenantId,
        boardId: body.boardId,
        listId: body.listId ?? null,
        productId: board.productId,
        title,
        position: base + (i + 1) * 1024,
      }))
    )
    .returning();
  return c.json({ created: rows.length, tasks: rows }, 201);
});

boardTasksRoutes.patch(
  "/:id",
  parUuidGuard("id"),
  zValidator("json", taskPatchSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    // Setarea status="done" direct din Tabel completează completedAt (și invers o curăță),
    // ca overview-ul să nu depindă de mutarea în coloana Gata.
    const patch: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.status === "done") patch.completedAt = new Date();
    else if (body.status !== undefined) patch.completedAt = null;
    const [row] = await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

/**
 * POST /:id/move — mutarea Kanban. Deține:
 *  - sync listă↔status (isDoneList → done + completedAt; ieșire din done → in_progress)
 *  - garda de rebalansare a pozițiilor fracționate (gap < MIN_GAP → renumerotare listă)
 */
boardTasksRoutes.post(
  "/:id/move",
  parUuidGuard("id"),
  zValidator("json", moveSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const { listId, position } = c.req.valid("json");

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    if (!task) return c.json({ error: "not_found" }, 404);

    let targetList: typeof boardLists.$inferSelect | null = null;
    if (listId !== null) {
      const [list] = await db
        .select()
        .from(boardLists)
        .where(and(eq(boardLists.id, listId), eq(boardLists.tenantId, tenantId)));
      if (!list || list.boardId !== task.boardId) {
        return c.json({ error: "list_not_found" }, 404);
      }
      targetList = list;
    }

    const patch: Record<string, unknown> = { listId, position, updatedAt: new Date() };
    const wasDone = task.status === "done";
    if (targetList?.isDoneList && !wasDone) {
      patch.status = "done";
      patch.completedAt = new Date();
    } else if (wasDone && targetList && !targetList.isDoneList) {
      patch.status = "in_progress";
      patch.completedAt = null;
    }

    const [row] = await db
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();

    // Gardă de rebalansare: dacă pozițiile din lista țintă s-au apropiat sub MIN_GAP,
    // renumerotează 1024, 2048, … (păstrând ordinea curentă).
    const siblings = await db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.boardId, task.boardId),
          listId ? eq(tasks.listId, listId) : isNull(tasks.listId),
          isNull(tasks.archivedAt)
        )
      )
      .orderBy(asc(tasks.position));
    const needsRebalance = siblings.some(
      (s, i) => i > 0 && s.position - siblings[i - 1].position < MIN_GAP
    );
    if (needsRebalance) {
      for (let i = 0; i < siblings.length; i++) {
        await db
          .update(tasks)
          .set({ position: (i + 1) * 1024 })
          .where(eq(tasks.id, siblings[i].id));
      }
    }

    return c.json({ task: row, rebalanced: needsRebalance });
  }
);

boardTasksRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(tasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
