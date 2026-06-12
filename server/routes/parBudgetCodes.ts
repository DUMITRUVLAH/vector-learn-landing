/**
 * PAR-003: Budget codes CRUD
 * GET/POST/PATCH/DELETE /api/par/budget-codes
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parBudgetCodes } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parBudgetCodesRoutes = new Hono<{ Variables: AuthVariables }>();
parBudgetCodesRoutes.use("*", requireAuth);

const codeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
});

/** GET — list all active budget codes */
parBudgetCodesRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.active, true)))
    .orderBy(asc(parBudgetCodes.code));
  return c.json({ budgetCodes: rows });
});

/** POST — create */
parBudgetCodesRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", codeSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");
    const [row] = await db
      .insert(parBudgetCodes)
      .values({ tenantId, ...body })
      .returning();
    return c.json(row, 201);
  }
);

/** PATCH /:id */
parBudgetCodesRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", codeSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(parBudgetCodes)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

/** DELETE /:id — soft delete */
parBudgetCodesRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(parBudgetCodes)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
