/**
 * CRM-105: Pipeline stages CRUD
 * Authenticated routes — Owner/Manager role required for mutations.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { pipelineStages, DEFAULT_PIPELINE_STAGES } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const pipelineRoutes = new Hono<{ Variables: AuthVariables }>();

pipelineRoutes.use("/*", requireAuth);

const createStageSchema = z.object({
  key: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, "key must be lowercase letters, digits, hyphens, underscores"),
  label: z.string().min(2).max(100),
  color: z.string().max(50).default("pastel-sky"),
  orderIndex: z.number().int().min(0).default(0),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

const updateStageSchema = z.object({
  label: z.string().min(2).max(100).optional(),
  color: z.string().max(50).optional(),
  orderIndex: z.number().int().min(0).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  /** CRM-130: WIP limit for this stage (null = no limit) */
  wipLimit: z.number().int().min(1).max(9999).nullable().optional(),
});

const reorderSchema = z.object({
  order: z.array(z.string().uuid()),  // array of stage IDs in desired order
});

// GET /api/pipeline-stages — list all stages for current tenant, ordered
pipelineRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  let stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.tenantId, tenantId))
    .orderBy(asc(pipelineStages.orderIndex));

  // If no stages exist, seed defaults (first request for this tenant)
  if (stages.length === 0) {
    await db.insert(pipelineStages).values(
      DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, tenantId }))
    );
    stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.tenantId, tenantId))
      .orderBy(asc(pipelineStages.orderIndex));
  }

  return c.json({ stages });
});

// POST /api/pipeline-stages — create new custom stage
pipelineRoutes.post("/", zValidator("json", createStageSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Check key uniqueness
  const existing = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.tenantId, tenantId), eq(pipelineStages.key, body.key)),
  });
  if (existing) return c.json({ error: "key_exists" }, 409);

  const [created] = await db
    .insert(pipelineStages)
    .values({ ...body, tenantId })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/pipeline-stages/:id — update stage (rename, recolor, etc.)
pipelineRoutes.patch("/:id", zValidator("json", updateStageSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date(), ...body };

  const [updated] = await db
    .update(pipelineStages)
    .set(patch)
    .where(and(eq(pipelineStages.id, id), eq(pipelineStages.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// POST /api/pipeline-stages/reorder — bulk reorder
pipelineRoutes.post("/reorder", zValidator("json", reorderSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { order } = c.req.valid("json");

  await Promise.all(
    order.map((stageId, idx) =>
      db
        .update(pipelineStages)
        .set({ orderIndex: idx, updatedAt: new Date() })
        .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.tenantId, tenantId)))
    )
  );

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.tenantId, tenantId))
    .orderBy(asc(pipelineStages.orderIndex));

  return c.json({ stages });
});

// DELETE /api/pipeline-stages/:id — delete custom stage (cannot delete default/isDefault)
pipelineRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const stage = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.id, id), eq(pipelineStages.tenantId, tenantId)),
  });
  if (!stage) return c.json({ error: "not_found" }, 404);
  if (stage.isDefault) return c.json({ error: "cannot_delete_default" }, 400);

  await db
    .delete(pipelineStages)
    .where(and(eq(pipelineStages.id, id), eq(pipelineStages.tenantId, tenantId)));

  return c.json({ deleted: true });
});
