/**
 * FORMS-001 — Rute admin autentificate pentru gestionarea formularelor
 *
 * GET    /api/forms                        — lista formularelor tenantului
 * POST   /api/forms                        — creare formular
 * GET    /api/forms/:id                    — detalii formular + câmpuri
 * PATCH  /api/forms/:id                    — actualizare formular
 * DELETE /api/forms/:id                    — ștergere formular
 * POST   /api/forms/:id/fields             — adăugare câmp
 * PATCH  /api/forms/:id/fields/:fieldId    — actualizare câmp
 * DELETE /api/forms/:id/fields/:fieldId    — ștergere câmp
 * PUT    /api/forms/:id/fields/reorder     — reordonare câmpuri
 * POST   /api/forms/:id/publish            — publicare formular
 * GET    /api/forms/:id/submissions        — lista submisiilor
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { forms, formFields, formSubmissions } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const formRoutes = new Hono<{ Variables: AuthVariables }>();

formRoutes.use("*", requireAuth);

// ─── Validări ─────────────────────────────────────────────────────────────────

const LEAD_MAPPINGS = ["fullName", "phone", "email", "interestCourse", "tag", "none"] as const;
const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "rating",
  "yes_no",
  "date",
  "consent",
  "hidden",
] as const;

const createFormSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug-ul poate conține doar litere mici, cifre și cratime"),
  description: z.string().max(1000).optional().nullable(),
  thankYouMessage: z.string().max(500).optional().nullable(),
  redirectUrl: z.string().max(1000).url().optional().nullable().or(z.literal("")),
});

const updateFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  thankYouMessage: z.string().max(500).optional().nullable(),
  redirectUrl: z.string().max(1000).url().optional().nullable().or(z.literal("")),
});

const createFieldSchema = z.object({
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(500),
  placeholder: z.string().max(500).optional().nullable(),
  required: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  options: z.array(z.string().max(200)).max(100).optional().nullable(),
  leadMapping: z.enum(LEAD_MAPPINGS).optional().nullable(),
  hidden: z.boolean().default(false),
  hiddenSourceParam: z.string().max(100).optional().nullable(),
});

const updateFieldSchema = z.object({
  type: z.enum(FIELD_TYPES).optional(),
  label: z.string().min(1).max(500).optional(),
  placeholder: z.string().max(500).optional().nullable(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  options: z.array(z.string().max(200)).max(100).optional().nullable(),
  leadMapping: z.enum(LEAD_MAPPINGS).optional().nullable(),
  hidden: z.boolean().optional(),
  hiddenSourceParam: z.string().max(100).optional().nullable(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRows<T>(result: T[] | { rows: T[] }): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

// ─── GET /api/forms — lista formularelor ──────────────────────────────────────

formRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select()
    .from(forms)
    .where(eq(forms.tenantId, tenantId))
    .orderBy(desc(forms.createdAt))
    .limit(100);

  const items = toRows(rows);
  return c.json({ items });
});

// ─── POST /api/forms — creare formular ────────────────────────────────────────

formRoutes.post("/", zValidator("json", createFormSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  // Verifică unicitatea slug-ului per tenant
  const existing = await db.query.forms.findFirst({
    where: and(eq(forms.tenantId, tenantId), eq(forms.slug, body.slug)),
  });
  if (existing) return c.json({ error: "slug_already_exists" }, 409);

  const [form] = await db
    .insert(forms)
    .values({
      tenantId,
      title: body.title,
      slug: body.slug,
      description: body.description ?? null,
      thankYouMessage: body.thankYouMessage ?? null,
      redirectUrl: body.redirectUrl || null,
      createdBy: userId,
    })
    .returning();

  return c.json({ form }, 201);
});

// ─── GET /api/forms/:id — detalii + câmpuri ───────────────────────────────────

formRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const form = await db.query.forms.findFirst({
    where: and(eq(forms.id, id), eq(forms.tenantId, tenantId)),
  });
  if (!form) return c.json({ error: "not_found" }, 404);

  const fieldRows = await db
    .select()
    .from(formFields)
    .where(and(eq(formFields.formId, id), eq(formFields.tenantId, tenantId)))
    .orderBy(asc(formFields.position));

  const fields = toRows(fieldRows);
  return c.json({ form, fields });
});

// ─── PATCH /api/forms/:id — actualizare formular ──────────────────────────────

formRoutes.patch("/:id", zValidator("json", updateFormSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.query.forms.findFirst({
    where: and(eq(forms.id, id), eq(forms.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(forms)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.thankYouMessage !== undefined ? { thankYouMessage: body.thankYouMessage } : {}),
      ...(body.redirectUrl !== undefined ? { redirectUrl: body.redirectUrl || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(forms.id, id), eq(forms.tenantId, tenantId)))
    .returning();

  return c.json({ form: updated });
});

// ─── DELETE /api/forms/:id — ștergere formular ────────────────────────────────

formRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const existing = await db.query.forms.findFirst({
    where: and(eq(forms.id, id), eq(forms.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(forms).where(and(eq(forms.id, id), eq(forms.tenantId, tenantId)));
  return c.json({ ok: true });
});

// ─── POST /api/forms/:id/publish — publicare formular ────────────────────────

formRoutes.post("/:id/publish", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const existing = await db.query.forms.findFirst({
    where: and(eq(forms.id, id), eq(forms.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Verifică că există cel puțin un câmp
  const fieldRows = await db
    .select()
    .from(formFields)
    .where(and(eq(formFields.formId, id), eq(formFields.tenantId, tenantId)))
    .limit(1);

  const fields = toRows(fieldRows);
  if (fields.length === 0) {
    return c.json({ error: "no_fields", message: "Formularul trebuie să aibă cel puțin un câmp înainte de publicare" }, 400);
  }

  const [updated] = await db
    .update(forms)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(forms.id, id), eq(forms.tenantId, tenantId)))
    .returning();

  return c.json({ form: updated });
});

// ─── POST /api/forms/:id/fields — adăugare câmp ───────────────────────────────

formRoutes.post("/:id/fields", zValidator("json", createFieldSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const formId = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.query.forms.findFirst({
    where: and(eq(forms.id, formId), eq(forms.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [field] = await db
    .insert(formFields)
    .values({
      tenantId,
      formId,
      type: body.type,
      label: body.label,
      placeholder: body.placeholder ?? null,
      required: body.required,
      position: body.position,
      options: body.options ?? null,
      leadMapping: body.leadMapping ?? null,
      hidden: body.hidden,
      hiddenSourceParam: body.hiddenSourceParam ?? null,
    })
    .returning();

  return c.json({ field }, 201);
});

// ─── PATCH /api/forms/:id/fields/:fieldId — actualizare câmp ──────────────────

formRoutes.patch("/:id/fields/:fieldId", zValidator("json", updateFieldSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const formId = c.req.param("id");
  const fieldId = c.req.param("fieldId");
  const body = c.req.valid("json");

  const existing = await db.query.formFields.findFirst({
    where: and(
      eq(formFields.id, fieldId),
      eq(formFields.formId, formId),
      eq(formFields.tenantId, tenantId)
    ),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(formFields)
    .set({
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.placeholder !== undefined ? { placeholder: body.placeholder } : {}),
      ...(body.required !== undefined ? { required: body.required } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.options !== undefined ? { options: body.options } : {}),
      ...(body.leadMapping !== undefined ? { leadMapping: body.leadMapping } : {}),
      ...(body.hidden !== undefined ? { hidden: body.hidden } : {}),
      ...(body.hiddenSourceParam !== undefined ? { hiddenSourceParam: body.hiddenSourceParam } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(formFields.id, fieldId),
        eq(formFields.formId, formId),
        eq(formFields.tenantId, tenantId)
      )
    )
    .returning();

  return c.json({ field: updated });
});

// ─── DELETE /api/forms/:id/fields/:fieldId — ștergere câmp ───────────────────

formRoutes.delete("/:id/fields/:fieldId", async (c) => {
  const tenantId = c.get("user").tenantId;
  const formId = c.req.param("id");
  const fieldId = c.req.param("fieldId");

  const existing = await db.query.formFields.findFirst({
    where: and(
      eq(formFields.id, fieldId),
      eq(formFields.formId, formId),
      eq(formFields.tenantId, tenantId)
    ),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .delete(formFields)
    .where(
      and(
        eq(formFields.id, fieldId),
        eq(formFields.formId, formId),
        eq(formFields.tenantId, tenantId)
      )
    );

  return c.json({ ok: true });
});

// ─── PUT /api/forms/:id/fields/reorder — reordonare câmpuri ──────────────────

formRoutes.put("/:id/fields/reorder", zValidator("json", reorderSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const formId = c.req.param("id");
  const { ids } = c.req.valid("json");

  const formExists = await db.query.forms.findFirst({
    where: and(eq(forms.id, formId), eq(forms.tenantId, tenantId)),
  });
  if (!formExists) return c.json({ error: "not_found" }, 404);

  // Actualizează poziția fiecărui câmp în ordinea din array
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(formFields)
      .set({ position: i, updatedAt: new Date() })
      .where(
        and(
          eq(formFields.id, ids[i]),
          eq(formFields.formId, formId),
          eq(formFields.tenantId, tenantId)
        )
      );
  }

  return c.json({ ok: true });
});

// ─── GET /api/forms/:id/submissions — lista submisiilor ───────────────────────

formRoutes.get("/:id/submissions", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const formExists = await db.query.forms.findFirst({
    where: and(eq(forms.id, id), eq(forms.tenantId, tenantId)),
  });
  if (!formExists) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(formSubmissions)
    .where(and(eq(formSubmissions.formId, id), eq(formSubmissions.tenantId, tenantId)))
    .orderBy(desc(formSubmissions.submittedAt))
    .limit(100);

  const items = toRows(rows);
  return c.json({ items });
});
