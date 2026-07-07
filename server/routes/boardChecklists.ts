/**
 * TB-005: TaskBoard — Checklist per task.
 *   GET    /api/board/checklists?taskId
 *   POST   /api/board/checklists            { taskId, text }
 *   PATCH  /api/board/checklists/:id        { text?, done?, position? }
 *   DELETE /api/board/checklists/:id
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { taskChecklistItems, tasks } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardChecklistsRoutes = new Hono<{ Variables: AuthVariables }>();
boardChecklistsRoutes.use("*", requireAuth);

const createSchema = z.object({
  taskId: z.string().uuid(),
  text: z.string().min(1).max(500),
});
const patchSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  position: z.number().optional(),
});

async function taskInTenant(tenantId: string, taskId: string) {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));
  return task ?? null;
}

boardChecklistsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const taskId = c.req.query("taskId");
  if (!taskId) return c.json({ error: "taskId_required" }, 400);
  const rows = await db
    .select()
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.tenantId, tenantId), eq(taskChecklistItems.taskId, taskId)))
    .orderBy(asc(taskChecklistItems.position));
  return c.json({ items: rows });
});

boardChecklistsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  if (!(await taskInTenant(tenantId, body.taskId))) return c.json({ error: "task_not_found" }, 404);
  const existing = await db
    .select({ position: taskChecklistItems.position })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, body.taskId));
  const position = existing.reduce((m, r) => Math.max(m, r.position), 0) + 1024;
  const [row] = await db
    .insert(taskChecklistItems)
    .values({ tenantId, taskId: body.taskId, text: body.text, position })
    .returning();
  return c.json(row, 201);
});

boardChecklistsRoutes.patch("/:id", parUuidGuard("id"), zValidator("json", patchSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [row] = await db
    .update(taskChecklistItems)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(taskChecklistItems.id, id), eq(taskChecklistItems.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

boardChecklistsRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .delete(taskChecklistItems)
    .where(and(eq(taskChecklistItems.id, id), eq(taskChecklistItems.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
