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
import { and, eq, gte, lte, sql, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parPayments,
  parBudgetCodes,
  parDepartments,
  parProjects,
} from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parReportsRoutes = new Hono<{ Variables: AuthVariables }>();

parReportsRoutes.use("*", requireAuth);
parReportsRoutes.use("*", requirePARRole("approver", "finance", "par_admin"));

const periodSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function buildPeriodWhere(tenantId: string, from?: string, to?: string) {
  const conditions = [eq(parRequests.tenantId, tenantId)];
  if (from) conditions.push(gte(parRequests.dateOfRequest, from));
  if (to) conditions.push(lte(parRequests.dateOfRequest, to));
  return and(...conditions);
}

/** GET /api/par/reports/by-budget */
parReportsRoutes.get("/by-budget", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.budgetCodeId,
      label: parBudgetCodes.code,
      name: parBudgetCodes.name,
      totalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parBudgetCodes, and(
      eq(parBudgetCodes.id, parRequests.budgetCodeId!),
      eq(parBudgetCodes.tenantId, tenantId)
    ))
    .where(buildPeriodWhere(tenantId, from, to))
    .groupBy(parRequests.budgetCodeId, parBudgetCodes.code, parBudgetCodes.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? (r.name as string | null) ?? r.id ?? "unknown") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-department */
parReportsRoutes.get("/by-department", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.departmentId,
      label: parDepartments.name,
      totalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parDepartments, and(
      eq(parDepartments.id, parRequests.departmentId!),
      eq(parDepartments.tenantId, tenantId)
    ))
    .where(buildPeriodWhere(tenantId, from, to))
    .groupBy(parRequests.departmentId, parDepartments.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? r.id ?? "unknown") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-project */
parReportsRoutes.get("/by-project", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.projectId,
      label: parProjects.name,
      totalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .leftJoin(parProjects, and(
      eq(parProjects.id, parRequests.projectId!),
      eq(parProjects.tenantId, tenantId)
    ))
    .where(buildPeriodWhere(tenantId, from, to))
    .groupBy(parRequests.projectId, parProjects.name);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: ((r.label as string | null) ?? r.id ?? "unknown") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/by-charge-to */
parReportsRoutes.get("/by-charge-to", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { from, to } = periodSchema.parse(c.req.query());

  const rows = await db
    .select({
      id: parRequests.chargeTo,
      totalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(parRequests)
    .where(buildPeriodWhere(tenantId, from, to))
    .groupBy(parRequests.chargeTo);

  const items = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string | null,
    label: (r.id ?? "other") as string,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));

  return c.json({ items });
});

/** GET /api/par/reports/aging — count/sum per status + avg age */
parReportsRoutes.get("/aging", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      status: parRequests.status,
      count: sql<number>`cast(count(*) as integer)`,
      totalCents: sql<number>`cast(sum(${parRequests.totalEstimatedCents}) as integer)`,
      avgAgingDays: sql<number>`
        cast(avg(
          extract(epoch from (now() - ${parRequests.createdAt})) / 86400
        ) as float)
      `,
    })
    .from(parRequests)
    .where(eq(parRequests.tenantId, tenantId))
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
      eq(parRequests.tenantId, tenantId),
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
    .where(buildPeriodWhere(tenantId, from, to))
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
