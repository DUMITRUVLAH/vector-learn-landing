/**
 * PAR-002: DOA matrix CRUD routes
 * GET/POST/PATCH/DELETE /api/par/doa — par_admin only
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parDoaMatrix } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parDoaRoutes = new Hono<{ Variables: AuthVariables }>();

parDoaRoutes.use("*", requireAuth);

const doaRowSchema = z.object({
  chargeTo: z.enum(["operations", "program", "other"]).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  minAmountCents: z.number().int().min(0),
  maxAmountCents: z.number().int().positive().nullable().optional(),
  step: z.number().int().min(1),
  approverRoleLabel: z.string().min(1).max(200),
  approverUserId: z.string().uuid().nullable().optional(),
  approverParRole: z.enum(["requestor", "approver", "finance", "par_admin"]).nullable().optional(),
  active: z.boolean().optional(),
});

/** GET /api/par/doa — list all active DOA matrix rows */
parDoaRoutes.get("/", requirePARRole("par_admin", "approver", "finance"), async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select()
    .from(parDoaMatrix)
    .where(eq(parDoaMatrix.tenantId, tenantId))
    .orderBy(asc(parDoaMatrix.minAmountCents), asc(parDoaMatrix.step));

  return c.json({ rows });
});

/** POST /api/par/doa — create a DOA row */
parDoaRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", doaRowSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const [row] = await db
      .insert(parDoaMatrix)
      .values({
        tenantId,
        chargeTo: body.chargeTo ?? null,
        departmentId: body.departmentId ?? null,
        minAmountCents: body.minAmountCents,
        maxAmountCents: body.maxAmountCents ?? null,
        step: body.step,
        approverRoleLabel: body.approverRoleLabel,
        approverUserId: body.approverUserId ?? null,
        approverParRole: body.approverParRole ?? null,
        active: body.active ?? true,
      })
      .returning();

    return c.json(row, 201);
  }
);

/** PATCH /api/par/doa/:id — update a DOA row */
parDoaRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", doaRowSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [row] = await db
      .update(parDoaMatrix)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)))
      .returning();

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

/** DELETE /api/par/doa/:id — deactivate (soft delete) */
parDoaRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const [row] = await db
    .update(parDoaMatrix)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
