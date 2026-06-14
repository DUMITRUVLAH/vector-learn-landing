/**
 * TRUST-002: FinDesk AI Audit Log routes (FIN-CORE §1.16)
 *
 * Routes:
 *   GET  /api/fin/ai-audit          — paginated list of ai_audit_log entries for tenant
 *   POST /api/fin/ai-audit/purge    — delete rows older than ai_log_retention_days (admin/manager)
 *
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - Purge reads ai_log_retention_days from fin_data_settings (upsert defaults if missing).
 * - FIN-CORE §1.16: GDPR right to data minimisation / storage limitation.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gte, lte, lt, count } from "drizzle-orm";
import { db } from "../db/client";
import { aiAuditLog } from "../db/schema/aiAuditLog";
import { finDataSettings, FIN_DATA_SETTINGS_DEFAULTS } from "../db/schema/finDataSettings";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finAiAuditRoutes = new Hono<{ Variables: AuthVariables }>();

finAiAuditRoutes.use("*", requireAuth);

// ─── Helper: upsert fin_data_settings defaults ────────────────────────────────

async function getRetentionDays(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ aiLogRetentionDays: finDataSettings.aiLogRetentionDays })
    .from(finDataSettings)
    .where(eq(finDataSettings.tenantId, tenantId))
    .limit(1);

  if (row) return row.aiLogRetentionDays;

  // Upsert defaults if no row exists yet
  await db
    .insert(finDataSettings)
    .values({ tenantId, ...FIN_DATA_SETTINGS_DEFAULTS })
    .onConflictDoNothing();

  return FIN_DATA_SETTINGS_DEFAULTS.aiLogRetentionDays;
}

// ─── GET /api/fin/ai-audit ────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().optional(),
  from: z.string().optional(), // ISO date
  to: z.string().optional(),   // ISO date
});

finAiAuditRoutes.get(
  "/",
  zValidator("query", listQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { page, limit, action, from, to } = c.req.valid("query");

    const offset = (page - 1) * limit;

    // Build filters
    const filters: ReturnType<typeof eq>[] = [
      eq(aiAuditLog.tenantId, tenantId),
    ];
    if (action) {
      filters.push(eq(aiAuditLog.action, action));
    }
    if (from) {
      filters.push(gte(aiAuditLog.createdAt, new Date(from)));
    }
    if (to) {
      // Include the whole "to" day
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      filters.push(lt(aiAuditLog.createdAt, toDate));
    }

    const where = filters.length === 1 ? filters[0] : and(...filters);

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(aiAuditLog)
        .where(where)
        .orderBy(aiAuditLog.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(aiAuditLog)
        .where(where),
    ]);

    return c.json({ data, total: Number(total), page }, 200);
  }
);

// ─── POST /api/fin/ai-audit/purge ─────────────────────────────────────────────

finAiAuditRoutes.post("/purge", async (c) => {
  const user = c.get("user");

  // Only admin or manager may run purge
  if (user.role !== "admin" && user.role !== "manager") {
    return c.json({ error: "forbidden: admin or manager role required" }, 403);
  }

  const tenantId = user.tenantId;
  const retentionDays = await getRetentionDays(tenantId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const deleted = await db
    .delete(aiAuditLog)
    .where(
      and(
        eq(aiAuditLog.tenantId, tenantId),
        lt(aiAuditLog.createdAt, cutoff)
      )
    )
    .returning({ id: aiAuditLog.id });

  return c.json({ deleted: deleted.length }, 200);
});
