/**
 * CRM-107: Lead tasks + attachments routes
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leadTasks, leadAttachments, leadInteractions } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const taskRoutes = new Hono<{ Variables: AuthVariables }>();

taskRoutes.use("/*", requireAuth);

// ─── Tasks ────────────────────────────────────────────────────────────────────

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  dueAt: z.string().datetime().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  status: z.enum(["open", "done", "snoozed"]).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

// GET /api/leads/:leadId/tasks
taskRoutes.get("/:leadId/tasks", async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;

  const items = await db
    .select()
    .from(leadTasks)
    .where(and(eq(leadTasks.leadId, leadId), eq(leadTasks.tenantId, tenantId)))
    .orderBy(asc(leadTasks.dueAt), asc(leadTasks.createdAt));

  return c.json({ items });
});

// POST /api/leads/:leadId/tasks
taskRoutes.post("/:leadId/tasks", zValidator("json", createTaskSchema), async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  const [created] = await db
    .insert(leadTasks)
    .values({
      tenantId,
      leadId,
      title: body.title,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      assignedTo: body.assignedTo ?? null,
      createdBy: userId,
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/leads/:leadId/tasks/:taskId — update/complete a task
taskRoutes.patch("/:leadId/tasks/:taskId", zValidator("json", updateTaskSchema), async (c) => {
  const { leadId, taskId } = c.req.param();
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  const task = await db.query.leadTasks.findFirst({
    where: and(eq(leadTasks.id, taskId), eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId)),
  });
  if (!task) return c.json({ error: "not_found" }, 404);

  const patch: Record<string, unknown> = { updatedAt: new Date(), ...body };
  if (body.dueAt !== undefined) patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;

  // If marking done, set completedAt
  if (body.status === "done" && task.status !== "done") {
    patch.completedAt = new Date();
  }

  const [updated] = await db
    .update(leadTasks)
    .set(patch)
    .where(and(eq(leadTasks.id, taskId), eq(leadTasks.tenantId, tenantId)))
    .returning();

  // Write interaction if completing task
  if (body.status === "done" && task.status !== "done") {
    await db.insert(leadInteractions).values({
      tenantId,
      leadId,
      type: "system",
      direction: "internal",
      body: `Task finalizat: "${task.title}"`,
      userId,
    });
  }

  return c.json(updated);
});

// DELETE /api/leads/:leadId/tasks/:taskId
taskRoutes.delete("/:leadId/tasks/:taskId", async (c) => {
  const { leadId, taskId } = c.req.param();
  const tenantId = c.get("user").tenantId;

  await db
    .delete(leadTasks)
    .where(and(eq(leadTasks.id, taskId), eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId)));

  return c.json({ deleted: true });
});

// ─── Attachments ──────────────────────────────────────────────────────────────

const createAttachmentSchema = z.object({
  fileName: z.string().min(1).max(300),
  // base64 data URL of the file content. A real file's data URL is far larger than
  // the old 1000-char cap (which rejected EVERY non-trivial upload with a 400), so
  // the limit must accommodate the client-side size gate (10 MB ≈ ~13.4M base64 chars).
  fileUrl: z.string().min(1).max(15_000_000),
  mime: z.string().max(100),
  sizeBytes: z.number().int().min(0).default(0),
});

// GET /api/leads/:leadId/attachments
taskRoutes.get("/:leadId/attachments", async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;

  const items = await db
    .select()
    .from(leadAttachments)
    .where(and(eq(leadAttachments.leadId, leadId), eq(leadAttachments.tenantId, tenantId)))
    .orderBy(asc(leadAttachments.createdAt));

  return c.json({ items });
});

// POST /api/leads/:leadId/attachments
taskRoutes.post("/:leadId/attachments", zValidator("json", createAttachmentSchema), async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  const [created] = await db
    .insert(leadAttachments)
    .values({
      tenantId,
      leadId,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      mime: body.mime,
      sizeBytes: body.sizeBytes,
      uploadedBy: userId,
    })
    .returning();

  return c.json(created, 201);
});

// DELETE /api/leads/:leadId/attachments/:attachmentId
taskRoutes.delete("/:leadId/attachments/:attachmentId", async (c) => {
  const { leadId, attachmentId } = c.req.param();
  const tenantId = c.get("user").tenantId;

  await db
    .delete(leadAttachments)
    .where(and(
      eq(leadAttachments.id, attachmentId),
      eq(leadAttachments.tenantId, tenantId),
      eq(leadAttachments.leadId, leadId)
    ));

  return c.json({ deleted: true });
});

// GET next open task for a lead (used for kanban badge)
// GET /api/leads/:leadId/tasks/next
taskRoutes.get("/:leadId/tasks/next", async (c) => {
  const leadId = c.req.param("leadId");
  const tenantId = c.get("user").tenantId;

  const task = await db.query.leadTasks.findFirst({
    where: and(
      eq(leadTasks.leadId, leadId),
      eq(leadTasks.tenantId, tenantId),
      eq(leadTasks.status, "open")
    ),
    orderBy: asc(leadTasks.dueAt),
  });

  return c.json({ task: task ?? null });
});
