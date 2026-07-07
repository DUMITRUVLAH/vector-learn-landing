/**
 * TB-005: TaskBoard — Comentarii per task (autorul = userul din sesiune).
 *   GET    /api/board/comments?taskId
 *   POST   /api/board/comments              { taskId, body }
 *   PATCH  /api/board/comments/:id          { body } — doar autorul își editează comentariul
 *   DELETE /api/board/comments/:id          — doar autorul (etapa permisivă: fără rol de moderator încă)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { taskComments, tasks } from "../db/schema/taskboard";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardCommentsRoutes = new Hono<{ Variables: AuthVariables }>();
boardCommentsRoutes.use("*", requireAuth);

const createSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

boardCommentsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const taskId = c.req.query("taskId");
  if (!taskId) return c.json({ error: "taskId_required" }, 400);
  const rows = await db
    .select({
      id: taskComments.id,
      taskId: taskComments.taskId,
      userId: taskComments.userId,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      authorName: users.name,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.userId, users.id))
    .where(and(eq(taskComments.tenantId, tenantId), eq(taskComments.taskId, taskId)))
    .orderBy(asc(taskComments.createdAt));
  return c.json({ comments: rows });
});

boardCommentsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, body.taskId), eq(tasks.tenantId, user.tenantId)));
  if (!task) return c.json({ error: "task_not_found" }, 404);
  const [row] = await db
    .insert(taskComments)
    .values({ tenantId: user.tenantId, taskId: body.taskId, userId: user.id, body: body.body })
    .returning();
  return c.json({ ...row, authorName: user.name }, 201);
});

boardCommentsRoutes.patch(
  "/:id",
  parUuidGuard("id"),
  zValidator("json", z.object({ body: z.string().min(1).max(5000) })),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const [row] = await db
      .update(taskComments)
      .set({ body: c.req.valid("json").body, updatedAt: new Date() })
      .where(
        and(
          eq(taskComments.id, id),
          eq(taskComments.tenantId, user.tenantId),
          eq(taskComments.userId, user.id) // doar autorul
        )
      )
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardCommentsRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [row] = await db
    .delete(taskComments)
    .where(
      and(
        eq(taskComments.id, id),
        eq(taskComments.tenantId, user.tenantId),
        eq(taskComments.userId, user.id) // doar autorul
      )
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
