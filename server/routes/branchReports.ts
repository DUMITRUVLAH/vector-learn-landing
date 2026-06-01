/**
 * BRANCH-704 — Branch KPI Reports API
 *
 * GET /api/branches/reports/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns consolidated (whole network) + per-branch KPIs:
 *   - activeStudents: COUNT students WHERE status='active' AND branch_id=X
 *   - monthlyRevenue: SUM payments.amount WHERE paid_at BETWEEN from AND to (via student's branch)
 *   - retentionRate: approximated as active students at end / max(active, 1) * 100
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { branches, students, payments } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { withBranchFilter } from "../middleware/branchScope";

export const branchReportsRoutes = new Hono<{ Variables: AuthVariables }>();

branchReportsRoutes.use("*", requireAuth);

const kpiQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
    .optional(),
});

interface BranchKPI {
  branchId: string;
  branchName: string;
  activeStudents: number;
  monthlyRevenue: number;
  retentionRate: number;
}

// ─── GET /api/branches/reports/kpi ───────────────────────────────────────────
branchReportsRoutes.get(
  "/kpi",
  zValidator("query", kpiQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { from, to } = c.req.valid("query");

    const fromDate = from ? new Date(`${from}T00:00:00Z`) : new Date(Date.now() - 30 * 86400_000);
    const toDate = to ? new Date(`${to}T23:59:59Z`) : new Date();

    // ── 1. List branches available to this user ─────────────────────────────
    const branchConditions = [eq(branches.tenantId, tenantId)];
    // If user has branchScope, only show their branch
    if (user.branchScope) {
      branchConditions.push(eq(branches.id, user.branchScope));
    }

    const branchRows = await db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(and(...branchConditions))
      .orderBy(branches.createdAt);

    if (branchRows.length === 0) {
      return c.json({
        consolidated: { activeStudents: 0, monthlyRevenue: 0, retentionRate: 0 },
        byBranch: [],
      });
    }

    // ── 2. Active students per branch ───────────────────────────────────────
    const studentCounts = await db
      .select({
        branchId: students.branchId,
        cnt: count(students.id),
      })
      .from(students)
      .where(
        and(
          eq(students.tenantId, tenantId),
          eq(students.status, "active")
        )
      )
      .groupBy(students.branchId);

    const activeByBranch = new Map<string | null, number>();
    for (const row of studentCounts) {
      activeByBranch.set(row.branchId ?? null, Number(row.cnt));
    }

    // ── 3. Revenue per branch in time window ────────────────────────────────
    // Join payments → students to get branch affiliation
    const revenueRows = await db
      .select({
        branchId: students.branchId,
        totalCents: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .innerJoin(students, eq(payments.studentId, students.id))
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "paid"),
          gte(payments.paidAt, fromDate),
          lt(payments.paidAt, toDate)
        )
      )
      .groupBy(students.branchId);

    const revenueByBranch = new Map<string | null, number>();
    for (const row of revenueRows) {
      revenueByBranch.set(row.branchId ?? null, Number(row.totalCents));
    }

    // ── 4. Build per-branch KPIs ────────────────────────────────────────────
    const byBranch: BranchKPI[] = branchRows.map((b) => {
      const activeStudents = activeByBranch.get(b.id) ?? 0;
      const monthlyRevenueCents = revenueByBranch.get(b.id) ?? 0;
      const monthlyRevenue = Math.round(monthlyRevenueCents / 100); // cents → units

      // Simple retention approximation: active / (active + 1) * 100 (no churn data yet)
      // A full retention calc needs historical enrollment; this is a placeholder.
      const retentionRate =
        activeStudents > 0 ? Math.min(100, Math.round((activeStudents / (activeStudents + 1)) * 100)) : 0;

      return {
        branchId: b.id,
        branchName: b.name,
        activeStudents,
        monthlyRevenue,
        retentionRate,
      };
    });

    // ── 5. Consolidated totals ──────────────────────────────────────────────
    const consolidated = {
      activeStudents: byBranch.reduce((s, b) => s + b.activeStudents, 0),
      monthlyRevenue: byBranch.reduce((s, b) => s + b.monthlyRevenue, 0),
      retentionRate:
        byBranch.length > 0
          ? Math.round(byBranch.reduce((s, b) => s + b.retentionRate, 0) / byBranch.length)
          : 0,
    };

    return c.json({ consolidated, byBranch });
  }
);
