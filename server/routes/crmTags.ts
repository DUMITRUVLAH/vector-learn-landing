/**
 * CRM — Etichete pe lead (tags)
 *
 * Mounted at /api/crm/tags (rămâne de conectat: app.ts: app.route("/api/crm/tags", crmTagsRoutes))
 *
 * GET    /api/crm/tags?leadId=       — etichetele unui lead (404 dacă lead-ul nu e în tenant)
 * GET    /api/crm/tags/suggestions   — etichetele distincte ale tenantului, pentru autocomplete
 * POST   /api/crm/tags               — { leadId, tag } → adaugă (idempotent: dacă există deja
 *                                       exact aceeași etichetă pe lead, întoarce rândul existent,
 *                                       nu-l dublează)
 * DELETE /api/crm/tags/:id           — șterge o etichetă
 *
 * `lead_tags` există deja în `server/db/schema/leads.ts` (rămasă din CRM-ul vechi al repo-ului) —
 * NU o redefinim aici, ca să nu avem două surse de adevăr pentru aceeași tabelă.
 *
 * IMPORTANT: indexul `ltags_unique_idx` din schemă NU e un index unic real (e doar un `index()`
 * obișnuit, numit înșelător) — baza NU respinge singură un duplicat. Verificarea „nu se dublează"
 * se face aici, în handler, înainte de insert.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadTags } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const crmTagsRoutes = new Hono<{ Variables: AuthVariables }>();
crmTagsRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const addTagSchema = z.object({
  leadId: z.string().uuid("Lead invalid"),
  tag: z.string().min(1, "Eticheta este obligatorie").max(100),
});

// ─── GET /suggestions — ÎNAINTE de orice rută cu efect de citire generală ─────
// (nu există conflict de rutare cu GET / de mai jos — sunt căi distincte — dar rămâne primul
// handler GET din fișier, ca ordinea să oglindească explicit „specific înaintea generalului",
// la fel ca /pipeline din crmLeads.ts.)

crmTagsRoutes.get("/suggestions", async (c) => {
  const user = c.get("user");

  const rows = await db
    .selectDistinct({ tag: leadTags.tag })
    .from(leadTags)
    .where(eq(leadTags.tenantId, user.tenantId))
    .orderBy(asc(leadTags.tag));

  return c.json({ items: rows.map((r) => r.tag) });
});

// ─── GET /?leadId= ────────────────────────────────────────────────────────────

crmTagsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (!leadId) return c.json({ error: "leadId_required" }, 400);

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select()
    .from(leadTags)
    .where(and(eq(leadTags.tenantId, user.tenantId), eq(leadTags.leadId, leadId)))
    .orderBy(asc(leadTags.tag));

  return c.json({ items });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmTagsRoutes.post("/", zValidator("json", addTagSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { leadId, tag } = c.req.valid("json");
  const trimmedTag = tag.trim();

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Idempotent: aceeași etichetă, adăugată de două ori pe același lead, nu se dublează — vezi
  // avertismentul din capul fișierului despre `ltags_unique_idx`.
  const [existingTag] = await db
    .select()
    .from(leadTags)
    .where(and(eq(leadTags.tenantId, tenantId), eq(leadTags.leadId, leadId), eq(leadTags.tag, trimmedTag)));
  if (existingTag) return c.json(existingTag, 200);

  const [row] = await db
    .insert(leadTags)
    .values({ tenantId, leadId, tag: trimmedTag })
    .returning();

  return c.json(row, 201);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmTagsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: leadTags.id })
    .from(leadTags)
    .where(and(eq(leadTags.id, id), eq(leadTags.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(leadTags).where(and(eq(leadTags.id, id), eq(leadTags.tenantId, user.tenantId)));

  return c.json({ ok: true });
});
