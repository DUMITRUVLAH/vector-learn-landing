/**
 * CRM Faza 9 — Pâlnii multiple per workspace.
 *
 * Montat la /api/crm/pipelines (app.ts: app.route("/api/crm/pipelines", crmPipelinesRoutes))
 *
 * GET    /api/crm/pipelines       — pâlniile workspace-ului (seed automat al implicitei)
 * POST   /api/crm/pipelines       — pâlnie nouă + cele 5 etape implicite ale ei
 * PATCH  /api/crm/pipelines/:id   — redenumire
 * DELETE /api/crm/pipelines/:id   — doar dacă nu e implicita și nu mai are leaduri
 *
 * De ce o pâlnie nouă primește etape la creare: fără ele Kanbanul ei ar fi un ecran gol, fără
 * nicio coloană în care să tragi un lead — adică o funcție ruptă din prima secundă.
 *
 * De ce DELETE refuză o pâlnie cu leaduri: ștergerea ar duce, în cascadă, la dispariția etapelor
 * ei, iar leadurile ar rămâne cu un `stage` fără nicio coloană care să-l arate. Leadurile se mută
 * întâi (PATCH /api/crm/leads/:id/pipeline), abia apoi pâlnia se poate șterge.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../db/client";
import { crmPipelines, type NewCrmPipeline } from "../db/schema/crmPipelines";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { leads } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { ensureTenantPipeline, nextPipelineOrderIndex } from "../lib/crm/pipelines";
import { logCrmAudit } from "../lib/crm/audit";
import { ensureTenantStages } from "../lib/crm/stages";

export const crmPipelinesRoutes = new Hono<{ Variables: AuthVariables }>();
crmPipelinesRoutes.use("/*", requireAuth);
// Pâlniile sunt procesul comercial al firmei: le vede toată lumea, le schimbă administratorii.
crmPipelinesRoutes.post("/*", requireCrmPermission("pipelines.manage"));
crmPipelinesRoutes.patch("/*", requireCrmPermission("pipelines.manage"));
crmPipelinesRoutes.delete("/*", requireCrmPermission("pipelines.manage"));

const createPipelineSchema = z.object({
  name: z.string().trim().min(1, "Numele pâlniei este obligatoriu").max(200),
});

const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

// ─── GET / ────────────────────────────────────────────────────────────────────

crmPipelinesRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Workspace nou (sau migrarea 0166 neajunsă încă acolo) → primește implicita acum, ca ecranul
  // să nu rămână fără nicio pâlnie de selectat.
  await ensureTenantPipeline(user.tenantId);

  try {
    const items = await db
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, user.tenantId))
      .orderBy(asc(crmPipelines.orderIndex), asc(crmPipelines.createdAt));
    return c.json({ items });
  } catch (e) {
    // Schema în urma codului: listă goală, nu 500 — UI-ul cade pe pâlnia implicită virtuală.
    console.error("[crm/pipelines] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmPipelinesRoutes.post("/", zValidator("json", createPipelineSchema), async (c) => {
  const user = c.get("user");
  const { name } = c.req.valid("json");

  // Implicita trebuie să existe înaintea oricărei pâlnii noi: fără ea, leadurile fără
  // `pipeline_id` n-ar mai avea unde fi citite.
  await ensureTenantPipeline(user.tenantId);

  const values: NewCrmPipeline = {
    tenantId: user.tenantId,
    name,
    orderIndex: await nextPipelineOrderIndex(user.tenantId),
    isDefault: false,
  };

  const [row] = await db.insert(crmPipelines).values(values).returning();

  // Etapele pâlniei noi. Dacă seed-ul eșuează, ștergem pâlnia: mai bine o eroare curată decât o
  // pâlnie fără nicio coloană, în care nu se poate lucra (același raționament ca în crm-vector).
  await ensureTenantStages(user.tenantId, row.id);
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), eq(crmPipelineStages.pipelineId, row.id)));
  if (cnt === 0) {
    await db.delete(crmPipelines).where(and(eq(crmPipelines.id, row.id), eq(crmPipelines.tenantId, user.tenantId)));
    return c.json({ error: "pipeline_stages_seed_failed" }, 500);
  }

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "pipeline.created",
    target: "crm_pipeline",
    targetId: row.id,
    after: { name: row.name },
  });

  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmPipelinesRoutes.patch("/:id", zValidator("json", updatePipelineSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { name } = c.req.valid("json");

  const [row] = await db
    .update(crmPipelines)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(crmPipelines.id, id), eq(crmPipelines.tenantId, user.tenantId)))
    .returning();

  // Cross-tenant → 404, nu 403: nu confirmăm existența unei pâlnii din alt workspace.
  if (!row) return c.json({ error: "not_found" }, 404);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "pipeline.renamed",
    target: "crm_pipeline",
    targetId: id,
    after: { name },
  });

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmPipelinesRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, id), eq(crmPipelines.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (existing.isDefault) return c.json({ error: "pipeline_is_default" }, 400);

  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(leads)
    .where(and(eq(leads.tenantId, user.tenantId), eq(leads.pipelineId, id)));
  if (cnt > 0) return c.json({ error: "pipeline_not_empty", leads: cnt }, 409);

  await db.delete(crmPipelines).where(and(eq(crmPipelines.id, id), eq(crmPipelines.tenantId, user.tenantId)));

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "pipeline.deleted",
    target: "crm_pipeline",
    targetId: id,
  });

  return c.json({ ok: true });
});
