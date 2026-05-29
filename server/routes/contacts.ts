/**
 * CRM-114: Lead contacts CRUD
 * GET    /api/leads/:id/contacts
 * POST   /api/leads/:id/contacts
 * PATCH  /api/leads/:id/contacts/:contactId
 * DELETE /api/leads/:id/contacts/:contactId
 *
 * Business rules:
 * - At most ONE contact per lead can have is_primary=1
 * - Setting a new primary resets the previous primary to 0
 * - All queries are tenant_id-scoped
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leadContacts, leads } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const contactRoutes = new Hono<{ Variables: AuthVariables }>();

contactRoutes.use("/*", requireAuth);

const createContactSchema = z.object({
  fullName: z.string().min(1).max(200),
  role: z.string().max(100).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  isPrimary: z.boolean().optional().default(false),
});

const updateContactSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  role: z.string().max(100).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  isPrimary: z.boolean().optional(),
});

/** Verify lead belongs to tenant */
async function getLeadForTenant(leadId: string, tenantId: string) {
  return db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
  });
}

// GET /api/leads/:id/contacts
contactRoutes.get("/leads/:id/contacts", async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select()
    .from(leadContacts)
    .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)));

  return c.json({ items });
});

// POST /api/leads/:id/contacts
contactRoutes.post("/leads/:id/contacts", zValidator("json", createContactSchema), async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  // If setting as primary, reset existing primary first
  if (body.isPrimary) {
    await db
      .update(leadContacts)
      .set({ isPrimary: 0, updatedAt: new Date() })
      .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)));
  }

  const [created] = await db
    .insert(leadContacts)
    .values({
      tenantId,
      leadId,
      fullName: body.fullName,
      role: body.role || null,
      phone: body.phone || null,
      email: body.email || null,
      isPrimary: body.isPrimary ? 1 : 0,
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/leads/:id/contacts/:contactId
contactRoutes.patch("/leads/:id/contacts/:contactId", zValidator("json", updateContactSchema), async (c) => {
  const leadId = c.req.param("id");
  const contactId = c.req.param("contactId");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const contact = await db.query.leadContacts.findFirst({
    where: and(eq(leadContacts.id, contactId), eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)),
  });
  if (!contact) return c.json({ error: "not_found" }, 404);

  // If setting as primary, reset other primaries
  if (body.isPrimary === true) {
    await db
      .update(leadContacts)
      .set({ isPrimary: 0, updatedAt: new Date() })
      .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)));
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.fullName !== undefined) patch.fullName = body.fullName;
  if ("role" in body) patch.role = body.role || null;
  if ("phone" in body) patch.phone = body.phone || null;
  if ("email" in body) patch.email = body.email || null;
  if (body.isPrimary !== undefined) patch.isPrimary = body.isPrimary ? 1 : 0;

  const [updated] = await db
    .update(leadContacts)
    .set(patch)
    .where(and(eq(leadContacts.id, contactId), eq(leadContacts.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

// DELETE /api/leads/:id/contacts/:contactId
contactRoutes.delete("/leads/:id/contacts/:contactId", async (c) => {
  const leadId = c.req.param("id");
  const contactId = c.req.param("contactId");
  const tenantId = c.get("user").tenantId;

  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const contact = await db.query.leadContacts.findFirst({
    where: and(eq(leadContacts.id, contactId), eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)),
  });
  if (!contact) return c.json({ error: "not_found" }, 404);

  await db
    .delete(leadContacts)
    .where(and(eq(leadContacts.id, contactId), eq(leadContacts.tenantId, tenantId)));

  return c.json({ deleted: true });
});
