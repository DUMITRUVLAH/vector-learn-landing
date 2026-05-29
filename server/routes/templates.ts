/**
 * CRM-108: Message templates CRUD
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { messageTemplates, extractVariables } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const templateRoutes = new Hono<{ Variables: AuthVariables }>();

templateRoutes.use("/*", requireAuth);

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(["email", "whatsapp", "sms"]),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(["email", "whatsapp", "sms"]).optional(),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).optional(),
});

// GET /api/templates — list all templates for tenant
templateRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.tenantId, tenantId))
    .orderBy(asc(messageTemplates.channel), asc(messageTemplates.name));

  // Parse variables JSON
  return c.json({
    items: items.map((t) => ({
      ...t,
      variables: JSON.parse(t.variables ?? "[]") as string[],
    })),
  });
});

// GET /api/templates/:id — get single template
templateRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const template = await db.query.messageTemplates.findFirst({
    where: and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId)),
  });
  if (!template) return c.json({ error: "not_found" }, 404);

  return c.json({ ...template, variables: JSON.parse(template.variables ?? "[]") as string[] });
});

// POST /api/templates — create template
templateRoutes.post("/", zValidator("json", createTemplateSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const detectedVars = extractVariables(body.body);

  const [created] = await db
    .insert(messageTemplates)
    .values({
      tenantId,
      name: body.name,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
      variables: JSON.stringify(detectedVars),
    })
    .returning();

  return c.json({ ...created, variables: detectedVars }, 201);
});

// PATCH /api/templates/:id — update template
templateRoutes.patch("/:id", zValidator("json", updateTemplateSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.channel !== undefined) patch.channel = body.channel;
  if (body.subject !== undefined) patch.subject = body.subject;
  if (body.body !== undefined) {
    patch.body = body.body;
    patch.variables = JSON.stringify(extractVariables(body.body));
  }

  const [updated] = await db
    .update(messageTemplates)
    .set(patch)
    .where(and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);

  return c.json({ ...updated, variables: JSON.parse(updated.variables ?? "[]") as string[] });
});

// DELETE /api/templates/:id
templateRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  await db
    .delete(messageTemplates)
    .where(and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId)));

  return c.json({ deleted: true });
});

// POST /api/templates/:id/preview — render template with sample data
templateRoutes.post("/:id/preview", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const template = await db.query.messageTemplates.findFirst({
    where: and(eq(messageTemplates.id, id), eq(messageTemplates.tenantId, tenantId)),
  });
  if (!template) return c.json({ error: "not_found" }, 404);

  // Import render function at runtime to avoid circular deps
  const { renderTemplate, KNOWN_VARIABLES } = await import("../db/schema/templates");

  const renderedBody = renderTemplate(template.body);
  const renderedSubject = template.subject ? renderTemplate(template.subject) : null;

  const detectedVars = JSON.parse(template.variables ?? "[]") as string[];
  const unknownVars = detectedVars.filter((v) => !KNOWN_VARIABLES[v]);

  return c.json({
    body: renderedBody,
    subject: renderedSubject,
    warnings: unknownVars.map((v) => `Variabilă necunoscută: {{${v}}}`),
  });
});
