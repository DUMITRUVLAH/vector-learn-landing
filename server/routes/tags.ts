/**
 * CRM-115: Lead tags CRUD + Custom fields CRUD + Lead field values
 *
 * Tags (per lead):
 *   GET    /api/leads/:id/tags
 *   POST   /api/leads/:id/tags
 *   DELETE /api/leads/:id/tags/:tag
 *
 * Custom fields (per tenant — settings):
 *   GET    /api/settings/custom-fields
 *   POST   /api/settings/custom-fields
 *   PATCH  /api/settings/custom-fields/:id
 *   DELETE /api/settings/custom-fields/:id
 *
 * Lead field values (per lead):
 *   GET    /api/leads/:id/field-values
 *   POST   /api/leads/:id/field-values     — upsert
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leadTags, customFields, leadFieldValues, leads } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const tagRoutes = new Hono<{ Variables: AuthVariables }>();

tagRoutes.use("/*", requireAuth);

/** Helper: verify lead ownership */
async function getLeadForTenant(leadId: string, tenantId: string) {
  return db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
  });
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

// GET /api/leads/:id/tags
tagRoutes.get("/leads/:id/tags", async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select()
    .from(leadTags)
    .where(and(eq(leadTags.leadId, leadId), eq(leadTags.tenantId, tenantId)));

  return c.json({ tags: items.map((t) => t.tag) });
});

// POST /api/leads/:id/tags
tagRoutes.post("/leads/:id/tags", zValidator("json", z.object({ tag: z.string().min(1).max(100) })), async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const { tag } = c.req.valid("json");

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Check if tag already exists (idempotent)
  const existing = await db.query.leadTags.findFirst({
    where: and(eq(leadTags.leadId, leadId), eq(leadTags.tag, tag.toLowerCase().trim())),
  });
  if (existing) return c.json({ tag: existing.tag }, 200);

  const [created] = await db
    .insert(leadTags)
    .values({ tenantId, leadId, tag: tag.toLowerCase().trim() })
    .returning();

  return c.json({ tag: created.tag }, 201);
});

// DELETE /api/leads/:id/tags/:tag
tagRoutes.delete("/leads/:id/tags/:tag", async (c) => {
  const leadId = c.req.param("id");
  const tag = c.req.param("tag");
  const tenantId = c.get("user").tenantId;

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  await db
    .delete(leadTags)
    .where(and(eq(leadTags.leadId, leadId), eq(leadTags.tag, tag), eq(leadTags.tenantId, tenantId)));

  return c.json({ deleted: true });
});

// ─── Custom fields (Settings) ─────────────────────────────────────────────────

const createFieldSchema = z.object({
  key: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/, "only lowercase, digits, underscores"),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "select", "number"]).default("text"),
  options: z.array(z.string().max(200)).optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
});

const updateFieldSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  type: z.enum(["text", "select", "number"]).optional(),
  options: z.array(z.string().max(200)).optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
});

// GET /api/settings/custom-fields
tagRoutes.get("/settings/custom-fields", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(customFields)
    .where(eq(customFields.tenantId, tenantId))
    .orderBy(asc(customFields.orderIndex));
  return c.json({ fields: items });
});

// POST /api/settings/custom-fields
tagRoutes.post("/settings/custom-fields", zValidator("json", createFieldSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.customFields.findFirst({
    where: and(eq(customFields.tenantId, tenantId), eq(customFields.key, body.key)),
  });
  if (existing) return c.json({ error: "key_exists" }, 409);

  const [created] = await db
    .insert(customFields)
    .values({
      tenantId,
      key: body.key,
      label: body.label,
      type: body.type,
      options: body.options ?? null,
      orderIndex: body.orderIndex,
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/settings/custom-fields/:id
tagRoutes.patch("/settings/custom-fields/:id", zValidator("json", updateFieldSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.label !== undefined) patch.label = body.label;
  if (body.type !== undefined) patch.type = body.type;
  if ("options" in body) patch.options = body.options;
  if (body.orderIndex !== undefined) patch.orderIndex = body.orderIndex;

  const [updated] = await db
    .update(customFields)
    .set(patch)
    .where(and(eq(customFields.id, id), eq(customFields.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// DELETE /api/settings/custom-fields/:id
tagRoutes.delete("/settings/custom-fields/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const field = await db.query.customFields.findFirst({
    where: and(eq(customFields.id, id), eq(customFields.tenantId, tenantId)),
  });
  if (!field) return c.json({ error: "not_found" }, 404);

  // Delete field values first (FK would cascade, but explicit is cleaner)
  await db
    .delete(leadFieldValues)
    .where(and(eq(leadFieldValues.fieldId, id), eq(leadFieldValues.tenantId, tenantId)));

  await db
    .delete(customFields)
    .where(and(eq(customFields.id, id), eq(customFields.tenantId, tenantId)));

  return c.json({ deleted: true });
});

// ─── Lead field values ────────────────────────────────────────────────────────

// GET /api/leads/:id/field-values
tagRoutes.get("/leads/:id/field-values", async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const values = await db
    .select()
    .from(leadFieldValues)
    .where(and(eq(leadFieldValues.leadId, leadId), eq(leadFieldValues.tenantId, tenantId)));

  // Also return field definitions for this tenant
  const fields = await db
    .select()
    .from(customFields)
    .where(eq(customFields.tenantId, tenantId))
    .orderBy(asc(customFields.orderIndex));

  return c.json({ values, fields });
});

// POST /api/leads/:id/field-values — upsert (insert or update)
tagRoutes.post(
  "/leads/:id/field-values",
  zValidator("json", z.object({ fieldId: z.string().uuid(), value: z.string().max(1000).nullable() })),
  async (c) => {
    const leadId = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const { fieldId, value } = c.req.valid("json");

    const lead = await getLeadForTenant(leadId, tenantId);
    if (!lead) return c.json({ error: "not_found" }, 404);

    // Verify field belongs to tenant
    const field = await db.query.customFields.findFirst({
      where: and(eq(customFields.id, fieldId), eq(customFields.tenantId, tenantId)),
    });
    if (!field) return c.json({ error: "field_not_found" }, 404);

    // Upsert: check if value exists
    const existing = await db.query.leadFieldValues.findFirst({
      where: and(eq(leadFieldValues.leadId, leadId), eq(leadFieldValues.fieldId, fieldId)),
    });

    if (existing) {
      const [updated] = await db
        .update(leadFieldValues)
        .set({ value: value ?? null, updatedAt: new Date() })
        .where(eq(leadFieldValues.id, existing.id))
        .returning();
      return c.json(updated);
    }

    const [created] = await db
      .insert(leadFieldValues)
      .values({ tenantId, leadId, fieldId, value: value ?? null })
      .returning();

    return c.json(created, 201);
  }
);
