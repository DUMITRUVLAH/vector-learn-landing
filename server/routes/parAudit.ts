/**
 * VF-301: PAR audit log viewer (par_admin only).
 *   GET /api/par/audit  → paginated audit entries with resolved actor names + filters.
 *
 * Read-only. Tenant-scoped. par_audit is written by the other routes; here we only expose it.
 * Mounted in app.ts: app.route("/api/par/audit", parAuditRoutes)
 */
import { Hono, type Context } from "hono";
import { and, eq, gte, lte, desc, sql, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { parAudit, parRequests, parPayers, parProjects, parEvents } from "../db/schema/par";
import { messages } from "../db/schema/messages";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";
import { accessibleProjectIds } from "../lib/par/projectScope";

export const parAuditRoutes = new Hono<{ Variables: AuthVariables }>();
parAuditRoutes.use("*", requireAuth);
parAuditRoutes.use("*", requirePARRole("par_admin"));

const PAGE_SIZE = 50;

function exportConditions(c: Context<{ Variables: AuthVariables }>, tenantId: string, payerIds: string[], projectIds: string[] | null): SQL[] {
  const out: SQL[] = [
    eq(parAudit.tenantId, tenantId),
    payerIds.length ? inArray(parRequests.payerId, payerIds) : eq(parRequests.id, "00000000-0000-0000-0000-000000000000"),
  ];
  if (projectIds !== null) out.push(projectIds.length
    ? inArray(parRequests.projectId, projectIds)
    : eq(parRequests.projectId, "00000000-0000-0000-0000-000000000000"));
  const map: Array<[string, SQL | null]> = [
    ["payer_id", c.req.query("payer_id") ? eq(parRequests.payerId, c.req.query("payer_id")!) : null],
    ["project_id", c.req.query("project_id") ? eq(parRequests.projectId, c.req.query("project_id")!) : null],
    ["event_id", c.req.query("event_id") ? eq(parRequests.eventId, c.req.query("event_id")!) : null],
    ["actor_user_id", c.req.query("actor_user_id") ? eq(parAudit.actorUserId, c.req.query("actor_user_id")!) : null],
    ["event", c.req.query("event") ? eq(parAudit.event, c.req.query("event")!) : null],
  ];
  for (const [, condition] of map) if (condition) out.push(condition);
  const status = c.req.query("status"); if (status) out.push(sql`${parRequests.status}::text = ${status}`);
  const from = c.req.query("date_from"); if (from && !isNaN(new Date(from).getTime())) out.push(gte(parAudit.createdAt, new Date(from)));
  const to = c.req.query("date_to"); if (to && !isNaN(new Date(to).getTime())) { const d = new Date(to); d.setHours(23, 59, 59, 999); out.push(lte(parAudit.createdAt, d)); }
  return out;
}

async function auditExportRows(tenantId: string, conditions: SQL[]) {
  return db.select({
    createdAt: parAudit.createdAt, event: parAudit.event, detail: parAudit.detail,
    actorName: users.name, requestNo: parRequests.requestNo, status: parRequests.status,
    payerName: parPayers.name, projectName: parProjects.name, eventName: parEvents.name,
  }).from(parAudit)
    .leftJoin(users, eq(users.id, parAudit.actorUserId))
    .leftJoin(parRequests, eq(parRequests.id, parAudit.parId))
    .leftJoin(parPayers, eq(parPayers.id, parRequests.payerId))
    .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
    .leftJoin(parEvents, eq(parEvents.id, parRequests.eventId))
    .where(and(...conditions, eq(parAudit.tenantId, tenantId))).orderBy(desc(parAudit.createdAt));
}

parAuditRoutes.get("/export.xlsx", async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  const rows = await auditExportRows(tenantId, exportConditions(c, tenantId, await enabledPayerIds(tenantId, "par"), await accessibleProjectIds(user.id, tenantId, user.role)));
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Audit PAR");
  sheet.columns = [
    { header: "Data", key: "date", width: 22 }, { header: "PAR", key: "par", width: 18 },
    { header: "Statut", key: "status", width: 20 }, { header: "Plătitor", key: "payer", width: 28 },
    { header: "Proiect", key: "project", width: 28 }, { header: "Eveniment", key: "eventName", width: 24 },
    { header: "Persoană", key: "actor", width: 25 }, { header: "Acțiune", key: "event", width: 25 },
    { header: "Detalii", key: "detail", width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow({ date: r.createdAt.toISOString(), par: r.requestNo, status: r.status, payer: r.payerName, project: r.projectName, eventName: r.eventName, actor: r.actorName, event: r.event, detail: r.detail }));
  const buffer = await workbook.xlsx.writeBuffer();
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", "attachment; filename=par-audit.xlsx");
  return c.body(Buffer.from(buffer));
});

parAuditRoutes.get("/export.pdf", async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  const rows = await auditExportRows(tenantId, exportConditions(c, tenantId, await enabledPayerIds(tenantId, "par"), await accessibleProjectIds(user.id, tenantId, user.role)));
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([842, 595]); let y = 565;
  const addLine = (line: string, bold = false) => {
    if (y < 28) { page = doc.addPage([842, 595]); y = 565; }
    page.drawText(line.replace(/[^\x20-\x7E]/g, "?"), { x: 24, y, size: bold ? 11 : 8, font }); y -= bold ? 18 : 12;
  };
  addLine("Audit PAR", true);
  rows.forEach((r) => addLine(`${r.createdAt.toISOString().slice(0, 16)} | ${r.requestNo ?? "-"} | ${r.status ?? "-"} | ${r.payerName ?? "-"} | ${r.projectName ?? "-"} | ${r.actorName ?? "-"} | ${r.event}`.slice(0, 180)));
  const bytes = await doc.save(); c.header("Content-Type", "application/pdf"); c.header("Content-Disposition", "attachment; filename=par-audit.pdf");
  return c.body(Buffer.from(bytes));
});

/** GET /api/par/audit — paginated, filtered audit log. */
parAuditRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const parId = c.req.query("par_id");
  const actorUserId = c.req.query("actor_user_id");
  const event = c.req.query("event");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);

  const conditions: SQL[] = [eq(parAudit.tenantId, tenantId)];
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  conditions.push(entitledPayers.length
    ? inArray(parRequests.payerId, entitledPayers)
    : eq(parRequests.id, "00000000-0000-0000-0000-000000000000"));
  const projectScope = await accessibleProjectIds(user.id, tenantId, user.role);
  if (projectScope !== null) conditions.push(projectScope.length
    ? inArray(parRequests.projectId, projectScope)
    : eq(parRequests.projectId, "00000000-0000-0000-0000-000000000000"));
  const payerId = c.req.query("payer_id");
  const projectId = c.req.query("project_id");
  const eventId = c.req.query("event_id");
  const status = c.req.query("status");
  if (parId) conditions.push(eq(parAudit.parId, parId));
  if (actorUserId) conditions.push(eq(parAudit.actorUserId, actorUserId));
  if (event) conditions.push(eq(parAudit.event, event));
  if (payerId) conditions.push(eq(parRequests.payerId, payerId));
  if (projectId) conditions.push(eq(parRequests.projectId, projectId));
  if (eventId) conditions.push(eq(parRequests.eventId, eventId));
  if (status) conditions.push(sql`${parRequests.status}::text = ${status}`);
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
    .leftJoin(parRequests, eq(parRequests.id, parAudit.parId))
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
      payerId: parRequests.payerId,
      payerName: parPayers.name,
      projectId: parRequests.projectId,
      projectName: parProjects.name,
      eventId: parRequests.eventId,
      eventName: parEvents.name,
      parStatus: parRequests.status,
    })
    .from(parAudit)
    .leftJoin(users, eq(users.id, parAudit.actorUserId))
    .leftJoin(parRequests, eq(parRequests.id, parAudit.parId))
    .leftJoin(parPayers, eq(parPayers.id, parRequests.payerId))
    .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
    .leftJoin(parEvents, eq(parEvents.id, parRequests.eventId))
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
