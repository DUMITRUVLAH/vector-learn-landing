/**
 * CRM Faza 9 — persoane de contact MULTIPLE pe un lead.
 *
 * Montat la /api/crm/contacts.
 *
 * GET    /api/crm/contacts?leadId=  — contactele leadului, principalul primul
 * POST   /api/crm/contacts          — contact nou
 * PATCH  /api/crm/contacts/:id      — editare (inclusiv marcarea ca principal)
 * DELETE /api/crm/contacts/:id      — ștergere
 *
 * Tabela `lead_contacts` exista din migrarea 0007, dar n-avea nicio rută: pe un lead B2B toți
 * oamenii firmei (decidentul, contabila, tehnicul) încăpeau într-un singur câmp „telefon".
 *
 * Regula de business: cel mult UN contact principal per lead. Marcarea unuia ca principal îi
 * scoate pe ceilalți — altfel „sună persoana principală" n-ar mai însemna nimic.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadContacts, type NewLeadContact } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const crmContactsRoutes = new Hono<{ Variables: AuthVariables }>();
crmContactsRoutes.use("/*", requireAuth);

const contactSchema = z.object({
  fullName: z.string().trim().min(2, "Numele contactului este obligatoriu").max(200),
  role: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email("Adresa de email este invalidă").max(255).optional().nullable().or(z.literal("")),
  isPrimary: z.boolean().optional(),
});

const createSchema = contactSchema.extend({ leadId: z.string().uuid() });
const updateSchema = contactSchema.partial();

/** Leadul trebuie să fie al tenantului — altfel contactele altui workspace ar fi scriibile. */
async function leadOfTenant(leadId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return !!row;
}

/** Exact un principal: îi scoate pe ceilalți din lead. */
async function demoteOthers(tenantId: string, leadId: string, keepId: string): Promise<void> {
  await db
    .update(leadContacts)
    .set({ isPrimary: 0, updatedAt: new Date() })
    .where(
      and(eq(leadContacts.tenantId, tenantId), eq(leadContacts.leadId, leadId), ne(leadContacts.id, keepId))
    );
}

// ─── GET / ────────────────────────────────────────────────────────────────────

crmContactsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (!leadId) return c.json({ error: "lead_id_required" }, 400);

  try {
    const items = await db
      .select()
      .from(leadContacts)
      .where(and(eq(leadContacts.tenantId, user.tenantId), eq(leadContacts.leadId, leadId)))
      // Principalul primul, apoi în ordinea adăugării: e ordinea în care omul sună.
      .orderBy(desc(leadContacts.isPrimary), asc(leadContacts.createdAt));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/contacts] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmContactsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if (!(await leadOfTenant(body.leadId, user.tenantId))) return c.json({ error: "not_found" }, 404);

  const values: NewLeadContact = {
    tenantId: user.tenantId,
    leadId: body.leadId,
    fullName: body.fullName,
    isPrimary: body.isPrimary ? 1 : 0,
  };
  if (body.role !== undefined) values.role = body.role || null;
  if (body.phone !== undefined) values.phone = body.phone || null;
  if (body.email !== undefined) values.email = body.email || null;

  const [row] = await db.insert(leadContacts).values(values).returning();
  if (row.isPrimary === 1) await demoteOthers(user.tenantId, body.leadId, row.id);

  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmContactsRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: leadContacts.id, leadId: leadContacts.leadId })
    .from(leadContacts)
    .where(and(eq(leadContacts.id, id), eq(leadContacts.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const updates: Partial<NewLeadContact> = { updatedAt: new Date() };
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.role !== undefined) updates.role = body.role || null;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.isPrimary !== undefined) updates.isPrimary = body.isPrimary ? 1 : 0;

  const [row] = await db
    .update(leadContacts)
    .set(updates)
    .where(and(eq(leadContacts.id, id), eq(leadContacts.tenantId, user.tenantId)))
    .returning();

  if (body.isPrimary) await demoteOthers(user.tenantId, existing.leadId, id);

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmContactsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(leadContacts)
    .where(and(eq(leadContacts.id, id), eq(leadContacts.tenantId, user.tenantId)))
    .returning();

  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
