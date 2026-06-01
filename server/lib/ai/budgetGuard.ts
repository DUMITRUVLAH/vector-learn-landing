/**
 * AI-A04 — Budget Guard
 *
 * Checks whether a tenant has exceeded their monthly AI cost budget.
 * Cost is summed from ai_audit_log for the current calendar month.
 * Budget is stored in tenants.ai_monthly_budget_usd_cents (null = unlimited).
 *
 * Cost unit conversions:
 *   ai_audit_log.cost_usd_micro  = micro-USD  (1_000_000 micro = $1)
 *   tenants.ai_monthly_budget_usd_cents = cents (100 cents = $1)
 *   => 1 cent = 10_000 micro-USD
 */
import { db } from "../../db/client";
import { aiAuditLog, tenants } from "../../db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

/** Returns false if the tenant has exceeded their monthly budget, true otherwise (including when unlimited). */
export async function checkBudget(tenantId: string): Promise<boolean> {
  // Fetch budget limit
  const [tenantRow] = await db
    .select({ budgetCents: tenants.aiMonthlyBudgetUsdCents })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenantRow) return true; // Tenant not found — allow (fail open for budget; auth handles security)
  if (tenantRow.budgetCents === null || tenantRow.budgetCents === undefined) return true; // Unlimited

  // Sum cost_usd_micro for current calendar month
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [costRow] = await db
    .select({ totalMicro: sql<number>`coalesce(sum(${aiAuditLog.costUsdMicro}), 0)::int` })
    .from(aiAuditLog)
    .where(
      and(
        eq(aiAuditLog.tenantId, tenantId),
        gte(aiAuditLog.createdAt, startOfMonth)
      )
    );

  const totalMicro = costRow?.totalMicro ?? 0;
  // Convert budget cents → micro-USD for comparison: 1 cent = 10_000 micro
  const budgetMicro = (tenantRow.budgetCents ?? 0) * 10_000;

  return totalMicro < budgetMicro;
}

/** Returns the current month's usage stats for a tenant. */
export async function getMonthlyUsage(tenantId: string): Promise<{
  currentMonthCostUsdCents: number;
  callCount: number;
  totalTokens: number;
}> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      totalMicro: sql<number>`coalesce(sum(${aiAuditLog.costUsdMicro}), 0)::int`,
      callCount: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiAuditLog.promptTokens} + ${aiAuditLog.completionTokens}), 0)::int`,
    })
    .from(aiAuditLog)
    .where(
      and(
        eq(aiAuditLog.tenantId, tenantId),
        gte(aiAuditLog.createdAt, startOfMonth)
      )
    );

  const totalMicro = row?.totalMicro ?? 0;
  // micro-USD → cents: divide by 10_000
  const currentMonthCostUsdCents = Math.round(totalMicro / 10_000);

  return {
    currentMonthCostUsdCents,
    callCount: row?.callCount ?? 0,
    totalTokens: row?.totalTokens ?? 0,
  };
}
