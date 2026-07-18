/**
 * PAR-117: Reports routes
 * GET /api/par/reports/by-budget        — spend per budget code
 * GET /api/par/reports/by-department    — spend per department
 * GET /api/par/reports/by-project       — spend per project
 * GET /api/par/reports/by-charge-to     — spend per charge_to category
 * GET /api/par/reports/aging            — PAR count/amount per status + avg age
 * GET /api/par/reports/cycle-time       — avg submit→approved and submit→paid
 * GET /api/par/reports/export.csv       — raw export of filtered PARs
 *
 * Role: approver | finance | par_admin (no "manager" role — CORE §1)
 * Tenant-scoped. Integer minor units. PGlite + Postgres portability.
 *
 * CORE: backlog/par/PAR-CORE.md §8
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte, lte, sql, isNotNull, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parPayments,
  parBudgetCodes,
  parDepartments,
  parProjects,
  parPayers,
  parEvents, // VM1-04
  parLineItems,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { tenants } from "../db/schema/tenants";
import { buildParWorkbook } from "../lib/par/excelExport";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { accessibleProjectIds } from "../lib/par/projectScope";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";

type ReportVariables = AuthVariables & { parReportScope: SQL };
export const parReportsRoutes = new Hono<{ Variables: ReportVariables }>();

parReportsRoutes.use("*", requireAuth);
parReportsRoutes.use("*", requirePARRole("approver", "finance", "par_admin"));
parReportsRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  const payerIds = await enabledPayerIds(user.tenantId, "par");
  const projectIds = await accessibleProjectIds(user.id, user.tenantId, user.role);
  const conditions: SQL[] = [payerIds.length
    ? inArray(parRequests.payerId, payerIds)
    : eq(parRequests.id, "00000000-0000-0000-0000-000000000000")];
  if (projectIds !== null) conditions.push(projectIds.length
    ? inArray(parRequests.projectId, projectIds)
    : eq(parRequests.projectId, "00000000-0000-0000-0000-000000000000"));
  c.set("parReportScope", and(...conditions)!);
  await next();
});

const periodSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function buildPeriodWhere(tenantId: string, from?: string, to?: string, scope?: SQL) {
  const conditions: SQL[] = [eq(parRequests.tenantId, tenantId)];
  if (scope) conditions.push(scope);
  // PARQA-019: dateOfRequest is a timestamp column — drizzle needs a Date, not a "YYYY-MM-DD" string
  // (passing a string 500'd the query). This also fixes the period filter for every other report,
  // where the same helper silently broke whenever a date range was actually supplied.
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !isNaN(fromDate.getTime())) conditions.push(gte(parRequests.dateOfRequest, fromDate));
  if (toDate && !isNaN(toDate.getTime())) conditions.push(lte(parRequests.dateOfRequest, toDate));
  return and(...conditions);
}

/** GET /api/par/reports/by-budget
 * VM1-03: sums totalMdlCents (frozen at submit) instead of totalEstimatedCents (native currency).
 * Requests without totalMdlCents (legacy drafts) fall back to totalEstimatedCents.
 */
parReportsRoutes.get("/by-budget", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.budgetCodeId,
      label: parBudgetCodes.code,
      name: parBudgetCodes.name,
      allocatedCents: parBudgetCodes.allocatedCents,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as integer)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as integer)`,
      totalCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested','paid') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parBudgetCodes, and(
      eq(parBudgetCodes.id, parRequests.budgetCodeId!),
      eq(parBudgetCodes.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.budgetCodeId, parBudgetCodes.code, parBudgetCodes.name, parBudgetCodes.allocatedCents);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? (r.name as string | null) ?? r.id ?? "unknown") as string,
    totalCents: Number(r.totalCents ?? 0),
    allocatedCents: Number(r.allocatedCents ?? 0),
    committedCents: Number(r.committedCents ?? 0),
    paidCents: Number(r.paidCents ?? 0),
    availableCents: Number(r.allocatedCents ?? 0) - Number(r.committedCents ?? 0) - Number(r.paidCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-payer — consolidated execution per legal entity. */
parReportsRoutes.get("/by-payer", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());
  const rows = await db.select({
    id: parRequests.payerId,
    label: parPayers.name,
    allocatedCents: sql<number>`cast(coalesce((select sum(b.allocated_cents) from par_budget_codes b where b.tenant_id = ${tenantId} and b.payer_id = ${parRequests.payerId} and b.active = true), 0) as integer)`,
    committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as integer)`,
    paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as integer)`,
    totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
    count: sql<number>`cast(count(*) as integer)`,
  }).from(parRequests)
    .leftJoin(parPayers, and(eq(parPayers.id, parRequests.payerId!), eq(parPayers.tenantId, tenantId)))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.payerId, parPayers.name);
  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => {
    const allocatedCents = Number(r.allocatedCents ?? 0);
    const committedCents = Number(r.committedCents ?? 0);
    const paidCents = Number(r.paidCents ?? 0);
    return { id: r.id as string | null, label: String(r.label ?? "Plătitor necunoscut"), totalCents: Number(r.totalCents ?? 0), count: Number(r.count ?? 0), allocatedCents, committedCents, paidCents, availableCents: allocatedCents - committedCents - paidCents };
  });
  return c.json({ items });
});

/** GET /api/par/reports/by-department — VM1-03: MDL totals */
parReportsRoutes.get("/by-department", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.departmentId,
      label: parDepartments.name,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parDepartments, and(
      eq(parDepartments.id, parRequests.departmentId!),
      eq(parDepartments.tenantId, tenantId)
    ))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.departmentId, parDepartments.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? r.id ?? "unknown") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-project — VM1-03: MDL totals */
parReportsRoutes.get("/by-project", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.projectId,
      label: parProjects.name,
      allocatedCents: sql<number>`cast(coalesce((select sum(b.allocated_cents) from par_budget_codes b where b.tenant_id = ${tenantId} and b.project_id = ${parRequests.projectId} and b.active = true), 0) as integer)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as integer)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as integer)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parProjects, and(
      eq(parProjects.id, parRequests.projectId!),
      eq(parProjects.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.projectId, parProjects.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => {
    const allocatedCents = Number(r.allocatedCents ?? 0);
    const committedCents = Number(r.committedCents ?? 0);
    const paidCents = Number(r.paidCents ?? 0);
    return { id: r.id as string | null, label: String(r.label ?? r.id ?? "unknown"), totalCents: Number(r.totalCents ?? 0), count: Number(r.count ?? 0), allocatedCents, committedCents, paidCents, availableCents: allocatedCents - committedCents - paidCents };
  });

  return c.json({ items });
});

/** GET /api/par/reports/by-event — VM1-04: spend per event */
parReportsRoutes.get("/by-event", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.eventId,
      label: parEvents.name,
      allocatedCents: sql<number>`cast(0 as integer)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as integer)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as integer)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parEvents, and(
      eq(parEvents.id, parRequests.eventId!),
      eq(parEvents.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(and(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")), isNotNull(parRequests.eventId)))
    .groupBy(parRequests.eventId, parEvents.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => {
    const committedCents = Number(r.committedCents ?? 0);
    const paidCents = Number(r.paidCents ?? 0);
    return { id: r.id as string | null, label: String(r.label ?? "Eveniment necunoscut"), totalCents: Number(r.totalCents ?? 0), count: Number(r.count ?? 0), allocatedCents: 0, committedCents, paidCents, availableCents: -committedCents - paidCents };
  });

  return c.json({ items });
});

/** GET /api/par/reports/by-charge-to — VM1-03: MDL totals */
parReportsRoutes.get("/by-charge-to", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.chargeTo,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.chargeTo);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: (r.id ?? "other") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-vendor — PARQA-019: spend per payee/beneficiary (MDL totals).
 * Groups by the snapshotted payeeName (populated for both inline payees and picked vendors), so
 * "how much did we pay Vendor X" is answerable. Gated to approver/finance/par_admin (payee names
 * are GDPR-sensitive; this router already requires an elevated role). */
parReportsRoutes.get("/by-vendor", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      label: parRequests.payeeName,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .where(and(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")), isNotNull(parRequests.payeeName)))
    .groupBy(parRequests.payeeName);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.label as string | null) ?? null,
    label: ((r.label as string | null) ?? "Beneficiar necunoscut") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/currency-breakdown — VM1-03: per-currency native totals + aggregated MDL total */
parReportsRoutes.get("/currency-breakdown", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      currency: parRequests.currency,
      nativeTotalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      mdlTotalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.currency);

  const data = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const byCurrency = (data as Record<string, unknown>[]).map((r) => ({
    currency: (r.currency ?? "MDL") as string,
    nativeTotalCents: Number(r.nativeTotalCents ?? 0),
    mdlTotalCents: Number(r.mdlTotalCents ?? 0),
    count: Number(r.count ?? 0),
  }));
  const totalMdlCents = byCurrency.reduce((s, r) => s + r.mdlTotalCents, 0);

  return c.json({ byCurrency, totalMdlCents });
});

/** GET /api/par/reports/aging — count/sum per status + avg age — VM1-03: MDL totals */
parReportsRoutes.get("/aging", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query()); // PARQA-019: honor the period filter

  const rows = await db
    .select({
      status: parRequests.status,
      count: sql<number>`cast(count(*) as integer)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as integer)`,
      avgAgingDays: sql<number>`
        cast(avg(
          extract(epoch from (now() - ${parRequests.createdAt})) / 86400
        ) as float)
      `,
    })
    .from(parRequests)
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .groupBy(parRequests.status);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    status: r.status as string,
    count: Number(r.count ?? 0),
    totalCents: Number(r.totalCents ?? 0),
    avgAgingDays: parseFloat(String(r.avgAgingDays ?? 0)),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/cycle-time — avg submit→approved and submit→paid */
parReportsRoutes.get("/cycle-time", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query()); // PARQA-019: honor the period filter

  const rows = await db
    .select({
      count: sql<number>`cast(count(*) as integer)`,
      avgSubmitToApproved: sql<number>`
        cast(avg(
          case when ${parRequests.approvedAt} is not null
          then extract(epoch from (${parRequests.approvedAt} - ${parRequests.submittedAt})) / 86400
          end
        ) as float)
      `,
      avgSubmitToPaid: sql<number>`
        cast(avg(
          case when ${parRequests.paidAt} is not null and ${parRequests.submittedAt} is not null
          then extract(epoch from (${parRequests.paidAt} - ${parRequests.submittedAt})) / 86400
          end
        ) as float)
      `,
    })
    .from(parRequests)
    .where(and(
      buildPeriodWhere(tenantId, from, to, c.get("parReportScope")),
      isNotNull(parRequests.submittedAt)
    ));

  const raw = Array.isArray(rows) ? rows[0] : ((rows as { rows?: unknown[] }).rows ?? [])[0] as Record<string, unknown> | undefined;
  return c.json({
    count: raw ? Number(raw.count ?? 0) : 0,
    avgSubmitToApprovedDays: raw ? (raw.avgSubmitToApproved != null ? parseFloat(String(raw.avgSubmitToApproved)) : null) : null,
    avgSubmitToPaidDays: raw ? (raw.avgSubmitToPaid != null ? parseFloat(String(raw.avgSubmitToPaid)) : null) : null,
  });
});

/** GET /api/par/reports/export.csv — raw CSV export */
parReportsRoutes.get("/export.csv", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      requestNo: parRequests.requestNo,
      dateOfRequest: parRequests.dateOfRequest,
      purpose: parRequests.purpose,
      chargeTo: parRequests.chargeTo,
      status: parRequests.status,
      totalEstimatedCents: parRequests.totalEstimatedCents,
      currency: parRequests.currency,
      submittedAt: parRequests.submittedAt,
      approvedAt: parRequests.approvedAt,
      paidAt: parRequests.paidAt,
    })
    .from(parRequests)
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .orderBy(parRequests.dateOfRequest);

  const data = Array.isArray(rows) ? rows : (rows as { rows?: typeof rows }).rows ?? [];

  const header = "request_no,date_of_request,purpose,charge_to,status,total_estimated,currency,submitted_at,approved_at,paid_at\n";
  const csvRows = (data as Record<string, unknown>[]).map((r) => [
    r.requestNo,
    r.dateOfRequest,
    r.purpose,
    r.chargeTo,
    r.status,
    Number(r.totalEstimatedCents ?? 0) / 100,
    r.currency,
    r.submittedAt ?? "",
    r.approvedAt ?? "",
    r.paidAt ?? "",
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

  const csv = header + csvRows;

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="par-export.csv"`);
  return c.text(csv);
});

/** VF-201: GET /api/par/reports/export.xlsx — Excel workbook (3 sheets, resolved names). */
parReportsRoutes.get("/export.xlsx", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  // PARs with names resolved via joins (not UUIDs).
  const parRows = await db
    .select({
      id: parRequests.id,
      requestNo: parRequests.requestNo,
      dateOfRequest: parRequests.dateOfRequest,
      requestorName: users.name,
      departmentName: parDepartments.name,
      projectName: parProjects.name,
      budgetCode: parBudgetCodes.code,
      purpose: parRequests.purpose,
      chargeTo: parRequests.chargeTo,
      status: parRequests.status,
      totalEstimatedCents: parRequests.totalEstimatedCents,
      currency: parRequests.currency,
      submittedAt: parRequests.submittedAt,
      approvedAt: parRequests.approvedAt,
      paidAt: parRequests.paidAt,
    })
    .from(parRequests)
    .leftJoin(users, eq(users.id, parRequests.requestedByUserId))
    .leftJoin(parDepartments, eq(parDepartments.id, parRequests.departmentId))
    .leftJoin(parProjects, eq(parProjects.id, parRequests.projectId))
    .leftJoin(parBudgetCodes, eq(parBudgetCodes.id, parRequests.budgetCodeId))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .orderBy(parRequests.dateOfRequest);

  const pars = Array.isArray(parRows) ? parRows : (parRows as { rows?: typeof parRows }).rows ?? [];

  // Line items for the same PARs, joined to their request number.
  const lineRows = await db
    .select({
      requestNo: parRequests.requestNo,
      position: parLineItems.position,
      description: parLineItems.description,
      quantity: parLineItems.quantity,
      unit: parLineItems.unit,
      unitPriceCents: parLineItems.unitPriceCents,
      lineTotalCents: parLineItems.lineTotalCents,
      currency: parRequests.currency,
    })
    .from(parLineItems)
    .innerJoin(parRequests, eq(parRequests.id, parLineItems.parId))
    .where(buildPeriodWhere(tenantId, from, to, c.get("parReportScope")))
    .orderBy(parRequests.requestNo, parLineItems.position);

  const lines = Array.isArray(lineRows) ? lineRows : (lineRows as { rows?: typeof lineRows }).rows ?? [];

  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));

  const buffer = await buildParWorkbook({
    orgName: tenant?.name ?? "Organizație",
    pars: pars as Parameters<typeof buildParWorkbook>[0]["pars"],
    lines: lines as Parameters<typeof buildParWorkbook>[0]["lines"],
  });

  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="par-export.xlsx"`);
  return c.body(buffer);
});
