/**
 * CRM-127 — Audit log routes
 * GET /api/audit-log — paginated list of CRM audit entries
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { crmAuditLog } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const auditRoutes = new Hono<{ Variables: AuthVariables }>();

auditRoutes.use("/*", requireAuth);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entity_id: z.string().uuid().optional(),
  actor_id: z.string().uuid().optional(),
  action: z.string().max(64).optional(),
});

auditRoutes.get("/", zValidator("query", querySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { limit, offset, entity_id, actor_id, action } = c.req.valid("query");

  const conditions = [eq(crmAuditLog.tenantId, tenantId)];
  if (entity_id) conditions.push(eq(crmAuditLog.entityId, entity_id));
  if (actor_id) conditions.push(eq(crmAuditLog.actorId, actor_id));
  if (action) conditions.push(eq(crmAuditLog.action, action));

  const rows = await db
    .select()
    .from(crmAuditLog)
    .where(and(...conditions))
    .orderBy(desc(crmAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ entries: rows, limit, offset });
});
