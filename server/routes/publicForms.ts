/**
 * FORMS-001/005 — Rute publice (FĂRĂ AUTENTIFICARE) pentru formulare
 *
 * GET  /api/public/forms/:slug         — formular published + câmpuri (404 dacă draft/closed)
 * POST /api/public/forms/:slug/submit  — submit → dedup lead → CRM
 * POST /api/public/forms/:slug/ping    — FORMS-005: incrementare contor view/start
 *
 * NOTĂ DE IMPLEMENTARE: Hono 4.x aplică middleware-ul use("/*") din sub-routere ca middleware
 * global pentru întregul prefix (inclusiv tagRoutes.use("/*",requireAuth) → /api/*).
 * Pentru a evita interceptarea, handler-ele sunt exportate ca funcții standalone și înregistrate
 * DIRECT pe `app` (pattern validat de /api/health). Funcțiile sunt importate în app.ts.
 *
 * Refolosește exact dedup-ul din /api/leads/intake:
 *   - normalizePhone/normalizeEmail din server/lib/normalize.ts
 *   - query pe phoneNormalized / emailNormalized
 *   - leadInteractions system la dedup-hit
 *   - source = 'webform' (valoare EXISTENTĂ în lead_source enum)
 *   - utmSource = 'form:<slug>' (varchar liber, nu enum)
 */
import type { Context } from "hono";
import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  forms,
  formFields,
  formSubmissions,
  formLogic,
  leads,
  leadInteractions,
  leadTags,
} from "../db/schema";
import { normalizePhone, normalizeEmail } from "../lib/normalize";
import { mapAnswersToLead, validateRequired } from "../lib/formMapping";

type HonoContext = Context;

// ─── GET /api/public/forms/:slug — formular published + câmpuri ───────────────

export async function publicFormGetHandler(c: HonoContext) {
  const slug = c.req.param("slug") ?? "";

  // TEMP-DEBUG: surface the real error to diagnose the prod 500 (revert after).
  let form;
  try {
    form = await db.query.forms.findFirst({
      where: and(eq(forms.slug, slug), eq(forms.status, "published")),
    });
  } catch (err) {
    return c.json({ debug: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 400) : undefined }, 500);
  }

  if (!form) return c.json({ error: "not_found" }, 404);

  const fieldRows = await db
    .select()
    .from(formFields)
    .where(and(eq(formFields.formId, form.id), eq(formFields.tenantId, form.tenantId)))
    .orderBy(formFields.position);

  const allFields = Array.isArray(fieldRows)
    ? fieldRows
    : (fieldRows as unknown as { rows: typeof fieldRows }).rows ?? fieldRows;

  // FORMS-004: include logic rules in public response
  const logicRows = await db
    .select()
    .from(formLogic)
    .where(and(eq(formLogic.formId, form.id), eq(formLogic.tenantId, form.tenantId)));

  const logicArr = Array.isArray(logicRows)
    ? logicRows
    : (logicRows as unknown as { rows: typeof logicRows }).rows ?? logicRows;

  return c.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      thankYouMessage: form.thankYouMessage,
      redirectUrl: form.redirectUrl,
      fields: allFields.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        placeholder: f.placeholder,
        required: f.required,
        position: f.position,
        options: f.options,
        leadMapping: f.leadMapping,
        hidden: f.hidden,
        hiddenSourceParam: f.hiddenSourceParam,
      })),
      logic: logicArr.map((r) => ({
        id: r.id,
        formId: r.formId,
        fromFieldId: r.fromFieldId,
        condition: r.condition,
        action: r.action,
        targetFieldId: r.targetFieldId,
        position: r.position,
      })),
    },
  });
}

// ─── POST /api/public/forms/:slug/submit — submit formular ────────────────────

const submitSchema = z.object({
  /** { [fieldId]: value } — valorile completate de vizitator */
  answers: z.record(z.string().uuid(), z.unknown()),
  utm: z
    .object({
      source: z.string().max(100).optional(),
      medium: z.string().max(100).optional(),
      campaign: z.string().max(100).optional(),
      fbclid: z.string().max(200).optional(),
      gclid: z.string().max(200).optional(),
    })
    .optional(),
  /** Valori pre-populate pentru câmpuri hidden */
  hidden: z.record(z.string(), z.string()).optional(),
});

export async function publicFormSubmitHandler(c: HonoContext) {
  const slug = c.req.param("slug") ?? "";

  // Validare body manual (fără zValidator decorator care nu funcționează pe handlers standalone)
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parseResult = submitSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return c.json({ error: "validation_error", issues: parseResult.error.issues }, 400);
  }
  const body = parseResult.data;

  // 1. Găsim formularul published
  const form = await db.query.forms.findFirst({
    where: and(eq(forms.slug, slug), eq(forms.status, "published")),
  });
  if (!form) return c.json({ error: "not_found" }, 404);

  const tenantId = form.tenantId;

  // 2. Aducem câmpurile formularului
  const fieldRows = await db
    .select()
    .from(formFields)
    .where(and(eq(formFields.formId, form.id), eq(formFields.tenantId, tenantId)))
    .orderBy(formFields.position);

  const fields = Array.isArray(fieldRows)
    ? fieldRows
    : (fieldRows as unknown as { rows: typeof fieldRows }).rows ?? fieldRows;

  // Combinăm answers cu valorile hidden dacă există
  const answers: Record<string, unknown> = { ...body.answers };
  if (body.hidden) {
    for (const field of fields) {
      if (field.hidden && field.hiddenSourceParam && body.hidden[field.hiddenSourceParam]) {
        answers[field.id] = body.hidden[field.hiddenSourceParam];
      }
    }
  }

  // 3. Validare câmpuri required
  const missing = validateRequired(fields, answers);
  if (missing.length > 0) {
    return c.json({ error: "missing_required", missingFields: missing }, 400);
  }

  // 4. Mapare câmpuri → date de lead
  const mapped = mapAnswersToLead(fields, answers);

  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    null;

  let leadId: string | null = null;
  let leadCreated = false;

  // 5. Dedup + create/update lead (doar dacă există phone SAU email)
  if (mapped.phone || mapped.email) {
    const phoneNormalized = normalizePhone(mapped.phone ?? null);
    const emailNormalized = normalizeEmail(mapped.email ?? null);

    // Dedup: același tenant + același phone SAU email normalizat
    const existing = await db.query.leads.findFirst({
      where: and(
        eq(leads.tenantId, tenantId),
        or(
          phoneNormalized ? eq(leads.phoneNormalized, phoneNormalized) : undefined,
          emailNormalized ? eq(leads.emailNormalized, emailNormalized) : undefined
        )
      ),
    });

    if (existing) {
      // Dedup hit — adaugă interacțiune system și reutilizează leadId-ul existent
      leadId = existing.id;
      leadCreated = false;

      await db.insert(leadInteractions).values({
        tenantId,
        leadId: existing.id,
        type: "system",
        direction: "internal",
        body: `Re-submit formular: ${slug}`,
      });
    } else {
      // Lead nou — inserare cu source='webform', utmSource='form:<slug>'
      const consentField = fields.find((f) => f.type === "consent");
      const consentChecked =
        consentField !== undefined &&
        (answers[consentField.id] === true ||
          answers[consentField.id] === "true" ||
          answers[consentField.id] === "yes");

      const [created] = await db
        .insert(leads)
        .values({
          tenantId,
          fullName: mapped.fullName || "Vizitator",
          phone: mapped.phone || null,
          phoneNormalized: normalizePhone(mapped.phone ?? null),
          email: mapped.email || null,
          emailNormalized: normalizeEmail(mapped.email ?? null),
          interestCourse: mapped.interestCourse || null,
          source: "webform",
          // utmSource = 'form:<slug>' — varchar liber, NU valoare din enum lead_source
          utmSource: `form:${slug}`,
          utmMedium: body.utm?.medium || null,
          utmCampaign: body.utm?.campaign || null,
          fbclid: body.utm?.fbclid || null,
          gclid: body.utm?.gclid || null,
          // GDPR: populăm consent dacă există câmp consent bifat
          consentText: consentChecked && consentField
            ? (consentField.label ?? "Consimțământ dat")
            : null,
          consentAt: consentChecked ? new Date() : null,
          ipAtConsent: consentChecked ? ip : null,
        })
        .returning();

      leadId = created.id;
      leadCreated = true;

      await db.insert(leadInteractions).values({
        tenantId,
        leadId: created.id,
        type: "system",
        direction: "internal",
        body: `Lead creat din formular: ${slug}`,
      });
    }

    // 6. Inserare taguri în lead_tags (onConflictDoNothing, ca la import)
    if (mapped.tags.length > 0 && leadId) {
      const tagValues = mapped.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .map((tag) => ({ tenantId, leadId: leadId as string, tag }));

      if (tagValues.length > 0) {
        await db.insert(leadTags).values(tagValues).onConflictDoNothing().catch(() => undefined);
      }
    }
  }

  // 7. Salvare form_submissions
  await db.insert(formSubmissions).values({
    tenantId,
    formId: form.id,
    answers,
    leadId: leadId ?? null,
    utm: body.utm
      ? {
          source: body.utm.source,
          medium: body.utm.medium,
          campaign: body.utm.campaign,
          fbclid: body.utm.fbclid,
          gclid: body.utm.gclid,
        }
      : null,
    status: "complete",
    ip,
  });

  return c.json({ ok: true, leadCreated, leadId });
}

// ─── POST /api/public/forms/:slug/ping — FORMS-005: analytics event ──────────
//
// Body: { event: "view" | "start" }
// Lightweight: incrementează contorul direct fără a verifica dacă slug-ul există.
// 0 rânduri afectate (slug inexistent) → ignorat silențios, răspuns tot { ok: true }.
// Rate-limit soft implicit: o singură UPDATE atomică, fără round-trip de SELECT.

export async function publicFormPingHandler(c: HonoContext) {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parseResult = z
    .object({ event: z.enum(["view", "start"]) })
    .safeParse(rawBody);

  if (!parseResult.success) {
    return c.json({ error: "invalid_event", expected: "view|start" }, 400);
  }

  const { event } = parseResult.data;
  const slug = c.req.param("slug") ?? "";

  // Increment atomic — nu returnăm date, nu facem SELECT suplimentar
  if (event === "view") {
    await db
      .update(forms)
      .set({ views: sql`${forms.views} + 1` })
      .where(eq(forms.slug, slug))
      .catch(() => undefined); // bot spam → ignorat
  } else {
    await db
      .update(forms)
      .set({ starts: sql`${forms.starts} + 1` })
      .where(eq(forms.slug, slug))
      .catch(() => undefined);
  }

  return c.json({ ok: true });
}
