/**
 * BUDGET-002: Rute gestionare bugete FinDesk
 * Montare: app.route("/api/fin/budget", finBudgetRoutes)
 *
 * Endpoints:
 *   GET  /                      — lista bugete tenant (filtre: status, fiscal_year)
 *   POST /                      — creare buget nou (cu linii opționale)
 *   GET  /:id                   — detaliu buget + linii
 *   PUT  /:id                   — actualizare antet buget
 *   POST /:id/lines             — adaugă linie
 *   PATCH /:id/lines/:lineId    — actualizează linie
 *   DELETE /:id/lines/:lineId   — șterge linie
 *   GET  /:id/report            — buget vs realizat per linie/categorie
 *   POST /:id/check-alerts      — verifică alerte depășire și trimite notificări
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import { finBudgets, finBudgetLines } from "../db/schema/finBudgets";
import { inAppNotifications } from "../db/schema/inAppNotifications";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finBudgetRoutes = new Hono<{ Variables: AuthVariables }>();

finBudgetRoutes.use("*", requireAuth);

// ─── Validare ────────────────────────────────────────────────────────────────

const createBudgetSchema = z.object({
  name: z.string().min(1).max(200),
  fiscalYear: z.number().int().min(2020).max(2100),
  department: z.string().max(100).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "active", "closed"]).default("draft"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        category: z.string().min(1).max(50),
        label: z.string().min(1).max(200),
        budgetedCents: z.number().int().min(0).default(0),
        displayOrder: z.number().int().default(0),
      })
    )
    .optional(),
});

const updateBudgetSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  department: z.string().max(100).optional().nullable(),
  status: z.enum(["draft", "active", "closed"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const createLineSchema = z.object({
  category: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  budgetedCents: z.number().int().min(0).default(0),
  displayOrder: z.number().int().default(0),
});

const updateLineSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  budgetedCents: z.number().int().min(0).optional(),
  displayOrder: z.number().int().optional(),
});

// ─── GET / ────────────────────────────────────────────────────────────────────

finBudgetRoutes.get(
  "/",
  zValidator(
    "query",
    z.object({
      status: z.enum(["draft", "active", "closed"]).optional(),
      fiscalYear: z.coerce.number().int().optional(),
    })
  ),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { status, fiscalYear } = c.req.valid("query");

    const conditions = [eq(finBudgets.tenantId, tenantId)];
    if (status) conditions.push(eq(finBudgets.status, status));
    if (fiscalYear) conditions.push(eq(finBudgets.fiscalYear, fiscalYear));

    const budgets = await db
      .select()
      .from(finBudgets)
      .where(and(...conditions))
      .orderBy(finBudgets.fiscalYear, finBudgets.createdAt);

    return c.json({ budgets });
  }
);

// ─── POST / ───────────────────────────────────────────────────────────────────

finBudgetRoutes.post(
  "/",
  zValidator("json", createBudgetSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const userId = c.get("user").id;
    const body = c.req.valid("json");

    const [budget] = await db
      .insert(finBudgets)
      .values({
        tenantId,
        name: body.name,
        fiscalYear: body.fiscalYear,
        department: body.department ?? null,
        branchId: body.branchId ?? null,
        status: body.status,
        notes: body.notes ?? null,
        createdBy: userId,
      })
      .returning();

    if (body.lines && body.lines.length > 0) {
      await db.insert(finBudgetLines).values(
        body.lines.map((l) => ({
          tenantId,
          budgetId: budget.id,
          category: l.category,
          label: l.label,
          budgetedCents: l.budgetedCents,
          displayOrder: l.displayOrder,
        }))
      );
    }

    const lines = await db
      .select()
      .from(finBudgetLines)
      .where(eq(finBudgetLines.budgetId, budget.id))
      .orderBy(finBudgetLines.displayOrder);

    return c.json({ budget, lines }, 201);
  }
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────

finBudgetRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  const [budget] = await db
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)));

  if (!budget) return c.json({ error: "Budget not found" }, 404);

  const lines = await db
    .select()
    .from(finBudgetLines)
    .where(eq(finBudgetLines.budgetId, id))
    .orderBy(finBudgetLines.displayOrder, finBudgetLines.createdAt);

  return c.json({ budget, lines });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

finBudgetRoutes.put(
  "/:id",
  zValidator("json", updateBudgetSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: finBudgets.id })
      .from(finBudgets)
      .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)));

    if (!existing) return c.json({ error: "Budget not found" }, 404);

    const [updated] = await db
      .update(finBudgets)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.department !== undefined && { department: body.department }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        updatedAt: new Date(),
      })
      .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)))
      .returning();

    return c.json({ budget: updated });
  }
);

// ─── POST /:id/lines ──────────────────────────────────────────────────────────

finBudgetRoutes.post(
  "/:id/lines",
  zValidator("json", createLineSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const [budget] = await db
      .select({ id: finBudgets.id })
      .from(finBudgets)
      .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)));

    if (!budget) return c.json({ error: "Budget not found" }, 404);

    const [line] = await db
      .insert(finBudgetLines)
      .values({
        tenantId,
        budgetId: id,
        category: body.category,
        label: body.label,
        budgetedCents: body.budgetedCents,
        displayOrder: body.displayOrder,
      })
      .returning();

    return c.json({ line }, 201);
  }
);

// ─── PATCH /:id/lines/:lineId ─────────────────────────────────────────────────

finBudgetRoutes.patch(
  "/:id/lines/:lineId",
  zValidator("json", updateLineSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id, lineId } = c.req.param();
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: finBudgetLines.id })
      .from(finBudgetLines)
      .where(
        and(
          eq(finBudgetLines.id, lineId),
          eq(finBudgetLines.budgetId, id),
          eq(finBudgetLines.tenantId, tenantId)
        )
      );

    if (!existing) return c.json({ error: "Line not found" }, 404);

    const [updated] = await db
      .update(finBudgetLines)
      .set({
        ...(body.label !== undefined && { label: body.label }),
        ...(body.budgetedCents !== undefined && { budgetedCents: body.budgetedCents }),
        ...(body.displayOrder !== undefined && { displayOrder: body.displayOrder }),
      })
      .where(and(eq(finBudgetLines.id, lineId), eq(finBudgetLines.tenantId, tenantId)))
      .returning();

    return c.json({ line: updated });
  }
);

// ─── DELETE /:id/lines/:lineId ────────────────────────────────────────────────

finBudgetRoutes.delete("/:id/lines/:lineId", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id, lineId } = c.req.param();

  const [existing] = await db
    .select({ id: finBudgetLines.id })
    .from(finBudgetLines)
    .where(
      and(
        eq(finBudgetLines.id, lineId),
        eq(finBudgetLines.budgetId, id),
        eq(finBudgetLines.tenantId, tenantId)
      )
    );

  if (!existing) return c.json({ error: "Line not found" }, 404);

  await db
    .delete(finBudgetLines)
    .where(and(eq(finBudgetLines.id, lineId), eq(finBudgetLines.tenantId, tenantId)));

  return c.json({ ok: true });
});

// ─── GET /:id/report ──────────────────────────────────────────────────────────
// Buget vs realizat: compară liniile de buget cu cheltuielile reale per categorie.
// fin_expenses poate fi absent (SPEND pe branch separat) → actualCents = 0.

finBudgetRoutes.get("/:id/report", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  const [budget] = await db
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)));

  if (!budget) return c.json({ error: "Budget not found" }, 404);

  const lines = await db
    .select()
    .from(finBudgetLines)
    .where(eq(finBudgetLines.budgetId, id))
    .orderBy(finBudgetLines.displayOrder);

  // Intervalul fiscal: 1 ian → 31 dec al anului fiscal
  const yearStart = new Date(`${budget.fiscalYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${budget.fiscalYear}-12-31T23:59:59.999Z`);

  // Interogăm fin_expenses dacă există (soft dependency — SPEND pe branch separat)
  // Dacă tabela nu există, returnăm actualCents = 0 pentru toate liniile.
  let actuals: Map<string, number> = new Map();
  try {
    const expenseRows = await db.execute(
      sql`
        SELECT category, SUM(amount_cents)::bigint AS total
        FROM fin_expenses
        WHERE tenant_id = ${tenantId}
          AND status IN ('approved', 'paid')
          AND expense_date >= ${yearStart.toISOString().slice(0, 10)}
          AND expense_date <= ${yearEnd.toISOString().slice(0, 10)}
        GROUP BY category
      `
    );
    // Portability: Array.isArray (PGlite) or .rows (Postgres)
    const rows = Array.isArray(expenseRows) ? expenseRows : (expenseRows as { rows?: unknown[] }).rows ?? [];
    for (const row of rows as Array<{ category: string; total: string | number }>) {
      actuals.set(row.category, Number(row.total));
    }
  } catch {
    // fin_expenses not available (SPEND not merged) — actuals = 0
    actuals = new Map();
  }

  const reportLines = lines.map((line) => {
    const actualCents = actuals.get(line.category) ?? 0;
    const remainingCents = line.budgetedCents - actualCents;
    const pct =
      line.budgetedCents > 0
        ? Math.round((actualCents / line.budgetedCents) * 1000) / 10
        : null;
    return {
      id: line.id,
      category: line.category,
      label: line.label,
      budgetedCents: line.budgetedCents,
      actualCents,
      remainingCents,
      pct,
      displayOrder: line.displayOrder,
    };
  });

  const totalBudgetedCents = lines.reduce((s, l) => s + l.budgetedCents, 0);
  const totalActualCents = reportLines.reduce((s, l) => s + l.actualCents, 0);

  return c.json({
    budget,
    lines: reportLines,
    totalBudgetedCents,
    totalActualCents,
    totalRemainingCents: totalBudgetedCents - totalActualCents,
  });
});

// ─── POST /:id/check-alerts ───────────────────────────────────────────────────
// Verifică depășiri de buget și creează notificări interne.
// budget_warning_80: linie la 80-99% din buget
// budget_overrun: linie la ≥ 100% din buget
// Nu se duplică notificările identice în ultimele 24h.

finBudgetRoutes.post("/:id/check-alerts", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  const [budget] = await db
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.id, id), eq(finBudgets.tenantId, tenantId)));

  if (!budget) return c.json({ error: "Budget not found" }, 404);

  const lines = await db
    .select()
    .from(finBudgetLines)
    .where(eq(finBudgetLines.budgetId, id));

  const yearStart = new Date(`${budget.fiscalYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${budget.fiscalYear}-12-31T23:59:59.999Z`);

  let actuals: Map<string, number> = new Map();
  try {
    const expenseRows = await db.execute(
      sql`
        SELECT category, SUM(amount_cents)::bigint AS total
        FROM fin_expenses
        WHERE tenant_id = ${tenantId}
          AND status IN ('approved', 'paid')
          AND expense_date >= ${yearStart.toISOString().slice(0, 10)}
          AND expense_date <= ${yearEnd.toISOString().slice(0, 10)}
        GROUP BY category
      `
    );
    const rows = Array.isArray(expenseRows) ? expenseRows : (expenseRows as { rows?: unknown[] }).rows ?? [];
    for (const row of rows as Array<{ category: string; total: string | number }>) {
      actuals.set(row.category, Number(row.total));
    }
  } catch {
    actuals = new Map();
  }

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alertsCreated: string[] = [];

  for (const line of lines) {
    const actualCents = actuals.get(line.category) ?? 0;
    const pct = line.budgetedCents > 0 ? (actualCents / line.budgetedCents) * 100 : 0;

    if (pct < 80) continue;

    const kind = pct >= 100 ? "budget_overrun" : "budget_warning_80";
    const bodyText =
      pct >= 100
        ? `Depășire buget: categoria „${line.label}" a atins ${pct.toFixed(1)}% din buget (${(actualCents / 100).toFixed(2)} MDL / ${(line.budgetedCents / 100).toFixed(2)} MDL).`
        : `Atenție: categoria „${line.label}" a atins ${pct.toFixed(1)}% din buget.`;

    // Verificăm dacă există deja o notificare identică în ultimele 24h
    const existing = await db
      .select({ id: inAppNotifications.id })
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.tenantId, tenantId),
          eq(inAppNotifications.recipientUserId, budget.createdBy),
          eq(inAppNotifications.kind, kind),
          gte(inAppNotifications.createdAt, cutoff24h)
        )
      );

    // Filtrăm după budget_id și line.id în payload (manual, nu prin SQL jsonb)
    const duplicate = existing.some(() => true); // simplified — real check below
    if (duplicate && existing.length > 0) {
      // Check payload pentru același budget+line (filtrare in-JS)
      const existingWithPayload = await db
        .select({ payload: inAppNotifications.payload })
        .from(inAppNotifications)
        .where(
          and(
            eq(inAppNotifications.tenantId, tenantId),
            eq(inAppNotifications.recipientUserId, budget.createdBy),
            eq(inAppNotifications.kind, kind),
            gte(inAppNotifications.createdAt, cutoff24h)
          )
        );
      const alreadyNotified = existingWithPayload.some(
        (n) =>
          (n.payload as { budget_id?: string; line_id?: string }).budget_id === id &&
          (n.payload as { budget_id?: string; line_id?: string }).line_id === line.id
      );
      if (alreadyNotified) continue;
    }

    await db.insert(inAppNotifications).values({
      tenantId,
      recipientUserId: budget.createdBy,
      kind,
      payload: {
        body: bodyText,
        budget_id: id,
        line_id: line.id,
      } as unknown as import("../db/schema/inAppNotifications").InAppNotificationPayload,
    });

    alertsCreated.push(`${kind}:${line.category}`);
  }

  return c.json({ alertsCreated, count: alertsCreated.length });
});
