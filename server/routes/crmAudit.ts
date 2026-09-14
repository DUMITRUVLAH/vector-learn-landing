/**
 * CRM Faza 9 — jurnalul CRM: cine ce a schimbat.
 *
 * Montat la /api/crm/audit.
 *
 * GET /api/crm/audit                 — ultimele intrări CRM ale workspace-ului
 * GET /api/crm/audit?targetId=<id>   — istoricul unui singur obiect (ex. un lead)
 * GET /api/crm/permissions           — ce poate face utilizatorul curent (montat separat)
 *
 * Citirea cere dreptul `audit.view`: jurnalul spune cine a schimbat prețul unui produs sau cine a
 * mutat leadurile între pâlnii — informație de administrator, nu de zi cu zi.
 *
 * Nu există un jurnal CRM separat: intrările stau în `audit_log`, tabela pe care o folosesc și
 * celelalte module. Filtrul e prefixul `crm.` din `action_type` (vezi server/lib/crm/audit.ts).
 */
import { Hono } from "hono";
import { and, desc, eq, like } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog } from "../db/schema/auditLog";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";

export const crmAuditRoutes = new Hono<{ Variables: AuthVariables }>();
crmAuditRoutes.use("/*", requireAuth);
crmAuditRoutes.use("/*", requireCrmPermission("audit.view"));

crmAuditRoutes.get("/", async (c) => {
  const user = c.get("user");
  const targetId = c.req.query("targetId");
  const targetType = c.req.query("targetType");
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1), 200);

  const conditions = [eq(auditLog.tenantId, user.tenantId), like(auditLog.actionType, "crm.%")];
  if (targetId) conditions.push(eq(auditLog.targetId, targetId));
  if (targetType) conditions.push(eq(auditLog.targetType, targetType));

  try {
    const rows = await db
      .select({
        id: auditLog.id,
        actionType: auditLog.actionType,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        oldValue: auditLog.oldValue,
        newValue: auditLog.newValue,
        occurredAt: auditLog.occurredAt,
        actorId: auditLog.actorId,
        // Numele, nu id-ul: un uuid în dreptul unei modificări nu spune nimănui cine a făcut-o.
        actorName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(...conditions))
      .orderBy(desc(auditLog.occurredAt))
      .limit(limit);

    return c.json({ items: rows });
  } catch (e) {
    console.error("[crm/audit] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});
