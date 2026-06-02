/**
 * SET-804: Aggregated audit log settings endpoint.
 *
 * GET /api/settings/audit-log — aggregates audit_log (HR-404) and crm_audit_log (CRM-127).
 * Admin/owner only.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, gte, lte, like, desc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog } from "../db/schema/auditLog";
import { crmAuditLog } from "../db/schema/audit";
import { users } from "../db/schema/users";
import { requireAuth, getAuthUser } from "../middleware/requireAuth";

export const auditLogSettingsRoutes = new Hono();

const querySchema = z.object({
  actorId: z.string().uuid().optional(),
  actionType: z.string().max(64).optional(),
  from: z.string().optional(), // ISO date
  to: z.string().optional(), // ISO date
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── GET /api/settings/audit-log ─────────────────────────────────────────────

auditLogSettingsRoutes.get(
  "/",
  requireAuth,
  zValidator("query", querySchema),
  async (c) => {
    const user = getAuthUser(c as never);

    // Admin/owner only
    if (user.role !== "admin" && user.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    const { actorId, actionType, from, to, limit, offset } = c.req.valid("query");
    const tenantId = user.tenantId;

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    // ─ Query audit_log (HR) ─────────────────────────────────────────────────

    const hrConditions = [eq(auditLog.tenantId, tenantId)];
    if (actorId) hrConditions.push(eq(auditLog.actorId, actorId));
    if (actionType) {
      hrConditions.push(like(auditLog.actionType, `%${actionType}%`));
    }
    if (fromDate) hrConditions.push(gte(auditLog.occurredAt, fromDate));
    if (toDate) hrConditions.push(lte(auditLog.occurredAt, toDate));

    const hrRows = await db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actionType: auditLog.actionType,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        createdAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .where(and(...hrConditions))
      .orderBy(desc(auditLog.occurredAt));

    // ─ Query crm_audit_log ──────────────────────────────────────────────────

    const crmConditions = [eq(crmAuditLog.tenantId, tenantId)];
    if (actorId) crmConditions.push(eq(crmAuditLog.actorId, actorId));
    if (actionType) {
      crmConditions.push(like(crmAuditLog.action, `%${actionType}%`));
    }
    if (fromDate) crmConditions.push(gte(crmAuditLog.createdAt, fromDate));
    if (toDate) crmConditions.push(lte(crmAuditLog.createdAt, toDate));

    const crmRows = await db
      .select({
        id: crmAuditLog.id,
        actorId: crmAuditLog.actorId,
        actionType: crmAuditLog.action,
        targetType: crmAuditLog.entityType,
        targetId: crmAuditLog.entityId,
        createdAt: crmAuditLog.createdAt,
      })
      .from(crmAuditLog)
      .where(and(...crmConditions))
      .orderBy(desc(crmAuditLog.createdAt));

    // ─ Fetch actor names ────────────────────────────────────────────────────

    const allActorIds = [
      ...new Set([
        ...hrRows.map((r) => r.actorId).filter(Boolean),
        ...crmRows.map((r) => r.actorId).filter(Boolean),
      ]),
    ] as string[];

    const actorMap = new Map<string, string>();
    if (allActorIds.length > 0) {
      const actorRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            inArray(users.id, allActorIds)
          )
        );
      for (const a of actorRows) {
        actorMap.set(a.id, a.name);
      }
    }

    // ─ Merge + sort ─────────────────────────────────────────────────────────

    type AuditItem = {
      id: string;
      actorName: string;
      actionType: string;
      targetType: string;
      targetId: string | null;
      createdAt: Date;
      source: "hr" | "crm";
    };

    const hrItems: AuditItem[] = hrRows.map((r) => ({
      id: r.id,
      actorName: r.actorId ? (actorMap.get(r.actorId) ?? "System") : "System",
      actionType: r.actionType,
      targetType: r.targetType,
      targetId: r.targetId ?? null,
      createdAt: r.createdAt,
      source: "hr" as const,
    }));

    const crmItems: AuditItem[] = crmRows.map((r) => ({
      id: r.id,
      actorName: r.actorId ? (actorMap.get(r.actorId) ?? "System") : "System",
      actionType: r.actionType,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt,
      source: "crm" as const,
    }));

    const all = [...hrItems, ...crmItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    const total = all.length;
    const items = all.slice(offset, offset + limit).map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }));

    return c.json({ items, total });
  }
);
