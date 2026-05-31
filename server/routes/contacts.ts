/**
 * CRM-114: Lead contacts CRUD (multiple contacts per B2B lead)
 *
 *   GET    /api/leads/:id/contacts
 *   POST   /api/leads/:id/contacts
 *   PATCH  /api/leads/:id/contacts/:contactId
 *   DELETE /api/leads/:id/contacts/:contactId
 *
 * `isPrimary` is stored as an integer (0/1). At most one contact per lead is
 * primary — setting one primary demotes the others.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { leadContacts, leads } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const contactRoutes = new Hono<{ Variables: AuthVariables }>();

contactRoutes.use("/*", requireAuth);

async function getLeadForTenant(leadId: string, tenantId: string) {
  return db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
  });
}

const createContactSchema = z.object({
  fullName: z.string().min(1).max(200),
  role: z.string().max(100).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  email: z.string().email().max(255).nullable().optional().or(z.literal("")),
  isPrimary: z.boolean().optional(),
});

const updateContactSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  role: z.string().max(100).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  email: z.string().email().max(255).nullable().optional().or(z.literal("")),
  isPrimary: z.boolean().optional(),
});

contactRoutes.get("/leads/:id/contacts", async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);
  const items = await db
    .select()
    .from(leadContacts)
    .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)))
    .orderBy(asc(leadContacts.createdAt));
  return c.json({ items });
});

contactRoutes.post("/leads/:id/contacts", zValidator("json", createContactSchema), async (c) => {
  const leadId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);
  const isPrimary = body.isPrimary ? 1 : 0;
  const [created] = await db
    .insert(leadContacts)
    .values({
      tenantId,
      leadId,
      fullName: body.fullName,
      role: body.role ?? null,
      phone: body.phone ?? null,
      email: body.email ? body.email : null,
      isPrimary,
    })
    .returning();
  if (isPrimary) {
    await db
      .update(leadContacts)
      .set({ isPrimary: 0, updatedAt: new Date() })
      .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId), ne(leadContacts.id, created.id)));
  }
  return c.json(created, 201);
});

contactRoutes.patch("/leads/:id/contacts/:contactId", zValidator("json", updateContactSchema), async (c) => {
  const leadId = c.req.param("id");
  const contactId = c.req.param("contactId");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.fullName !== undefined) patch.fullName = body.fullName;
  if ("role" in body) patch.role = body.role ?? null;
  if ("phone" in body) patch.phone = body.phone ?? null;
  if ("email" in body) patch.email = body.email ? body.email : null;
  if (body.isPrimary !== undefined) patch.isPrimary = body.isPrimary ? 1 : 0;
  const [updated] = await db
    .update(leadContacts)
    .set(patch)
    .where(and(eq(leadContacts.id, contactId), eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  if (body.isPrimary === true) {
    await db
      .update(leadContacts)
      .set({ isPrimary: 0, updatedAt: new Date() })
      .where(and(eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId), ne(leadContacts.id, contactId)));
  }
  return c.json(updated);
});

contactRoutes.delete("/leads/:id/contacts/:contactId", async (c) => {
  const leadId = c.req.param("id");
  const contactId = c.req.param("contactId");
  const tenantId = c.get("user").tenantId;
  const lead = await getLeadForTenant(leadId, tenantId);
  if (!lead) return c.json({ error: "not_found" }, 404);
  const [deleted] = await db
    .delete(leadContacts)
    .where(and(eq(leadContacts.id, contactId), eq(leadContacts.leadId, leadId), eq(leadContacts.tenantId, tenantId)))
    .returning({ id: leadContacts.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ deleted: true });
});
