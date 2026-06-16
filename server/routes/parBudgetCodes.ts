/**
 * PAR-003: Budget codes CRUD
 * GET/POST/PATCH/DELETE /api/par/budget-codes
 *
 * Feature 2 additions:
 *   GET    /api/par/budget-codes/:id/balance  → {allocatedCents, committedCents, spentCents, availableCents}
 *   POST   /api/par/budget-codes  — accepts allocatedCents
 *   PATCH  /api/par/budget-codes/:id — accepts allocatedCents
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, inArray, sum, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parBudgetCodes, parRequests } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parBudgetCodesRoutes = new Hono<{ Variables: AuthVariables }>();
parBudgetCodesRoutes.use("*", requireAuth);

const codeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
  allocatedCents: z.number().int().min(0).optional(),
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

/**
 * GET /:id/balance — budget availability for a single code.
 *
 * committedCents = sum of totalEstimatedCents for PARs whose status is one of:
 *   pending_approval | approved | in_finance | reapproval_required | changes_requested
 * spentCents = sum of totalEstimatedCents for PARs with status=paid
 * availableCents = allocatedCents - committedCents - spentCents
 *
 * NOTE: we use totalEstimatedCents from par_requests for both committed and spent
 * (not actualAmountCents from par_payments) so the balance is computable without
 * a join to par_payments and is consistent with what the create form shows.
 */
// VF-202: statuses counted as "committed" (in-flight, not yet paid).
const COMMITTED_STATUSES_LIST = [
  "pending_approval",
  "approved",
  "in_finance",
  "reapproval_required",
  "changes_requested",
] as const;

/**
 * VF-202: GET /usage — budget usage for ALL codes in one call (avoids N balance requests).
 * Per code: allocated, committed (in-flight), paid, available, usedPct. approver/finance/par_admin.
 */
parBudgetCodesRoutes.get("/usage", requirePARRole("par_admin", "finance", "approver"), async (c) => {
  const tenantId = c.get("user").tenantId;

  const codes = await db
    .select()
    .from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.active, true)))
    .orderBy(asc(parBudgetCodes.code));

  const committedRows = await db
    .select({
      budgetCodeId: parRequests.budgetCodeId,
      total: sql<number>`coalesce(sum(${parRequests.totalEstimatedCents}), 0)`,
    })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.status, [...COMMITTED_STATUSES_LIST])))
    .groupBy(parRequests.budgetCodeId);

  const paidRows = await db
    .select({
      budgetCodeId: parRequests.budgetCodeId,
      total: sql<number>`coalesce(sum(${parRequests.totalEstimatedCents}), 0)`,
    })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "paid")))
    .groupBy(parRequests.budgetCodeId);

  const committedBy = new Map<string, number>();
  for (const r of committedRows) if (r.budgetCodeId) committedBy.set(r.budgetCodeId, Number(r.total ?? 0));
  const paidBy = new Map<string, number>();
  for (const r of paidRows) if (r.budgetCodeId) paidBy.set(r.budgetCodeId, Number(r.total ?? 0));

  const usage = codes.map((code) => {
    const allocatedCents = code.allocatedCents ?? 0;
    const committedCents = committedBy.get(code.id) ?? 0;
    const paidCents = paidBy.get(code.id) ?? 0;
    const usedCents = committedCents + paidCents;
    return {
      id: code.id,
      code: code.code,
      name: code.name,
      allocatedCents,
      committedCents,
      paidCents,
      availableCents: allocatedCents - usedCents,
      usedCents,
      usedPct: allocatedCents > 0 ? Math.round((usedCents / allocatedCents) * 100) : null,
    };
  });

  return c.json({ usage });
});

parBudgetCodesRoutes.get("/:id/balance", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const [code] = await db
    .select()
    .from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)));
  if (!code) return c.json({ error: "not_found" }, 404);

  const COMMITTED_STATUSES = [
    "pending_approval",
    "approved",
    "in_finance",
    "reapproval_required",
    "changes_requested",
  ] as const;

  // Committed: sum of estimated amounts for in-flight PARs
  const committedRows = await db
    .select({ total: sql<number>`coalesce(sum(${parRequests.totalEstimatedCents}), 0)` })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.budgetCodeId, id),
        inArray(parRequests.status, [...COMMITTED_STATUSES])
      )
    );
  const committedCents =
    typeof committedRows[0]?.total === "number"
      ? committedRows[0].total
      : Number(committedRows[0]?.total ?? 0);

  // Spent: sum of estimated amounts for paid PARs
  const spentRows = await db
    .select({ total: sql<number>`coalesce(sum(${parRequests.totalEstimatedCents}), 0)` })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.budgetCodeId, id),
        eq(parRequests.status, "paid")
      )
    );
  const spentCents =
    typeof spentRows[0]?.total === "number"
      ? spentRows[0].total
      : Number(spentRows[0]?.total ?? 0);

  const allocatedCents = code.allocatedCents ?? 0;
  const availableCents = allocatedCents - committedCents - spentCents;

  return c.json({ allocatedCents, committedCents, spentCents, availableCents });
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
      .values({
        tenantId,
        code: body.code,
        name: body.name,
        active: body.active ?? true,
        allocatedCents: body.allocatedCents ?? 0,
      })
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
