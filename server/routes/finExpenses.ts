/**
 * SPEND-002: FinDesk — API Cheltuieli (Expenses)
 *
 * Mounted at /api/fin (shared with other fin routes).
 *
 * Routes:
 *   GET    /api/fin/expenses              — lista paginată (filter: category, status, source, dateFrom, dateTo)
 *   POST   /api/fin/expenses              — creare cheltuială (vat_deductible OBLIGATORIU)
 *   GET    /api/fin/expenses/categories   — lista categorii cu etichete RO (mai specific — înaintea /:id)
 *   GET    /api/fin/expenses/summary      — totale pe categorie + TVA deductibil (mai specific — înaintea /:id)
 *   GET    /api/fin/expenses/:id          — detaliu cheltuială
 *   PUT    /api/fin/expenses/:id          — actualizare (doar draft/rejected)
 *   DELETE /api/fin/expenses/:id          — marcare rejected (soft-delete)
 *   POST   /api/fin/expenses/:id/approve  — aprobare cheltuială (mai specific — înaintea /:id)
 *
 * Regula #1 FIN-CORE: vat_deductible OBLIGATORIU la creare.
 * Dacă lipsește → 400 "vat_deductible_required".
 *
 * Tenant safety: TOATE rutele filtrează strict după user.tenantId.
 * Niciun cross-tenant leak.
 *
 * Route registration order (CLAUDE.md §3.5.1, Hono pattern):
 * Rute specifice (/categories, /summary, /:id/approve) ÎNAINTE de /:id generic.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "../db/client";
import {
  finExpenses,
  FIN_EXPENSE_CATEGORY_LABELS,
  type FinExpense,
} from "../db/schema/finExpenses";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finExpensesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finExpensesRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const createExpenseSchema = z.object({
  category: z.enum([
    "rent",
    "utilities",
    "salaries",
    "marketing",
    "supplies",
    "software",
    "maintenance",
    "other",
  ]),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional().default("MDL"),
  // REGULA #1: vat_deductible este REQUIRED explicit
  vatDeductible: z
    .boolean({
      required_error: "vat_deductible_required",
      invalid_type_error: "vat_deductible must be boolean",
    }),
  vatAmountCents: z.number().int().min(0).optional().default(0),
  source: z
    .enum(["manual", "capture", "payroll", "asset"])
    .optional()
    .default("manual"),
  description: z.string().max(2000).optional(),
  reference: z.string().max(100).optional(),
  vendorName: z.string().max(200).optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD required"),
});

const updateExpenseSchema = createExpenseSchema.partial().omit({ vatDeductible: true }).extend({
  vatDeductible: z.boolean().optional(),
});

// ─── Helper: serialize expense row ────────────────────────────────────────────

function serializeExpense(r: FinExpense) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    category: r.category,
    amountCents: r.amountCents,
    currency: r.currency,
    vatDeductible: r.vatDeductible,
    vatAmountCents: r.vatAmountCents,
    source: r.source,
    status: r.status,
    description: r.description,
    reference: r.reference,
    vendorName: r.vendorName,
    expenseDate: r.expenseDate,
    paidAt: r.paidAt?.toISOString() ?? null,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ─── GET /api/fin/expenses/categories ─────────────────────────────────────────
// NOTE: must be registered BEFORE /:id to avoid Hono param-shadow

finExpensesRoutes.get("/expenses/categories", (c) => {
  const categories = (
    Object.entries(FIN_EXPENSE_CATEGORY_LABELS) as [string, string][]
  ).map(([value, label]) => ({ value, label }));
  return c.json({ items: categories });
});

// ─── GET /api/fin/expenses/summary ────────────────────────────────────────────
// NOTE: must be registered BEFORE /:id

finExpensesRoutes.get("/expenses/summary", async (c) => {
  const user = c.get("user");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");

  const conditions = [eq(finExpenses.tenantId, user.tenantId)];
  if (dateFrom) conditions.push(gte(finExpenses.expenseDate, dateFrom));
  if (dateTo) conditions.push(lte(finExpenses.expenseDate, dateTo));

  // Totale per categorie
  const rows = await db
    .select({
      category: finExpenses.category,
      totalCents: sum(finExpenses.amountCents),
      vatDeductibleCents: sql<number>`
        SUM(CASE WHEN ${finExpenses.vatDeductible} = true THEN ${finExpenses.vatAmountCents} ELSE 0 END)
      `,
    })
    .from(finExpenses)
    .where(and(...conditions))
    .groupBy(finExpenses.category)
    .orderBy(asc(finExpenses.category));

  const byCategory = rows.map((r) => ({
    category: r.category,
    label: FIN_EXPENSE_CATEGORY_LABELS[r.category],
    totalCents: Number(r.totalCents ?? 0),
    vatDeductibleCents: Number(r.vatDeductibleCents ?? 0),
  }));

  const vatDeductibleTotal = byCategory.reduce(
    (acc, r) => acc + r.vatDeductibleCents,
    0
  );
  const grandTotalCents = byCategory.reduce((acc, r) => acc + r.totalCents, 0);

  return c.json({ byCategory, vatDeductibleTotal, grandTotalCents });
});

// ─── GET /api/fin/expenses ────────────────────────────────────────────────────

finExpensesRoutes.get("/expenses", async (c) => {
  const user = c.get("user");
  const categoryParam = c.req.query("category");
  const statusParam = c.req.query("status");
  const sourceParam = c.req.query("source");
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Number(c.req.query("offset") ?? 0);

  const conditions = [eq(finExpenses.tenantId, user.tenantId)];

  if (categoryParam) {
    conditions.push(
      eq(finExpenses.category, categoryParam as FinExpense["category"])
    );
  }
  if (statusParam) {
    conditions.push(
      eq(finExpenses.status, statusParam as FinExpense["status"])
    );
  }
  if (sourceParam) {
    conditions.push(
      eq(finExpenses.source, sourceParam as FinExpense["source"])
    );
  }
  if (dateFrom) conditions.push(gte(finExpenses.expenseDate, dateFrom));
  if (dateTo) conditions.push(lte(finExpenses.expenseDate, dateTo));

  const rows = await db
    .select()
    .from(finExpenses)
    .where(and(...conditions))
    .orderBy(desc(finExpenses.expenseDate), desc(finExpenses.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ items: rows.map(serializeExpense) });
});

// ─── POST /api/fin/expenses ───────────────────────────────────────────────────

finExpensesRoutes.post(
  "/expenses",
  async (c) => {
    const user = c.get("user");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // REGULA #1: vat_deductible OBLIGATORIU
    if (
      body === null ||
      typeof body !== "object" ||
      !("vatDeductible" in body)
    ) {
      return c.json({ error: "vat_deductible_required" }, 400);
    }

    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      // Surface vat_deductible_required specifically
      const hasVatError = parsed.error.issues.some(
        (i) => i.path.includes("vatDeductible") || i.message === "vat_deductible_required"
      );
      if (hasVatError) {
        return c.json({ error: "vat_deductible_required" }, 400);
      }
      return c.json({ error: "validation_error", issues: parsed.error.issues }, 400);
    }

    const data = parsed.data;
    const now = new Date();

    const [row] = await db
      .insert(finExpenses)
      .values({
        tenantId: user.tenantId,
        category: data.category,
        amountCents: data.amountCents,
        currency: data.currency,
        vatDeductible: data.vatDeductible,
        vatAmountCents: data.vatAmountCents,
        source: data.source,
        status: "draft",
        description: data.description ?? null,
        reference: data.reference ?? null,
        vendorName: data.vendorName ?? null,
        expenseDate: data.expenseDate,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ data: serializeExpense(row) }, 201);
  }
);

// ─── POST /api/fin/expenses/:id/approve ──────────────────────────────────────
// NOTE: must be registered BEFORE GET /:id

finExpensesRoutes.post("/expenses/:id/approve", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finExpenses)
    .where(and(eq(finExpenses.id, id), eq(finExpenses.tenantId, user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const expense = rows[0];

  if (expense.status === "approved" || expense.status === "paid") {
    return c.json({ error: "already_approved", status: expense.status }, 409);
  }

  const now = new Date();
  const [updated] = await db
    .update(finExpenses)
    .set({
      status: "approved",
      approvedBy: user.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(finExpenses.id, id))
    .returning();

  return c.json({ data: serializeExpense(updated) });
});

// ─── GET /api/fin/expenses/:id ────────────────────────────────────────────────

finExpensesRoutes.get("/expenses/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finExpenses)
    .where(and(eq(finExpenses.id, id), eq(finExpenses.tenantId, user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ data: serializeExpense(rows[0]) });
});

// ─── PUT /api/fin/expenses/:id ────────────────────────────────────────────────

finExpensesRoutes.put(
  "/expenses/:id",
  zValidator("json", updateExpenseSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const rows = await db
      .select()
      .from(finExpenses)
      .where(and(eq(finExpenses.id, id), eq(finExpenses.tenantId, user.tenantId)))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: "not_found" }, 404);
    }

    const expense = rows[0];

    // Only editable when draft or rejected
    if (expense.status !== "draft" && expense.status !== "rejected") {
      return c.json(
        {
          error: "not_editable",
          detail: `Cheltuiala în status ${expense.status} nu poate fi modificată.`,
        },
        409
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(finExpenses)
      .set({
        ...body,
        updatedAt: now,
      })
      .where(eq(finExpenses.id, id))
      .returning();

    return c.json({ data: serializeExpense(updated) });
  }
);

// ─── DELETE /api/fin/expenses/:id ────────────────────────────────────────────
// Soft-delete: marcare ca rejected (nu ștergere fizică)

finExpensesRoutes.delete("/expenses/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finExpenses)
    .where(and(eq(finExpenses.id, id), eq(finExpenses.tenantId, user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const now = new Date();
  const [updated] = await db
    .update(finExpenses)
    .set({ status: "rejected", updatedAt: now })
    .where(eq(finExpenses.id, id))
    .returning();

  return c.json({ data: serializeExpense(updated) });
});
