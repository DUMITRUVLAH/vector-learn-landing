/**
 * CRM Faza 2 — Etape de pâlnie (pipeline stages), configurabile PER WORKSPACE
 *
 * Mounted at /api/crm/stages (app.ts: app.route("/api/crm/stages", crmStagesRoutes))
 *
 * GET    /api/crm/stages?pipelineId= — etapele UNEI pâlnii, ordonate după orderIndex (seed automat
 *                                     dacă pâlnia n-are încă nicio etapă — vezi ensureTenantStages).
 *                                     Fără `pipelineId` → pâlnia implicită a workspace-ului.
 * POST   /api/crm/stages           — creare (cheia se derivă din etichetă dacă nu e dată explicit)
 * POST   /api/crm/stages/reorder   — { ids: string[] } → rescrie orderIndex după poziția din listă
 * PATCH  /api/crm/stages/:id       — rename/culoare/probabilitate/isWon/isLost — NU și `key`
 * DELETE /api/crm/stages/:id       — doar dacă nu are niciun lead pe ea și nu e o etapă implicită
 *
 * De ce `key` e imuabilă după creare: `leads.stage` (varchar) o referențiază direct — a permite
 * schimbarea ei ar rupe silențios orice lead care o poartă deja (ar „dispărea" din pâlnie, fără
 * nicio coloană care să-l mai arate). Redenumirea vizibilă trece prin `label`.
 *
 * De ce DELETE verifică lead-urile: o etapă ștearsă cu lead-uri pe ea le-ar orfaniza — le-ar
 * rămâne un `leads.stage` care nu mai corespunde niciunei coloane din pâlnie. Ștergerea unei
 * etape nu are voie NICIODATĂ să producă asta.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { crmPipelineStages, type NewCrmPipelineStage } from "../db/schema/crmPipelineStages";
import { leads } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { ensureTenantStages } from "../lib/crm/stages";
import { logCrmAudit } from "../lib/crm/audit";
import { ensureTenantPipeline, leadsInPipeline } from "../lib/crm/pipelines";
import { crmPipelines } from "../db/schema/crmPipelines";

export const crmStagesRoutes = new Hono<{ Variables: AuthVariables }>();
crmStagesRoutes.use("/*", requireAuth);
// Etapele sunt tot proces, nu conținut: o coloană ștearsă din greșeală mută leadurile altcuiva.
crmStagesRoutes.post("/*", requireCrmPermission("pipelines.manage"));
crmStagesRoutes.patch("/*", requireCrmPermission("pipelines.manage"));
crmStagesRoutes.delete("/*", requireCrmPermission("pipelines.manage"));

// ─── Derivarea cheii dintr-o etichetă ──────────────────────────────────────────

/**
 * „Ofertă trimisă" → "oferta_trimisa": minuscule, fără diacritice (NFD + strip marks acoperă
 * atât ă/â/î/ș/ț cât și formele lor legacy cu sedilă), orice secvență de caractere
 * non-alfanumerice devine un singur `_`, fără `_` la capete. Plafonată la 64 — lungimea coloanei
 * `key`. Fallback pe "etapa" dacă eticheta nu conține niciun caracter alfanumeric latin (ex. doar
 * emoji/punctuație) — o eventuală coliziune rezultată e oricum prinsă de verificarea de unicitate
 * de la creare (409 stage_key_taken).
 */
function slugifyLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return slug.length > 0 ? slug : "etapa";
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createStageSchema = z.object({
  /** Pâlnia în care intră etapa; absentă = implicita workspace-ului. */
  pipelineId: z.string().uuid().optional(),
  label: z.string().min(1, "Eticheta este obligatorie"),
  key: z.string().max(64).optional(),
  color: z.string().max(40).optional(),
  probabilityPct: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

const updateStageSchema = z.object({
  // `key` e acceptată aici DOAR ca s-o putem respinge explicit (400 stage_key_immutable) — vezi
  // handler-ul PATCH de mai jos. Nu e niciodată scrisă în bază.
  key: z.string().max(64).optional(),
  label: z.string().min(1).optional(),
  color: z.string().max(40).optional(),
  probabilityPct: z.number().int().min(0).max(100).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});


// ─── Rezolvarea pâlniei cerute ────────────────────────────────────────────────

/**
 * Pâlnia pe care operează cererea: `pipelineId` din query/body dacă aparține tenantului, altfel
 * implicita lui. Un id dintr-un alt workspace NU cade pe implicită în tăcere — întoarce `null`,
 * iar apelantul răspunde 404 (nu confirmăm existența unei pâlnii străine).
 */
async function resolvePipeline(
  tenantId: string,
  requestedId?: string | null
): Promise<{ id: string; isDefault: boolean } | null> {
  if (requestedId) {
    const [row] = await db
      .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
      .from(crmPipelines)
      .where(and(eq(crmPipelines.id, requestedId), eq(crmPipelines.tenantId, tenantId)));
    return row ?? null;
  }
  const def = await ensureTenantPipeline(tenantId);
  return def ? { id: def.id, isDefault: def.isDefault } : null;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

crmStagesRoutes.get("/", async (c) => {
  const user = c.get("user");

  const pipeline = await resolvePipeline(user.tenantId, c.req.query("pipelineId"));
  if (!pipeline) return c.json({ error: "not_found" }, 404);

  // Pâlnie nouă / migrarea 0162 nu a atins încă workspace-ul → primește cele 5 etape implicite
  // acum, nu rămâne un Kanban fără coloane.
  await ensureTenantStages(user.tenantId, pipeline.id);

  const items = await db
    .select()
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), eq(crmPipelineStages.pipelineId, pipeline.id)))
    .orderBy(asc(crmPipelineStages.orderIndex));

  return c.json({ items, pipelineId: pipeline.id });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmStagesRoutes.post("/", zValidator("json", createStageSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const key = (body.key?.trim() ? body.key.trim() : slugifyLabel(body.label)).slice(0, 64);

  const pipeline = await resolvePipeline(user.tenantId, body.pipelineId);
  if (!pipeline) return c.json({ error: "not_found" }, 404);

  // Etapa nouă intră la finalul ordinii curente A PÂLNIEI (nu a workspace-ului).
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${crmPipelineStages.orderIndex}), -1)::int` })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), eq(crmPipelineStages.pipelineId, pipeline.id)));

  const values: NewCrmPipelineStage = {
    tenantId: user.tenantId,
    pipelineId: pipeline.id,
    key,
    label: body.label,
    orderIndex: (maxOrder ?? -1) + 1,
  };
  if (body.color !== undefined) values.color = body.color;
  if (body.probabilityPct !== undefined) values.probabilityPct = body.probabilityPct;
  if (body.isWon !== undefined) values.isWon = body.isWon;
  if (body.isLost !== undefined) values.isLost = body.isLost;

  // onConflictDoNothing + .returning(): 0 rânduri întoarse = coliziune pe indexul unic
  // (tenant_id,pipeline_id,key) — fie cheia explicită era deja folosită ÎN PÂLNIE, fie eticheta
  // s-a derivat la o cheie deja existentă acolo. Evită o cursă (check-then-insert) între verificare și scriere.
  const [row] = await db.insert(crmPipelineStages).values(values).onConflictDoNothing().returning();
  if (!row) return c.json({ error: "stage_key_taken" }, 409);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "stage.created",
    target: "crm_stage",
    targetId: row.id,
    after: { key: row.key, label: row.label, pipelineId: row.pipelineId },
  });

  return c.json(row, 201);
});

// ─── POST /reorder ────────────────────────────────────────────────────────────

crmStagesRoutes.post("/reorder", zValidator("json", reorderSchema), async (c) => {
  const user = c.get("user");
  const { ids } = c.req.valid("json");

  // Orice id care nu aparține tenantului curent e ignorat — un payload manipulat nu poate
  // rescrie ordinea etapelor altui workspace.
  const owned = await db
    .select({ id: crmPipelineStages.id })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), inArray(crmPipelineStages.id, ids)));
  const ownedIds = new Set(owned.map((r) => r.id));
  const orderedOwnedIds = ids.filter((id) => ownedIds.has(id));

  // Etapele tenantului care NU apar în `ids` își păstrează orderIndex-ul curent — UI-ul trimite
  // de regulă lista completă, dar un subset nu e tratat ca eroare.
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedOwnedIds.length; i++) {
      await tx
        .update(crmPipelineStages)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(and(eq(crmPipelineStages.id, orderedOwnedIds[i]), eq(crmPipelineStages.tenantId, user.tenantId)));
    }
  });

  const items = await db
    .select()
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.tenantId, user.tenantId))
    .orderBy(asc(crmPipelineStages.orderIndex));

  return c.json({ items });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmStagesRoutes.patch("/:id", zValidator("json", updateStageSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // `key` e scrisă direct în `leads.stage` — a schimba cheia unei etape existente ar rupe
  // silențios orice lead care o poartă deja (n-ar mai găsi nicio coloană din pâlnie care să-l
  // arate). Redenumirea vizibilă se face din `label`; `key` rămâne stabilă din creare.
  if (body.key !== undefined) {
    return c.json({ error: "stage_key_immutable" }, 400);
  }

  const [existing] = await db
    .select({ id: crmPipelineStages.id })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.id, id), eq(crmPipelineStages.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const updates: Partial<NewCrmPipelineStage> = { updatedAt: new Date() };
  if (body.label !== undefined) updates.label = body.label;
  if (body.color !== undefined) updates.color = body.color;
  if (body.probabilityPct !== undefined) updates.probabilityPct = body.probabilityPct;
  if (body.isWon !== undefined) updates.isWon = body.isWon;
  if (body.isLost !== undefined) updates.isLost = body.isLost;

  const [row] = await db
    .update(crmPipelineStages)
    .set(updates)
    .where(and(eq(crmPipelineStages.id, id), eq(crmPipelineStages.tenantId, user.tenantId)))
    .returning();

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "stage.updated",
    target: "crm_stage",
    targetId: id,
    after: body,
  });

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmStagesRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({
      id: crmPipelineStages.id,
      key: crmPipelineStages.key,
      isDefault: crmPipelineStages.isDefault,
      pipelineId: crmPipelineStages.pipelineId,
    })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.id, id), eq(crmPipelineStages.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // O etapă implicită (seed) e ancora minimă a pâlniei — owner-ul o poate redenumi/recolora din
  // PATCH, dar n-o poate elimina din interfață (ar putea goli pâlnia unui tenant până la zero
  // coloane, prin ștergeri repetate).
  if (existing.isDefault) return c.json({ error: "stage_is_default" }, 400);

  // Ștergerea NU are voie să orfanizeze lead-uri: dacă etapa mai are vreunul, refuzăm. Ăsta e
  // singurul motiv pentru care DELETE există ca rută separată de PATCH, nu un simplu soft-delete.
  // Numărătoarea e pe PÂLNIA etapei, nu pe tot workspace-ul: de la migrarea 0166 aceeași cheie
  // („new") poate exista în două pâlnii, iar leadurile celeilalte n-au nicio treabă cu ștergerea
  // asta.
  const stagePipeline = existing.pipelineId
    ? await resolvePipeline(user.tenantId, existing.pipelineId)
    : await resolvePipeline(user.tenantId, null);
  const scope = stagePipeline
    ? and(
        eq(leads.tenantId, user.tenantId),
        eq(leads.stage, existing.key),
        leadsInPipeline(stagePipeline.id, stagePipeline.isDefault)
      )
    : and(eq(leads.tenantId, user.tenantId), eq(leads.stage, existing.key), isNull(leads.pipelineId));

  const [{ cnt }] = await db.select({ cnt: count() }).from(leads).where(scope);
  if (cnt > 0) {
    return c.json({ error: "stage_not_empty", leads: cnt }, 409);
  }

  await db
    .delete(crmPipelineStages)
    .where(and(eq(crmPipelineStages.id, id), eq(crmPipelineStages.tenantId, user.tenantId)));

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "stage.deleted",
    target: "crm_stage",
    targetId: id,
    before: { key: existing.key },
  });

  return c.json({ ok: true });
});
