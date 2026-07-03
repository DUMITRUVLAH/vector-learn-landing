/**
 * VF-301: PAR audit log viewer (par_admin only).
 *   GET /api/par/audit  → paginated audit entries with resolved actor names + filters.
 *
 * Read-only. Tenant-scoped. par_audit is written by the other routes; here we only expose it.
 * Mounted in app.ts: app.route("/api/par/audit", parAuditRoutes)
 */
import { Hono } from "hono";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parAudit, parRequests } from "../db/schema/par";
import { messages } from "../db/schema/messages";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parAuditRoutes = new Hono<{ Variables: AuthVariables }>();
parAuditRoutes.use("*", requireAuth);
parAuditRoutes.use("*", requirePARRole("par_admin"));

const PAGE_SIZE = 50;

/** GET /api/par/audit — paginated, filtered audit log. */
parAuditRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const parId = c.req.query("par_id");
  const actorUserId = c.req.query("actor_user_id");
  const event = c.req.query("event");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);

  const conditions = [eq(parAudit.tenantId, tenantId)];
  if (parId) conditions.push(eq(parAudit.parId, parId));
  if (actorUserId) conditions.push(eq(parAudit.actorUserId, actorUserId));
  if (event) conditions.push(eq(parAudit.event, event));
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) conditions.push(gte(parAudit.createdAt, d));
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      conditions.push(lte(parAudit.createdAt, d));
    }
  }
  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(parAudit)
    .where(where);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      id: parAudit.id,
      event: parAudit.event,
      detail: parAudit.detail,
      createdAt: parAudit.createdAt,
      actorUserId: parAudit.actorUserId,
      actorName: users.name,
      parId: parAudit.parId,
      requestNo: parRequests.requestNo,
    })
    .from(parAudit)
    .leftJoin(users, eq(users.id, parAudit.actorUserId))
    .leftJoin(parRequests, eq(parRequests.id, parAudit.parId))
    .where(where)
    .orderBy(desc(parAudit.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return c.json({
    entries: rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});

/**
 * VM1-07: GET /api/par/audit/emails — the last outbound PAR emails with delivery status,
 * so a failed send is visible to par_admin instead of dying silently in a console.warn.
 * Filters on subject "[PAR]" (the prefix every PAR notification uses).
 */
parAuditRoutes.get("/emails", async (c) => {
  const tenantId = c.get("user").tenantId;
  const onlyFailed = c.req.query("failed") === "1";

  const conditions = [
    eq(messages.tenantId, tenantId),
    eq(messages.channel, "email"),
    sql`${messages.subject} LIKE '[PAR]%'`,
  ];
  if (onlyFailed) conditions.push(eq(messages.status, "failed"));

  const rows = await db
    .select({
      id: messages.id,
      toAddress: messages.toAddress,
      subject: messages.subject,
      status: messages.status,
      errorMessage: messages.errorMessage,
      sentAt: messages.sentAt,
      failedAt: messages.failedAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  const [failedRow] = await db
    .select({ failed: sql<number>`cast(count(*) as int)` })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.channel, "email"),
        eq(messages.status, "failed"),
        sql`${messages.subject} LIKE '[PAR]%'`
      )
    );

  return c.json({ emails: rows, failedCount: Number(failedRow?.failed ?? 0) });
});
