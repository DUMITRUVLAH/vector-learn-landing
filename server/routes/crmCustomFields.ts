/**
 * CRM Faza 9 — câmpuri personalizate: definițiile workspace-ului + valorile pe lead.
 *
 * Montat la /api/crm/custom-fields.
 *
 * GET    /api/crm/custom-fields              — definițiile tenantului, în ordinea afișării
 * POST   /api/crm/custom-fields              — definiție nouă (cheia se derivă din etichetă)
 * PATCH  /api/crm/custom-fields/:id          — etichetă / opțiuni / ordine
 * DELETE /api/crm/custom-fields/:id          — definiția + valorile ei (cascade în bază)
 * GET    /api/crm/custom-fields/values?leadId= — valorile unui lead
 * PUT    /api/crm/custom-fields/values       — scrie/șterge valoarea unui câmp pe un lead
 *
 * Tabelele (`custom_fields`, `lead_field_values`) există din migrarea 0007, dar n-aveau nicio
 * rută: fiecare workspace are câmpuri proprii („Nr. contract", „Ediția"), iar fără ele oamenii
 * le scriau în notiță, unde nu se pot filtra sau raporta.
 *
 * `key` e imuabilă după creare, ca la etapele de pâlnie: e identificatorul stabil pe care se pot
 * sprijini importuri și rapoarte; redenumirea vizibilă trece prin `label`.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, customFields, leadFieldValues, type NewCustomField } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { logCrmAudit } from "../lib/crm/audit";

export const crmCustomFieldsRoutes = new Hono<{ Variables: AuthVariables }>();
crmCustomFieldsRoutes.use("/*", requireAuth);

/** „Nr. contract" → "nr_contract" — aceeași regulă ca la cheile de etapă (crmStages.ts). */
function slugifyLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "camp";
}

const createFieldSchema = z.object({
  label: z.string().trim().min(1, "Eticheta este obligatorie").max(200),
  type: z.enum(["text", "select", "number"]).optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
});

const updateFieldSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const setValueSchema = z.object({
  leadId: z.string().uuid(),
  fieldId: z.string().uuid(),
  /** `null` sau "" șterge valoarea — un rând gol n-are ce căuta în bază. */
  value: z.string().max(1000).optional().nullable(),
});

// ─── GET /values (ÎNAINTE de /:id — altfel „values" ar fi citit ca un id) ─────

crmCustomFieldsRoutes.get("/values", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (!leadId) return c.json({ error: "lead_id_required" }, 400);

  try {
    const items = await db
      .select()
      .from(leadFieldValues)
      .where(and(eq(leadFieldValues.tenantId, user.tenantId), eq(leadFieldValues.leadId, leadId)));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/custom-fields] valorile nu s-au putut citi:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── PUT /values ──────────────────────────────────────────────────────────────

crmCustomFieldsRoutes.put("/values", zValidator("json", setValueSchema), async (c) => {
  const user = c.get("user");
  const { leadId, fieldId, value } = c.req.valid("json");

  // Și leadul, și definiția câmpului trebuie să fie ale tenantului: altfel s-ar putea lipi o
  // valoare pe leadul altui workspace, sau pe un câmp străin.
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [field] = await db
    .select({ id: customFields.id })
    .from(customFields)
    .where(and(eq(customFields.id, fieldId), eq(customFields.tenantId, user.tenantId)));
  if (!field) return c.json({ error: "not_found" }, 404);

  const clean = value?.trim() ?? "";
  if (clean === "") {
    await db
      .delete(leadFieldValues)
      .where(
        and(
          eq(leadFieldValues.tenantId, user.tenantId),
          eq(leadFieldValues.leadId, leadId),
          eq(leadFieldValues.fieldId, fieldId)
        )
      );
    return c.json({ ok: true, value: null });
  }

  const [existing] = await db
    .select({ id: leadFieldValues.id })
    .from(leadFieldValues)
    .where(
      and(
        eq(leadFieldValues.tenantId, user.tenantId),
        eq(leadFieldValues.leadId, leadId),
        eq(leadFieldValues.fieldId, fieldId)
      )
    );

  if (existing) {
    const [row] = await db
      .update(leadFieldValues)
      .set({ value: clean, updatedAt: new Date() })
      .where(eq(leadFieldValues.id, existing.id))
      .returning();
    return c.json(row);
  }

  const [row] = await db
    .insert(leadFieldValues)
    .values({ tenantId: user.tenantId, leadId, fieldId, value: clean })
    .returning();
  return c.json(row, 201);
});

// ─── GET / ────────────────────────────────────────────────────────────────────

crmCustomFieldsRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(customFields)
      .where(eq(customFields.tenantId, user.tenantId))
      .orderBy(asc(customFields.orderIndex), asc(customFields.createdAt));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/custom-fields] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmCustomFieldsRoutes.post("/", zValidator("json", createFieldSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const key = slugifyLabel(body.label);

  const [existing] = await db
    .select({ id: customFields.id })
    .from(customFields)
    .where(and(eq(customFields.tenantId, user.tenantId), eq(customFields.key, key)));
  if (existing) return c.json({ error: "field_key_taken" }, 409);

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${customFields.orderIndex}), -1)::int` })
    .from(customFields)
    .where(eq(customFields.tenantId, user.tenantId));

  const values: NewCustomField = {
    tenantId: user.tenantId,
    key,
    label: body.label,
    type: body.type ?? "text",
    orderIndex: (maxOrder ?? -1) + 1,
  };
  // Un câmp „select" fără opțiuni ar fi un meniu gol; lista e cerută de UI la creare.
  if (body.options !== undefined) values.options = body.options;

  const [row] = await db.insert(customFields).values(values).returning();

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "custom_field.created",
    target: "crm_custom_field",
    targetId: row.id,
    after: { key: row.key, label: row.label, type: row.type },
  });

  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmCustomFieldsRoutes.patch("/:id", zValidator("json", updateFieldSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updates: Partial<NewCustomField> = { updatedAt: new Date() };
  if (body.label !== undefined) updates.label = body.label;
  if (body.options !== undefined) updates.options = body.options;
  if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex;

  const [row] = await db
    .update(customFields)
    .set(updates)
    .where(and(eq(customFields.id, id), eq(customFields.tenantId, user.tenantId)))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmCustomFieldsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Valorile atârnă de definiție cu ON DELETE cascade (migrarea 0007), deci dispar odată cu ea.
  // Ștergem explicit și aici: pe o bază care n-a apucat să primească constrângerea, altfel ar
  // rămâne valori orfane, invizibile și nenumărate.
  await db
    .delete(leadFieldValues)
    .where(and(eq(leadFieldValues.tenantId, user.tenantId), eq(leadFieldValues.fieldId, id)));

  const [deleted] = await db
    .delete(customFields)
    .where(and(eq(customFields.id, id), eq(customFields.tenantId, user.tenantId)))
    .returning();

  if (!deleted) return c.json({ error: "not_found" }, 404);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "custom_field.deleted",
    target: "crm_custom_field",
    targetId: id,
    before: { key: deleted.key, label: deleted.label },
  });

  return c.json({ ok: true });
});
