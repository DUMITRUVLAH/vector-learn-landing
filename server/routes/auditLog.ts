/**
 * HR-404: Audit log API — list entries + CSV export
 */
import { Hono } from "hono";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const auditLogRoutes = new Hono<{ Variables: AuthVariables }>();

auditLogRoutes.use("/*", requireAuth);

// ─── GET /api/hr/audit-log ────────────────────────────────────────────────────

auditLogRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const actionType = c.req.query("action_type");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Number(limitParam ?? 100), 500);

  const conditions = [eq(auditLog.tenantId, tenantId)];
  if (actionType) conditions.push(ilike(auditLog.actionType, `%${actionType}%`));

  const rows = await db
    .select({
      id: auditLog.id,
      actionType: auditLog.actionType,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      oldValue: auditLog.oldValue,
      newValue: auditLog.newValue,
      ipAddress: auditLog.ipAddress,
      occurredAt: auditLog.occurredAt,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.occurredAt))
    .limit(limit);

  return c.json({ items: rows });
});

// ─── GET /api/hr/audit-log/export ────────────────────────────────────────────

auditLogRoutes.get("/export", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      id: auditLog.id,
      actionType: auditLog.actionType,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      occurredAt: auditLog.occurredAt,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.occurredAt))
    .limit(5000);

  function csvField(val: unknown): string {
    const s = val == null ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const headers = ["id", "action_type", "target_type", "target_id", "actor_name", "occurred_at"];
  const lines = rows.map((r) =>
    [r.id, r.actionType, r.targetType, r.targetId ?? "", r.actorName ?? "system", r.occurredAt.toISOString()]
      .map(csvField)
      .join(",")
  );
  const csv = [headers.join(","), ...lines].join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="audit-log-${today}.csv"`);
  return c.body(csv);
});
