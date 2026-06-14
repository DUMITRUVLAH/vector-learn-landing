/**
 * MULTICURRENCY-002: FX revaluation API routes
 * Mounted in server/app.ts: app.route("/api/fin/revaluation", finRevaluationRoutes)
 *
 * Routes:
 *   POST /api/fin/revaluation                  → trigger month revaluation
 *   GET  /api/fin/revaluation?limit=10          → list recent revaluations
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finLedgerEntries } from "../db/schema/finLedger";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { revaluateMonth } from "../lib/fin/revaluation";

export const finRevaluationRoutes = new Hono<{ Variables: AuthVariables }>();
finRevaluationRoutes.use("*", requireAuth);

// ─── POST /api/fin/revaluation ────────────────────────────────────────────────
const revaluateSchema = z.object({
  period_month: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "period_month must be YYYY-MM-DD (first of month)"),
});

finRevaluationRoutes.post(
  "/",
  zValidator("json", revaluateSchema),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const userId = c.get("userId") as string;
    const { period_month } = c.req.valid("json");

    const periodDate = new Date(period_month);
    if (isNaN(periodDate.getTime())) {
      return c.json({ error: "invalid_date" }, 400);
    }

    const result = await revaluateMonth(tenantId, periodDate, userId);

    return c.json(result, 200);
  }
);

// ─── GET /api/fin/revaluation?limit=10 ───────────────────────────────────────
finRevaluationRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const limitParam = c.req.query("limit");
  const limit = Math.min(parseInt(limitParam ?? "10", 10) || 10, 100);

  // Aggregate by period_month: sum gain/loss, count entries
  const rows = await db
    .select({
      period_month: finLedgerEntries.periodMonth,
      total_fx_cents: sql<number>`SUM(${finLedgerEntries.fxGainLossCents})`,
      entries_count: sql<number>`COUNT(*)`,
      posted_at: sql<string>`MAX(${finLedgerEntries.postedAt})`,
    })
    .from(finLedgerEntries)
    .where(
      and(
        eq(finLedgerEntries.tenantId, tenantId),
        eq(finLedgerEntries.entryType, "fx_revaluation")
      )
    )
    .groupBy(finLedgerEntries.periodMonth)
    .orderBy(desc(finLedgerEntries.periodMonth))
    .limit(limit);

  return c.json(
    rows.map((r) => ({
      period_month: r.period_month,
      total_fx_gain_loss_mdl_cents: Number(r.total_fx_cents),
      entries_count: Number(r.entries_count),
      posted_at: r.posted_at,
    }))
  );
});
