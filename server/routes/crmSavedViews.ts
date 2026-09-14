/**
 * CRM Faza 9 — vizualizări salvate (filtre cu nume).
 *
 * Montat la /api/crm/saved-views.
 *
 * GET    /api/crm/saved-views       — ale mele + cele partajate de echipă
 * POST   /api/crm/saved-views       — salvează filtrele curente
 * PATCH  /api/crm/saved-views/:id   — redenumire / partajare
 * DELETE /api/crm/saved-views/:id   — doar autorul (sau un admin de workspace)
 *
 * Regula de vizibilitate e singura abatere de la crm-vector, unde totul era global fiindcă baza
 * avea un singur utilizator: aici o vizualizare e PERSONALĂ până când autorul o partajează.
 * „Leadurile mele restante" înseamnă altceva pentru fiecare om din echipă.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { crmSavedViews, type NewCrmSavedView } from "../db/schema/crmSavedViews";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const crmSavedViewsRoutes = new Hono<{ Variables: AuthVariables }>();
crmSavedViewsRoutes.use("/*", requireAuth);

/** Rolurile de workspace care pot face curat în vizualizările partajate ale altora. */
const ADMIN_ROLES = ["admin", "manager", "owner"];

const filtersSchema = z.object({
  search: z.string().max(200).optional(),
  source: z.string().max(40).optional(),
  stage: z.string().max(64).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  onlyMine: z.boolean().optional(),
  pipelineId: z.string().uuid().optional().nullable(),
  view: z.enum(["kanban", "list"]).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Numele vizualizării este obligatoriu").max(200),
  filters: filtersSchema,
  isShared: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  filters: filtersSchema.optional(),
  isShared: z.boolean().optional(),
});

// ─── GET / ────────────────────────────────────────────────────────────────────

crmSavedViewsRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmSavedViews)
      .where(
        and(
          eq(crmSavedViews.tenantId, user.tenantId),
          or(eq(crmSavedViews.createdByUserId, user.id), eq(crmSavedViews.isShared, true))
        )
      )
      .orderBy(asc(crmSavedViews.name));
    return c.json({ items });
  } catch (e) {
    // Schema în urma codului: dropdown gol, nu 500 — filtrarea manuală merge mai departe.
    console.error("[crm/saved-views] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmSavedViewsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const values: NewCrmSavedView = {
    tenantId: user.tenantId,
    name: body.name,
    filters: body.filters,
    createdByUserId: user.id,
    isShared: body.isShared ?? false,
  };

  const [row] = await db.insert(crmSavedViews).values(values).returning();
  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmSavedViewsRoutes.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmSavedViews.id, createdByUserId: crmSavedViews.createdByUserId })
    .from(crmSavedViews)
    .where(and(eq(crmSavedViews.id, id), eq(crmSavedViews.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Partajată nu înseamnă a tuturor: o vizualizare a echipei se poate FOLOSI de oricine, dar se
  // modifică doar de autor (sau de un admin de workspace, pentru curățenie).
  if (existing.createdByUserId !== user.id && !ADMIN_ROLES.includes(user.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const updates: Partial<NewCrmSavedView> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.filters !== undefined) updates.filters = body.filters;
  if (body.isShared !== undefined) updates.isShared = body.isShared;

  const [row] = await db
    .update(crmSavedViews)
    .set(updates)
    .where(and(eq(crmSavedViews.id, id), eq(crmSavedViews.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmSavedViewsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmSavedViews.id, createdByUserId: crmSavedViews.createdByUserId })
    .from(crmSavedViews)
    .where(and(eq(crmSavedViews.id, id), eq(crmSavedViews.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (existing.createdByUserId !== user.id && !ADMIN_ROLES.includes(user.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  await db.delete(crmSavedViews).where(and(eq(crmSavedViews.id, id), eq(crmSavedViews.tenantId, user.tenantId)));
  return c.json({ ok: true });
});
