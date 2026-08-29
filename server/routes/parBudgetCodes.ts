/**
 * PAR-003: Budget codes CRUD
 * GET/POST/PATCH/DELETE /api/par/budget-codes
 *
 * Feature 2 additions:
 *   GET    /api/par/budget-codes/:id/balance  → {allocatedCents, committedCents, spentCents, availableCents}
 *   POST   /api/par/budget-codes  — accepts allocatedCents
 *   PATCH  /api/par/budget-codes/:id — accepts allocatedCents
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, ilike, inArray, sql, or } from "drizzle-orm";
import { db } from "../db/client";
import { parBudgetCodes, parRequests, parPayments, parProjects } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { accessibleProjectIds, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";
import { enabledPayerIds, hasPayerModuleEntitlement } from "../middleware/requireModuleEntitlement";
import { writeAuditLog } from "../lib/auditLogger";
import { getMdlRate } from "../lib/fx";
import { clientIp } from "../lib/clientIp";

export const parBudgetCodesRoutes = new Hono<{ Variables: AuthVariables }>();
parBudgetCodesRoutes.use("*", requireAuth);
// Guard the nested `/:id/balance`; the bare `/:id` (PATCH/DELETE) is UUID-constrained at the route
// level so the literal `/usage` route is never shadowed by a wildcard guard.
parBudgetCodesRoutes.use("/:id/:action/*", parUuidGuard("id"));

const BUDGET_CURRENCIES = ["MDL", "EUR", "USD"] as const;
type BudgetCurrency = (typeof BUDGET_CURRENCIES)[number];

const codeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
  allocatedCents: z.number().int().min(0).optional(),
  /** Moneda alocării. Lipsă = MDL (compatibil cu codurile create înainte de migrarea 0147). */
  currency: z.enum(BUDGET_CURRENCIES).optional(),
  payer_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
});

/** Normalizează ce vine din DB (poate fi NULL pe rândurile vechi) la o monedă cunoscută. */
function asCurrency(value: string | null | undefined): BudgetCurrency {
  const up = String(value ?? "").toUpperCase();
  return (BUDGET_CURRENCIES as readonly string[]).includes(up) ? (up as BudgetCurrency) : "MDL";
}

/**
 * Curs BNM (MDL pentru o unitate) pentru fiecare monedă cerută. Nu aruncă niciodată: dacă BNM nu
 * răspunde și nu există un curs memorat, moneda primește `null` — apelantul raportează „curs
 * indisponibil" în loc să compare EUR cu MDL (ar da un plafon de ~20× mai mic decât cel real).
 */
async function mdlRates(currencies: Iterable<string | null | undefined>): Promise<Map<BudgetCurrency, number | null>> {
  const out = new Map<BudgetCurrency, number | null>();
  for (const raw of currencies) {
    const cur = asCurrency(raw);
    if (out.has(cur)) continue;
    if (cur === "MDL") { out.set(cur, 1); continue; }
    try {
      out.set(cur, await getMdlRate(cur));
    } catch {
      out.set(cur, null);
    }
  }
  return out;
}

/**
 * Alocarea unui cod, exprimată în MDL — baza de comparație cu cheltuielile (care sunt însumate în
 * MDL). `null` = nu se poate compara (curs indisponibil pentru o alocare în valută).
 */
function allocationInMdl(allocatedCents: number, rate: number | null): number | null {
  if (!allocatedCents) return 0;
  if (rate == null) return null;
  return Math.round(allocatedCents * rate);
}

/** GET — list all active budget codes */
parBudgetCodesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const payerId = c.req.query("payer_id");
  const projectId = c.req.query("project_id");
  const scope = await accessibleProjectIds(user.id, tenantId, user.role);
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  if (!entitledPayers.length) return c.json({ budgetCodes: [] });
  if (projectId && scope !== null && !scope.includes(projectId)) return c.json({ budgetCodes: [] });
  const conditions = [eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.active, true), inArray(parBudgetCodes.payerId, entitledPayers)];
  if (payerId) conditions.push(eq(parBudgetCodes.payerId, payerId));
  if (projectId) {
    const projectCodes = or(eq(parBudgetCodes.projectId, projectId), sql`${parBudgetCodes.projectId} IS NULL`);
    if (projectCodes) conditions.push(projectCodes);
  } else if (scope !== null && scope.length) {
    const payerRows = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
      eq(parProjects.tenantId, tenantId), inArray(parProjects.id, scope),
    ));
    const payerIds = [...new Set(payerRows.map((row) => row.payerId).filter((id): id is string => !!id))];
    const scopedCodes = or(
      inArray(parBudgetCodes.projectId, scope),
      ...(payerIds.length ? [and(sql`${parBudgetCodes.projectId} IS NULL`, inArray(parBudgetCodes.payerId, payerIds))] : [])
    );
    if (scopedCodes) conditions.push(scopedCodes);
  } else if (scope !== null) {
    conditions.push(eq(parBudgetCodes.id, "00000000-0000-0000-0000-000000000000"));
  }
  const rows = await db
    .select()
    .from(parBudgetCodes)
    .where(and(...conditions))
    .orderBy(asc(parBudgetCodes.code));
  return c.json({ budgetCodes: rows });
});

/**
 * GET /:id/balance — budget availability for a single code.
 *
 * committedCents = sum of totalEstimatedCents for PARs whose status is one of:
 *   pending_approval | approved | in_finance | reapproval_required | changes_requested
 * spentCents = sum of totalEstimatedCents for PARs with status=paid
 * availableCents = allocatedCents - committedCents - spentCents
 *
 * Paid values use the actual finance amount when available and fall back to the estimate.
 */
// VF-202: statuses counted as "committed" (in-flight, not yet paid).
const COMMITTED_STATUSES_LIST = [
  "pending_approval",
  "approved",
  "in_finance",
  "reapproval_required",
  "changes_requested",
] as const;

/**
 * VF-202: GET /usage — budget usage for ALL codes in one call (avoids N balance requests).
 * Per code: allocated, committed (in-flight), paid, available, usedPct. approver/finance/par_admin.
 */
parBudgetCodesRoutes.get("/usage", requirePARRole("par_admin", "finance", "approver"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const scope = await accessibleProjectIds(user.id, tenantId, user.role);
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  if (!entitledPayers.length) return c.json({ usage: [] });
  if (scope !== null && scope.length === 0) return c.json({ usage: [] });
  const codeConditions = [eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.active, true), inArray(parBudgetCodes.payerId, entitledPayers)];
  if (scope !== null) {
    const payerRows = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
      eq(parProjects.tenantId, tenantId), inArray(parProjects.id, scope),
    ));
    const payerIds = [...new Set(payerRows.map((row) => row.payerId).filter((id): id is string => !!id))];
    const scopedCodes = or(
      inArray(parBudgetCodes.projectId, scope),
      ...(payerIds.length ? [and(sql`${parBudgetCodes.projectId} IS NULL`, inArray(parBudgetCodes.payerId, payerIds))] : [])
    );
    if (scopedCodes) codeConditions.push(scopedCodes);
  }

  const codes = await db
    .select()
    .from(parBudgetCodes)
    .where(and(...codeConditions))
    .orderBy(asc(parBudgetCodes.code));

  // Sumele se însumează în MDL: o cerere în EUR are `totalMdlCents` completat la trimitere, deci
  // comparația cu alocarea (convertită și ea în MDL) rămâne corectă indiferent de monede.
  const committedRows = await db
    .select({
      budgetCodeId: parRequests.budgetCodeId,
      total: sql<number>`coalesce(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})), 0)`,
    })
    .from(parRequests)
    .where(and(
      eq(parRequests.tenantId, tenantId),
      inArray(parRequests.status, [...COMMITTED_STATUSES_LIST]),
      ...(scope !== null ? [inArray(parRequests.projectId, scope)] : []),
    ))
    .groupBy(parRequests.budgetCodeId);

  const paidRows = await db
    .select({
      budgetCodeId: parRequests.budgetCodeId,
      total: sql<number>`coalesce(sum(coalesce(round(${parPayments.actualAmountCents} * coalesce(${parRequests.exchangeRate}, 1)), ${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})), 0)`,
    })
    .from(parRequests)
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(and(
      eq(parRequests.tenantId, tenantId),
      eq(parRequests.status, "paid"),
      ...(scope !== null ? [inArray(parRequests.projectId, scope)] : []),
    ))
    .groupBy(parRequests.budgetCodeId);

  const committedBy = new Map<string, number>();
  for (const r of committedRows) if (r.budgetCodeId) committedBy.set(r.budgetCodeId, Number(r.total ?? 0));
  const paidBy = new Map<string, number>();
  for (const r of paidRows) if (r.budgetCodeId) paidBy.set(r.budgetCodeId, Number(r.total ?? 0));

  const rates = await mdlRates(codes.map((code) => code.currency));

  const usage = codes.map((code) => {
    const currency = asCurrency(code.currency);
    const rate = rates.get(currency) ?? null;
    const allocatedOriginalCents = code.allocatedCents ?? 0;
    const allocatedMdl = allocationInMdl(allocatedOriginalCents, rate);
    // Curs indisponibil pentru o alocare în valută: raportăm 0 („fără plafon cunoscut") și
    // marcăm `fxUnavailable`, ca să nu apară un „buget depășit" inventat dintr-o comparație greșită.
    const allocatedCents = allocatedMdl ?? 0;
    const committedCents = committedBy.get(code.id) ?? 0;
    const paidCents = paidBy.get(code.id) ?? 0;
    const usedCents = committedCents + paidCents;
    return {
      id: code.id,
      code: code.code,
      name: code.name,
      currency,
      rate,
      fxUnavailable: allocatedMdl === null,
      allocatedOriginalCents,
      allocatedCents,
      committedCents,
      paidCents,
      availableCents: allocatedCents - usedCents,
      usedCents,
      usedPct: allocatedCents > 0 ? Math.round((usedCents / allocatedCents) * 100) : null,
    };
  });

  return c.json({ usage });
});

parBudgetCodesRoutes.get("/:id/balance", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");

  const [code] = await db
    .select()
    .from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)));
  if (!code) return c.json({ error: "not_found" }, 404);
  if (!(await hasPayerModuleEntitlement(user.id, tenantId, code.payerId, "par"))) return c.json({ error: "not_found" }, 404);
  // A project code needs project scope; a payer-wide code (projectId null) needs payer scope —
  // otherwise a user scoped to payer A could read payer B's payer-wide code balance by id (PARQA).
  const balanceInScope = code.projectId
    ? await mayAccessProject(user.id, tenantId, code.projectId, user.role)
    : await mayAccessPayer(user.id, tenantId, code.payerId, user.role);
  if (!balanceInScope) return c.json({ error: "not_found" }, 404);

  const COMMITTED_STATUSES = [
    "pending_approval",
    "approved",
    "in_finance",
    "reapproval_required",
    "changes_requested",
  ] as const;

  // Committed: sum of estimated amounts for in-flight PARs
  const committedRows = await db
    .select({ total: sql<number>`coalesce(sum(coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})), 0)` })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.budgetCodeId, id),
        inArray(parRequests.status, [...COMMITTED_STATUSES])
      )
    );
  const committedCents =
    typeof committedRows[0]?.total === "number"
      ? committedRows[0].total
      : Number(committedRows[0]?.total ?? 0);

  // Spent: sum of estimated amounts for paid PARs
  const spentRows = await db
    .select({ total: sql<number>`coalesce(sum(coalesce(round(${parPayments.actualAmountCents} * coalesce(${parRequests.exchangeRate}, 1)), ${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})), 0)` })
    .from(parRequests)
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.budgetCodeId, id),
        eq(parRequests.status, "paid")
      )
    );
  const spentCents =
    typeof spentRows[0]?.total === "number"
      ? spentRows[0].total
      : Number(spentRows[0]?.total ?? 0);

  // Alocarea se ține în moneda liniei de buget, cheltuielile sunt însumate în MDL — comparația se
  // face după conversia alocării la cursul BNM. `?currency=` (moneda cererii care se completează)
  // primește și ea cursul, ca formularul să-și convertească propriul total fără un al doilea apel.
  const currency = asCurrency(code.currency);
  const requestCurrencyRaw = c.req.query("currency");
  const rates = await mdlRates([currency, ...(requestCurrencyRaw ? [requestCurrencyRaw] : [])]);
  const rate = rates.get(currency) ?? null;
  const allocatedOriginalCents = code.allocatedCents ?? 0;
  const allocatedMdl = allocationInMdl(allocatedOriginalCents, rate);
  const allocatedCents = allocatedMdl ?? 0;
  const availableCents = allocatedCents - committedCents - spentCents;

  return c.json({
    currency,
    rate,
    fxUnavailable: allocatedMdl === null,
    allocatedOriginalCents,
    /** Alocarea rămasă, exprimată în moneda liniei (pentru afișare lângă suma alocată). */
    availableOriginalCents: rate ? Math.round(availableCents / rate) : availableCents,
    requestRate: requestCurrencyRaw ? rates.get(asCurrency(requestCurrencyRaw)) ?? null : null,
    allocatedCents,
    committedCents,
    spentCents,
    availableCents,
  });
});

/** POST — create */
parBudgetCodesRoutes.post(
  "/",
  requirePARRole("requestor", "approver", "finance", "par_admin"),
  zValidator("json", codeSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");
    let payerId = body.payer_id ?? null;
    if (!(await mayAccessProject(user.id, tenantId, body.project_id, user.role))) {
      return c.json({ error: "forbidden_project" }, 403);
    }
    if (body.project_id) {
      const [project] = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
        eq(parProjects.id, body.project_id), eq(parProjects.tenantId, tenantId),
      ));
      if (!project) return c.json({ error: "project_not_found" }, 404);
      if (body.payer_id && project.payerId && body.payer_id !== project.payerId) {
        return c.json({ error: "project_not_in_payer" }, 400);
      }
      payerId = payerId ?? project.payerId;
    }
    payerId = payerId ?? (await enabledPayerIds(tenantId, "par"))[0] ?? null;
    if (!payerId) return c.json({ error: "payer_required" }, 400);
    // A budget code IS the accounting key — two rows with the same code under one payer make
    // every "spend by budget code" figure ambiguous, and the create-form's inline "add code"
    // made it easy to mint one by accident. Match case-insensitively: "A-01" and "a-01" are
    // the same line to a finance officer.
    const [duplicate] = await db
      .select({ id: parBudgetCodes.id })
      .from(parBudgetCodes)
      .where(and(
        eq(parBudgetCodes.tenantId, tenantId),
        eq(parBudgetCodes.payerId, payerId),
        ilike(parBudgetCodes.code, body.code.trim()),
      ));
    if (duplicate) {
      return c.json({ error: "duplicate_code", message: `Codul de buget „${body.code}" există deja.` }, 409);
    }
    if (!(await mayAccessPayer(user.id, tenantId, payerId, user.role))) return c.json({ error: "forbidden_payer" }, 403);
    if (!(await hasPayerModuleEntitlement(user.id, tenantId, payerId, "par"))) return c.json({ error: "module_disabled", module: "par" }, 403);
    const [row] = await db
      .insert(parBudgetCodes)
      .values({
        tenantId,
        code: body.code,
        name: body.name,
        active: body.active ?? true,
        allocatedCents: body.allocatedCents ?? 0,
        currency: body.currency ?? "MDL",
        payerId,
        projectId: body.project_id ?? null,
      })
      .returning();
    await writeAuditLog({
      tenantId,
      actorId: user.id,
      actionType: "par_budget_code_created",
      targetType: "par_budget_code",
      targetId: row.id,
      newValue: row,
      ipAddress: clientIp(c),
    });
    return c.json(row, 201);
  }
);

/** PATCH /:id */
parBudgetCodesRoutes.patch(
  "/:id{[0-9a-fA-F-]{36}}",
  requirePARRole("par_admin"),
  zValidator("json", codeSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [existing] = await db.select().from(parBudgetCodes).where(and(
      eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId),
    ));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const projectId = body.project_id !== undefined ? body.project_id : existing.projectId;
    let payerId = body.payer_id !== undefined ? body.payer_id : existing.payerId;
    if (!(await mayAccessProject(user.id, tenantId, projectId, user.role))) return c.json({ error: "forbidden_project" }, 403);
    if (projectId) {
      const [project] = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
        eq(parProjects.id, projectId), eq(parProjects.tenantId, tenantId),
      ));
      if (!project) return c.json({ error: "project_not_found" }, 404);
      if (payerId && project.payerId && payerId !== project.payerId) return c.json({ error: "project_not_in_payer" }, 400);
      payerId = payerId ?? project.payerId;
    }
    if (!payerId) return c.json({ error: "payer_required" }, 400);
    if (!(await mayAccessPayer(user.id, tenantId, payerId, user.role))) return c.json({ error: "forbidden_payer" }, 403);
    if (!(await hasPayerModuleEntitlement(user.id, tenantId, payerId, "par"))) return c.json({ error: "module_disabled", module: "par" }, 403);
    const update = {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.allocatedCents !== undefined ? { allocatedCents: body.allocatedCents } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.payer_id !== undefined || (!!projectId && !existing.payerId) ? { payerId } : {}),
      ...(body.project_id !== undefined ? { projectId: body.project_id } : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(parBudgetCodes)
      .set(update)
      .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)))
      .returning();
    await writeAuditLog({
      tenantId,
      actorId: user.id,
      actionType: "par_budget_code_updated",
      targetType: "par_budget_code",
      targetId: id,
      oldValue: existing,
      newValue: row,
      ipAddress: clientIp(c),
    });
    return c.json(row);
  }
);

/** DELETE /:id — soft delete */
parBudgetCodesRoutes.delete("/:id{[0-9a-fA-F-]{36}}", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  const [existing] = await db.select().from(parBudgetCodes)
    .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (!(await mayAccessPayer(user.id, tenantId, existing.payerId, user.role)) ||
      !(await mayAccessProject(user.id, tenantId, existing.projectId, user.role))) {
    return c.json({ error: "not_found" }, 404);
  }
  const [row] = await db
    .update(parBudgetCodes)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parBudgetCodes.id, id), eq(parBudgetCodes.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "par_budget_code_deactivated",
    targetType: "par_budget_code",
    targetId: id,
    oldValue: existing,
    newValue: row,
    ipAddress: clientIp(c),
  });
  return c.json({ ok: true });
});
