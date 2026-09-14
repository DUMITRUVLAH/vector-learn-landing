/**
 * CRM — administrarea formularelor de captare (cerința 68).
 *
 * Montat la /api/crm/capture-sources. Aici se creează tokenul pe care site-ul îl pune în pagină;
 * endpointul public care îl consumă e `server/routes/crmIntake.ts`.
 *
 * Cere `pipelines.manage`: un formular de captare decide în ce pâlnie intră leadurile firmei și
 * cu ce sursă — e configurare de proces, nu muncă de zi cu zi.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { crmCaptureSources, type NewCrmCaptureSource } from "../db/schema/crmCaptureSources";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";

export const crmCaptureSourcesRoutes = new Hono<{ Variables: AuthVariables }>();
crmCaptureSourcesRoutes.use("/*", requireAuth);

const manage = requireCrmPermission("pipelines.manage");

const createSchema = z.object({
  name: z.string().trim().min(1, "Numele formularului este obligatoriu").max(200),
  defaultSource: z.enum(["webform", "facebook_ad", "google_ads", "referral", "instagram", "other"]).optional(),
  pipelineId: z.string().uuid().optional().nullable(),
  allowedOrigins: z.array(z.string().trim().max(200)).max(20).optional(),
});

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

crmCaptureSourcesRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmCaptureSources)
      .where(eq(crmCaptureSources.tenantId, user.tenantId))
      .orderBy(asc(crmCaptureSources.createdAt));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/capture] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

crmCaptureSourcesRoutes.post("/", manage, zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const values: NewCrmCaptureSource = {
    tenantId: user.tenantId,
    name: body.name,
    // 32 de octeți aleatori: tokenul e public, deci nu trebuie să fie secret — dar trebuie să fie
    // imposibil de ghicit, altfel oricine poate scrie leaduri în baza altui workspace.
    token: randomBytes(24).toString("base64url"),
    createdByUserId: user.id,
  };
  if (body.defaultSource !== undefined) values.defaultSource = body.defaultSource;
  if (body.pipelineId !== undefined) values.pipelineId = body.pipelineId;
  if (body.allowedOrigins !== undefined) values.allowedOrigins = body.allowedOrigins;

  const [row] = await db.insert(crmCaptureSources).values(values).returning();
  return c.json(row, 201);
});

crmCaptureSourcesRoutes.patch("/:id", manage, zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updates: Partial<NewCrmCaptureSource> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.defaultSource !== undefined) updates.defaultSource = body.defaultSource;
  if (body.pipelineId !== undefined) updates.pipelineId = body.pipelineId;
  if (body.allowedOrigins !== undefined) updates.allowedOrigins = body.allowedOrigins;
  if (body.active !== undefined) updates.active = body.active;

  const [row] = await db
    .update(crmCaptureSources)
    .set(updates)
    .where(and(eq(crmCaptureSources.id, id), eq(crmCaptureSources.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

crmCaptureSourcesRoutes.delete("/:id", manage, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(crmCaptureSources)
    .where(and(eq(crmCaptureSources.id, id), eq(crmCaptureSources.tenantId, user.tenantId)))
    .returning();
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
