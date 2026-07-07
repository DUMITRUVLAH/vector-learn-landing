/**
 * TB-005: TaskBoard — Atașamente per task (doar metadata în MVP: filename + URL).
 *   GET    /api/board/attachments?taskId
 *   POST   /api/board/attachments            { taskId, filename, url, sizeBytes? }
 *   DELETE /api/board/attachments/:id
 *
 * Upload-ul real de fișiere refolosește infra existentă (apiUpload/parAttachments)
 * într-o fază ulterioară — aici doar legăm linkuri (Drive, site, etc.).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { taskAttachments, tasks } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardAttachmentsRoutes = new Hono<{ Variables: AuthVariables }>();
boardAttachmentsRoutes.use("*", requireAuth);

const createSchema = z.object({
  taskId: z.string().uuid(),
  filename: z.string().min(1).max(300),
  url: z.string().min(1).max(1000).url(),
  sizeBytes: z.number().int().positive().optional(),
});

boardAttachmentsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const taskId = c.req.query("taskId");
  if (!taskId) return c.json({ error: "taskId_required" }, 400);
  const rows = await db
    .select()
    .from(taskAttachments)
    .where(and(eq(taskAttachments.tenantId, tenantId), eq(taskAttachments.taskId, taskId)))
    .orderBy(asc(taskAttachments.createdAt));
  return c.json({ attachments: rows });
});

boardAttachmentsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, body.taskId), eq(tasks.tenantId, user.tenantId)));
  if (!task) return c.json({ error: "task_not_found" }, 404);
  const [row] = await db
    .insert(taskAttachments)
    .values({
      tenantId: user.tenantId,
      taskId: body.taskId,
      filename: body.filename,
      url: body.url,
      sizeBytes: body.sizeBytes ?? null,
      uploadedByUserId: user.id,
    })
    .returning();
  return c.json(row, 201);
});

boardAttachmentsRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .delete(taskAttachments)
    .where(and(eq(taskAttachments.id, id), eq(taskAttachments.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
