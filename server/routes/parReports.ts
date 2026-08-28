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
import { and, eq, gte, lte, or, sql, isNotNull, isNull, inArray, type SQL } from "drizzle-orm";
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
import { accessiblePayerIds, accessibleProjectIds } from "../lib/par/projectScope";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";
import { URGENT_REASON_LABELS, type UrgentReasonCode } from "../../src/lib/par/urgentReasons";

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
  if (projectIds !== null) {
    // A scoped user's reports must cover the SAME rows as their list (par.ts GET /): the projects
    // they are on, PLUS the payer-only requests (projectId = null) of the payers they belong to.
    // Filtering on the project alone made every payer-level request vanish, so an approver or a
    // finance officer opened "spend by payee/department" and saw zeros — a silent wrong number,
    // which in a finance report is worse than an error.
    const scopedPayers = (await accessiblePayerIds(user.id, user.tenantId, user.role))
      ?.filter((id) => payerIds.includes(id)) ?? payerIds;
    const branches: SQL[] = [];
    if (projectIds.length) branches.push(inArray(parRequests.projectId, projectIds));
    if (scopedPayers.length) {
      branches.push(and(isNull(parRequests.projectId), inArray(parRequests.payerId, scopedPayers))!);
    }
    conditions.push(
      branches.length
        ? or(...branches)!
        : eq(parRequests.id, "00000000-0000-0000-0000-000000000000")
    );
  }
  c.set("parReportScope", and(...conditions)!);
  await next();
});

/**
 * Filtrele raportului. Perioada exista de la început; restul sunt cele pe care le are deja lista
 * de cereri — fără ele, „Rapoarte" răspundea la o singură întrebare („cât, în perioada asta"),
 * nu la întrebările pe care le pune de fapt un manager de proiect („cât pe proiectul X, doar
 * plătite, doar în EUR").
 *
 * Toate merg printr-un SINGUR `buildReportWhere`, folosit de toate cele 10 rapoarte ȘI de
 * exporturi — altfel exportul ar fi ieșit cu alt set de rânduri decât graficul de deasupra lui,
 * iar asta e cel mai scump fel de raport greșit: unul care pare corect.
 */
const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  /** Una sau mai multe stări, separate prin virgulă: "approved,in_finance,paid". */
  status: z.string().optional(),
  payer_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  budget_code_id: z.string().uuid().optional(),
  purpose: z.string().optional(),
  charge_to: z.string().optional(),
  /** Moneda cererii (MDL/EUR/USD) — sumele rămân agregate în MDL. */
  currency: z.string().optional(),
  /** Căutare liberă în numărul cererii și în beneficiar. */
  q: z.string().optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Citește filtrele din query string. Un parametru invalid e ignorat, nu prăbușește raportul. */
function parseReportQuery(c: { req: { query: () => Record<string, string> } }): ReportQuery {
  const parsed = reportQuerySchema.safeParse(c.req.query());
  return parsed.success ? parsed.data : {};
}

const STATUS_VALUES = [
  "draft", "pending_approval", "changes_requested", "rejected",
  "approved", "in_finance", "reapproval_required", "paid", "cancelled",
] as const;

function buildReportWhere(tenantId: string, q: ReportQuery, scope?: SQL) {
  const conditions: SQL[] = [eq(parRequests.tenantId, tenantId)];
  if (scope) conditions.push(scope);
  // PARQA-019: dateOfRequest is a timestamp column — drizzle needs a Date, not a "YYYY-MM-DD" string
  // (passing a string 500'd the query). This also fixes the period filter for every other report,
  // where the same helper silently broke whenever a date range was actually supplied.
  const fromDate = q.from ? new Date(q.from) : null;
  const toDate = q.to ? new Date(q.to) : null;
  if (fromDate && !isNaN(fromDate.getTime())) conditions.push(gte(parRequests.dateOfRequest, fromDate));
  if (toDate && !isNaN(toDate.getTime())) conditions.push(lte(parRequests.dateOfRequest, toDate));

  // Statusuri: doar valorile cunoscute ajung în SQL — un `status=;drop` nu are ce filtra.
  const statuses = (q.status ?? "").split(",").map((s) => s.trim()).filter((s) => (STATUS_VALUES as readonly string[]).includes(s));
  if (statuses.length) conditions.push(sql`${parRequests.status}::text in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`);

  if (q.payer_id) conditions.push(eq(parRequests.payerId, q.payer_id));
  if (q.project_id) conditions.push(eq(parRequests.projectId, q.project_id));
  if (q.department_id) conditions.push(eq(parRequests.departmentId, q.department_id));
  if (q.budget_code_id) conditions.push(eq(parRequests.budgetCodeId, q.budget_code_id));
  if (q.purpose) conditions.push(sql`${parRequests.purpose}::text = ${q.purpose}`);
  if (q.charge_to) conditions.push(sql`${parRequests.chargeTo}::text = ${q.charge_to}`);
  if (q.currency) conditions.push(eq(parRequests.currency, q.currency));
  if (q.q && q.q.trim()) {
    const needle = `%${q.q.trim().toLowerCase()}%`;
    conditions.push(sql`(lower(${parRequests.requestNo}) like ${needle} or lower(coalesce(${parRequests.payeeName}, '')) like ${needle})`);
  }
  return and(...conditions);
}

/** GET /api/par/reports/by-budget
 * VM1-03: sums totalMdlCents (frozen at submit) instead of totalEstimatedCents (native currency).
 * Requests without totalMdlCents (legacy drafts) fall back to totalEstimatedCents.
 */
parReportsRoutes.get("/by-budget", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      id: parRequests.budgetCodeId,
      label: parBudgetCodes.code,
      name: parBudgetCodes.name,
      allocatedCents: parBudgetCodes.allocatedCents,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      totalCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested','paid') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parBudgetCodes, and(
      eq(parBudgetCodes.id, parRequests.budgetCodeId!),
      eq(parBudgetCodes.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
    .groupBy(parRequests.budgetCodeId, parBudgetCodes.code, parBudgetCodes.name, parBudgetCodes.allocatedCents);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    // „unknown" nu spune nimic într-un raport: rândul e format din cererile care N-AU cod bugetar.
    label: ((r.label as string | null) ?? (r.name as string | null) ?? "Fără cod bugetar") as string,
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
  const q = parseReportQuery(c);
  const rows = await db.select({
    id: parRequests.payerId,
    label: parPayers.name,
    allocatedCents: sql<number>`cast(coalesce((select sum(b.allocated_cents) from par_budget_codes b where b.tenant_id = ${tenantId} and b.payer_id = ${parRequests.payerId} and b.active = true), 0) as bigint)`,
    committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
    paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
    totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
    count: sql<number>`cast(count(*) as integer)`,
  }).from(parRequests)
    .leftJoin(parPayers, and(eq(parPayers.id, parRequests.payerId!), eq(parPayers.tenantId, tenantId)))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      id: parRequests.departmentId,
      label: parDepartments.name,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parDepartments, and(
      eq(parDepartments.id, parRequests.departmentId!),
      eq(parDepartments.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
    .groupBy(parRequests.departmentId, parDepartments.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? "Fără departament") as string,
    totalCents: Number(r.totalCents ?? 0),
    // CORE §8: every dimension answers "paid vs estimated", not just the budget-code one.
    committedCents: Number(r.committedCents ?? 0),
    paidCents: Number(r.paidCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-project — VM1-03: MDL totals */
parReportsRoutes.get("/by-project", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      id: parRequests.projectId,
      label: parProjects.name,
      allocatedCents: sql<number>`cast(coalesce((select sum(b.allocated_cents) from par_budget_codes b where b.tenant_id = ${tenantId} and b.project_id = ${parRequests.projectId} and b.active = true), 0) as bigint)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parProjects, and(
      eq(parProjects.id, parRequests.projectId!),
      eq(parProjects.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
    .groupBy(parRequests.projectId, parProjects.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => {
    const allocatedCents = Number(r.allocatedCents ?? 0);
    const committedCents = Number(r.committedCents ?? 0);
    const paidCents = Number(r.paidCents ?? 0);
    return { id: r.id as string | null, label: String(r.label ?? "Fără proiect"), totalCents: Number(r.totalCents ?? 0), count: Number(r.count ?? 0), allocatedCents, committedCents, paidCents, availableCents: allocatedCents - committedCents - paidCents };
  });

  return c.json({ items });
});

/** GET /api/par/reports/by-event — VM1-04: spend per event */
parReportsRoutes.get("/by-event", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      id: parRequests.eventId,
      label: parEvents.name,
      allocatedCents: sql<number>`cast(0 as integer)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parEvents, and(
      eq(parEvents.id, parRequests.eventId!),
      eq(parEvents.tenantId, tenantId)
    ))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(and(buildReportWhere(tenantId, q, c.get("parReportScope")), isNotNull(parRequests.eventId)))
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
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      id: parRequests.chargeTo,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
    .groupBy(parRequests.chargeTo);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: (r.id ?? "other") as string,
    totalCents: Number(r.totalCents ?? 0),
    committedCents: Number(r.committedCents ?? 0),
    paidCents: Number(r.paidCents ?? 0),
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
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      label: parRequests.payeeName,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      committedCents: sql<number>`cast(sum(case when ${parRequests.status}::text in ('pending_approval','approved','in_finance','reapproval_required','changes_requested') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end) as bigint)`,
      paidCents: sql<number>`cast(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(and(buildReportWhere(tenantId, q, c.get("parReportScope")), isNotNull(parRequests.payeeName)))
    .groupBy(parRequests.payeeName);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.label as string | null) ?? null,
    label: ((r.label as string | null) ?? "Beneficiar necunoscut") as string,
    totalCents: Number(r.totalCents ?? 0),
    committedCents: Number(r.committedCents ?? 0),
    paidCents: Number(r.paidCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/currency-breakdown — VM1-03: per-currency native totals + aggregated MDL total */
parReportsRoutes.get("/currency-breakdown", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

  const rows = await db
    .select({
      currency: parRequests.currency,
      nativeTotalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as bigint)`,
      mdlTotalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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
  const q = parseReportQuery(c); // PARQA-019: honor the period filter

  const rows = await db
    .select({
      status: parRequests.status,
      count: sql<number>`cast(count(*) as integer)`,
      totalCents: sql<number>`cast(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})) as bigint)`,
      avgAgingDays: sql<number>`
        cast(avg(
          extract(epoch from (now() - ${parRequests.createdAt})) / 86400
        ) as float)
      `,
    })
    .from(parRequests)
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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
  const q = parseReportQuery(c); // PARQA-019: honor the period filter

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
      buildReportWhere(tenantId, q, c.get("parReportScope")),
      isNotNull(parRequests.submittedAt)
    ));

  const raw = Array.isArray(rows) ? rows[0] : ((rows as { rows?: unknown[] }).rows ?? [])[0] as Record<string, unknown> | undefined;
  return c.json({
    count: raw ? Number(raw.count ?? 0) : 0,
    avgSubmitToApprovedDays: raw ? (raw.avgSubmitToApproved != null ? parseFloat(String(raw.avgSubmitToApproved)) : null) : null,
    avgSubmitToPaidDays: raw ? (raw.avgSubmitToPaid != null ? parseFloat(String(raw.avgSubmitToPaid)) : null) : null,
  });
});

/** GET /api/par/reports/urgent — owner request 2026-08-28: cine cere urgent cel mai des și de ce.
 * Folosește exact aceleași filtre ca restul raportului (perioadă, status, plătitor, proiect,
 * departament, monedă, căutare) — altfel secțiunea ar răspunde la alte întrebări decât cele de
 * deasupra ei, pe același ecran. */
parReportsRoutes.get("/urgent", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);
  const scopeWhere = and(buildReportWhere(tenantId, q, c.get("parReportScope")), eq(parRequests.isUrgent, true))!;

  const [totalRow, byRequesterRows, byReasonRows] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(parRequests).where(scopeWhere),
    db
      .select({
        userId: parRequests.requestedByUserId,
        name: users.name,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(parRequests)
      .leftJoin(users, eq(users.id, parRequests.requestedByUserId))
      .where(scopeWhere)
      .groupBy(parRequests.requestedByUserId, users.name),
    db
      .select({
        reason: parRequests.urgentReason,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(parRequests)
      .where(scopeWhere)
      .groupBy(parRequests.urgentReason),
  ]);

  const totalData = Array.isArray(totalRow) ? totalRow : (totalRow as { rows?: unknown[] }).rows ?? [];
  const totalUrgent = totalData[0] ? Number((totalData[0] as Record<string, unknown>).count ?? 0) : 0;

  const requesterData = Array.isArray(byRequesterRows) ? byRequesterRows : (byRequesterRows as { rows?: unknown[] }).rows ?? [];
  const byRequester = (requesterData as Record<string, unknown>[])
    .map((r) => ({
      userId: (r.userId as string | null) ?? null,
      name: (r.name as string | null) ?? "Necunoscut",
      count: Number(r.count ?? 0),
    }))
    .sort((a, b) => b.count - a.count);

  const reasonData = Array.isArray(byReasonRows) ? byReasonRows : (byReasonRows as { rows?: unknown[] }).rows ?? [];
  const byReason = (reasonData as Record<string, unknown>[])
    .map((r) => {
      const reason = (r.reason as string | null) ?? "necunoscut";
      const label = URGENT_REASON_LABELS[reason as UrgentReasonCode] ?? reason;
      return { reason, label, count: Number(r.count ?? 0) };
    })
    .sort((a, b) => b.count - a.count);

  return c.json({ urgent: { totalUrgent, byRequester, byReason } });
});

/** GET /api/par/reports/export.csv — raw CSV export */
parReportsRoutes.get("/export.csv", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

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
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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

  // `c.text()` sets Content-Type: text/plain and overwrites the header set above,
  // so the export left the server announcing itself as plain text. Excel and most
  // import tools sniff that header; return the body directly instead.
  c.header("Content-Disposition", `attachment; filename="par-export.csv"`);
  return c.body(csv, 200, { "Content-Type": "text/csv; charset=utf-8" });
});

/** VF-201: GET /api/par/reports/export.xlsx — Excel workbook (3 sheets, resolved names). */
parReportsRoutes.get("/export.xlsx", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = parseReportQuery(c);

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
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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
    .where(buildReportWhere(tenantId, q, c.get("parReportScope")))
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
