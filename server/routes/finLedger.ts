/**
 * LEDGER-001/002/003/004: General Ledger routes for FinDesk
 *
 * Routes (LEDGER-001):
 *   GET  /api/fin/ledger/accounts            — list chart of accounts (filterable by class, active)
 *   GET  /api/fin/ledger/trial-balance       — enhanced: debit/credit sum + isBalanced per account
 *   POST /api/fin/ledger/accounts/seed       — seed standard SNC accounts (idempotent)
 *
 * Routes (LEDGER-002):
 *   POST /api/fin/ledger/post                — create any balanced double-entry journal posting
 *   POST /api/fin/ledger/post-payment/:id    — quick-post from a payment (idempotent)
 *   GET  /api/fin/ledger/entries             — paginated journal entries list
 *
 * Routes (LEDGER-003):
 *   POST /api/fin/ledger/post-payroll/:id    — auto-post salary entry Debit 811 / Credit 531
 *   POST /api/fin/ledger/post-depreciation   — post asset depreciation Debit 713 / Credit 121|124
 *   GET  /api/fin/ledger/reconcile           — compare GL entries vs source tables (payments, payroll)
 *
 * Routes (LEDGER-004):
 *   GET  /api/fin/ledger/account/:code       — carte mare: all movements for one account with running balance
 *
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - GAP-ANALYSIS G1: real double-entry accounting — sum(debit)==sum(credit) enforced.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, lt, sum, count, inArray, asc, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  finLedgerAccounts,
  finJournalEntries,
  finJournalLines,
} from "../db/schema/finLedger";
import { payments } from "../db/schema/payments";
import { payrollEntries } from "../db/schema/payroll";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { seedLedgerAccounts } from "../lib/finLedgerSeed";

export const finLedgerRoutes = new Hono<{ Variables: AuthVariables }>();

finLedgerRoutes.use("*", requireAuth);

// ─── GET /accounts ─────────────────────────────────────────────────────────────

const accountsQuerySchema = z.object({
  /** Filter by account class: A, P, V, C, B */
  class: z.string().max(1).optional(),
  /** Filter by active status (default: all) */
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

finLedgerRoutes.get(
  "/accounts",
  zValidator("query", accountsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { class: accountClass, active } = c.req.valid("query");

    const filters = [eq(finLedgerAccounts.tenantId, tenantId)];

    if (accountClass) {
      filters.push(eq(finLedgerAccounts.accountClass, accountClass));
    }
    if (active !== undefined) {
      filters.push(eq(finLedgerAccounts.isActive, active));
    }

    const accounts = await db
      .select()
      .from(finLedgerAccounts)
      .where(and(...filters))
      .orderBy(finLedgerAccounts.code);

    return c.json({ accounts, total: accounts.length }, 200);
  }
);

// ─── GET /trial-balance ────────────────────────────────────────────────────────

const trialBalanceQuerySchema = z.object({
  /** Start date inclusive (YYYY-MM-DD) */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  /** End date inclusive (YYYY-MM-DD) */
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
});

finLedgerRoutes.get(
  "/trial-balance",
  zValidator("query", trialBalanceQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { from, to } = c.req.valid("query");

    // Build date filters on journal entries
    const entryFilters = [eq(finJournalEntries.tenantId, tenantId)];
    if (from) {
      entryFilters.push(gte(finJournalEntries.entryDate, from));
    }
    if (to) {
      entryFilters.push(lte(finJournalEntries.entryDate, to));
    }

    // Get all posted journal entry IDs for this tenant + date range
    const entryIds = await db
      .select({ id: finJournalEntries.id })
      .from(finJournalEntries)
      .where(and(...entryFilters, eq(finJournalEntries.status, "posted")));

    // Also return account metadata from fin_ledger_accounts
    const allAccounts = await db
      .select()
      .from(finLedgerAccounts)
      .where(eq(finLedgerAccounts.tenantId, tenantId))
      .orderBy(finLedgerAccounts.code);

    if (entryIds.length === 0) {
      return c.json({
        accounts: allAccounts.map((a) => ({
          code: a.code,
          name: a.name,
          class: a.accountClass,
          debitTotal: 0,
          creditTotal: 0,
          netBalance: 0,
        })),
        grandDebit: 0,
        grandCredit: 0,
        isBalanced: true,
        periodFrom: from ?? null,
        periodTo: to ?? null,
      }, 200);
    }

    const entryIdList = entryIds.map((e) => e.id);

    // Aggregate debit/credit per account_code using inArray
    const aggregated = await db
      .select({
        accountCode: finJournalLines.accountCode,
        debitSum: sum(finJournalLines.debitCents),
        creditSum: sum(finJournalLines.creditCents),
      })
      .from(finJournalLines)
      .where(inArray(finJournalLines.entryId, entryIdList))
      .groupBy(finJournalLines.accountCode);

    // Build a map of account_code → aggregated amounts
    const aggMap = new Map<string, { debitTotal: number; creditTotal: number }>();
    for (const r of aggregated) {
      aggMap.set(r.accountCode, {
        debitTotal: Number(r.debitSum ?? 0),
        creditTotal: Number(r.creditSum ?? 0),
      });
    }

    // Merge with chart of accounts
    const accounts = allAccounts.map((a) => {
      const agg = aggMap.get(a.code) ?? { debitTotal: 0, creditTotal: 0 };
      return {
        code: a.code,
        name: a.name,
        class: a.accountClass,
        debitTotal: agg.debitTotal,
        creditTotal: agg.creditTotal,
        netBalance: agg.debitTotal - agg.creditTotal,
      };
    });

    const grandDebit = accounts.reduce((s, a) => s + a.debitTotal, 0);
    const grandCredit = accounts.reduce((s, a) => s + a.creditTotal, 0);

    return c.json({
      accounts,
      grandDebit,
      grandCredit,
      isBalanced: grandDebit === grandCredit,
      periodFrom: from ?? null,
      periodTo: to ?? null,
    }, 200);
  }
);

// ─── POST /accounts/seed ──────────────────────────────────────────────────────
// Seed the standard SNC chart of accounts for the current tenant.
// Idempotent — returns inserted count (0 if already seeded).

finLedgerRoutes.post("/accounts/seed", async (c) => {
  const user = c.get("user");
  const inserted = await seedLedgerAccounts(user.tenantId);
  return c.json({ inserted, message: inserted > 0 ? "Plan de conturi creat." : "Deja configurat." }, 200);
});

// ─── LEDGER-002: POST /post ───────────────────────────────────────────────────
// Create a balanced double-entry journal posting.
// Validates sum(debit) === sum(credit) before inserting.

const postLineSchema = z.object({
  accountCode: z.string().min(1).max(20),
  debitCents: z.number().int().min(0).default(0),
  creditCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("MDL"),
  description: z.string().max(500).optional(),
});

const postEntrySchema = z.object({
  sourceType: z.enum(["PAY", "BILL", "SPEND", "ASSET", "MANUAL"]).default("MANUAL"),
  sourceId: z.string().uuid().nullable().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD"),
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
  lines: z.array(postLineSchema).min(2, "Minimum 2 linii per înregistrare contabilă"),
});

finLedgerRoutes.post(
  "/post",
  zValidator("json", postEntrySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    // Validate double-entry balance
    const totalDebit = body.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = body.lines.reduce((s, l) => s + l.creditCents, 0);

    if (totalDebit !== totalCredit) {
      return c.json(
        {
          error: "unbalanced entry",
          totalDebit,
          totalCredit,
          difference: totalDebit - totalCredit,
        },
        400
      );
    }

    // Insert journal entry
    const [entry] = await db
      .insert(finJournalEntries)
      .values({
        tenantId,
        entryDate: body.entryDate,
        description: body.description,
        reference: body.reference,
        sourceType: body.sourceType,
        sourceId: body.sourceId ?? null,
        status: "posted",
        createdBy: user.id,
      })
      .returning({ id: finJournalEntries.id });

    // Insert journal lines
    await db.insert(finJournalLines).values(
      body.lines.map((l) => ({
        entryId: entry.id,
        accountCode: l.accountCode,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        currency: l.currency,
        description: l.description,
      }))
    );

    return c.json({ entryId: entry.id, lineCount: body.lines.length }, 201);
  }
);

// ─── LEDGER-002: POST /post-payment/:paymentId ────────────────────────────────
// Quick-post for an existing payment: Debit 531 / Credit 711.
// Idempotent: if a PAY entry already exists for this payment, returns existing.

finLedgerRoutes.post("/post-payment/:paymentId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const paymentId = c.req.param("paymentId");

  // Check for existing entry to ensure idempotency
  const [existing] = await db
    .select({ id: finJournalEntries.id })
    .from(finJournalEntries)
    .where(
      and(
        eq(finJournalEntries.tenantId, tenantId),
        eq(finJournalEntries.sourceType, "PAY"),
        eq(finJournalEntries.sourceId, paymentId)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ entryId: existing.id, existing: true }, 200);
  }

  // Lookup payment
  const [payment] = await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      currency: payments.currency,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
    .limit(1);

  if (!payment) {
    return c.json({ error: "payment_not_found" }, 404);
  }

  const entryDate =
    payment.paidAt
      ? payment.paidAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const currency = payment.currency ?? "MDL";
  const amountCents = payment.amountCents;

  // Create double-entry: Debit 531 Numerar / Credit 711 Venituri
  const [entry] = await db
    .insert(finJournalEntries)
    .values({
      tenantId,
      entryDate,
      description: `Încasare plată #${paymentId.slice(0, 8)}`,
      reference: paymentId,
      sourceType: "PAY",
      sourceId: paymentId,
      status: "posted",
      createdBy: user.id,
    })
    .returning({ id: finJournalEntries.id });

  await db.insert(finJournalLines).values([
    {
      entryId: entry.id,
      accountCode: "531",
      debitCents: amountCents,
      creditCents: 0,
      currency,
      description: "Numerar / Bancă",
    },
    {
      entryId: entry.id,
      accountCode: "711",
      debitCents: 0,
      creditCents: amountCents,
      currency,
      description: "Venituri din prestarea serviciilor",
    },
  ]);

  return c.json({ entryId: entry.id, existing: false }, 201);
});

// ─── LEDGER-002: GET /entries ─────────────────────────────────────────────────
// Paginated journal entries list.

const entriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sourceType: z.enum(["PAY", "BILL", "SPEND", "ASSET", "MANUAL"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
});

finLedgerRoutes.get(
  "/entries",
  zValidator("query", entriesQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { page, limit, sourceType, from, to } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const filters = [
      eq(finJournalEntries.tenantId, tenantId),
      eq(finJournalEntries.status, "posted"),
    ];

    if (sourceType) {
      filters.push(eq(finJournalEntries.sourceType, sourceType));
    }
    if (from) {
      filters.push(gte(finJournalEntries.entryDate, from));
    }
    if (to) {
      filters.push(lte(finJournalEntries.entryDate, to));
    }

    const where = and(...filters);

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(finJournalEntries)
        .where(where)
        .orderBy(desc(finJournalEntries.entryDate), desc(finJournalEntries.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(finJournalEntries).where(where),
    ]);

    return c.json({ data, total: Number(total), page }, 200);
  }
);

// ─── LEDGER-003: POST /post-payroll/:payrollEntryId ───────────────────────────
// Quick-post for a salary entry: Debit 811 / Credit 531.
// Idempotent: if a SALARY entry already exists for this payrollEntryId, returns existing.

finLedgerRoutes.post("/post-payroll/:payrollEntryId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const payrollEntryId = c.req.param("payrollEntryId");

  // Idempotency check: look for existing SALARY entry for this payroll
  const [existing] = await db
    .select({ id: finJournalEntries.id })
    .from(finJournalEntries)
    .where(
      and(
        eq(finJournalEntries.tenantId, tenantId),
        eq(finJournalEntries.sourceType, "SALARY"),
        eq(finJournalEntries.sourceId, payrollEntryId)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ entryId: existing.id, existing: true }, 200);
  }

  // Lookup payroll entry
  const [payroll] = await db
    .select({
      id: payrollEntries.id,
      totalCents: payrollEntries.totalCents,
      month: payrollEntries.month,
      status: payrollEntries.status,
    })
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.id, payrollEntryId),
        eq(payrollEntries.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!payroll) {
    return c.json({ error: "payroll_entry_not_found" }, 404);
  }

  // Use last day of the month as entry date
  const [year, mon] = payroll.month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0); // day 0 of next month = last day of current month
  const entryDate = lastDay.toISOString().slice(0, 10);

  const amountCents = payroll.totalCents;

  // Double-entry: Debit 811 Cheltuieli retribuire / Credit 531 Numerar
  const [entry] = await db
    .insert(finJournalEntries)
    .values({
      tenantId,
      entryDate,
      description: `Salarii ${payroll.month} — înregistrare contabilă`,
      reference: payrollEntryId,
      sourceType: "SALARY",
      sourceId: payrollEntryId,
      status: "posted",
      createdBy: user.id,
    })
    .returning({ id: finJournalEntries.id });

  await db.insert(finJournalLines).values([
    {
      entryId: entry.id,
      accountCode: "811",
      debitCents: amountCents,
      creditCents: 0,
      currency: "MDL",
      description: "Cheltuieli privind retribuirea muncii",
    },
    {
      entryId: entry.id,
      accountCode: "531",
      debitCents: 0,
      creditCents: amountCents,
      currency: "MDL",
      description: "Numerar / Bancă — plată salarii",
    },
  ]);

  return c.json({ entryId: entry.id, existing: false }, 201);
});

// ─── LEDGER-003: POST /post-depreciation ─────────────────────────────────────
// Post monthly asset depreciation: Debit 713 / Credit 121 (fixed) or 124 (intangible).
// Idempotent: one entry per (assetRef, periodMonth).

const postDepreciationSchema = z.object({
  assetRef: z.string().min(1).max(100),
  assetType: z.enum(["fixed", "intangible"]),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Format perioadă: YYYY-MM"),
  depreciationCents: z.number().int().min(1),
  description: z.string().max(500).optional(),
});

finLedgerRoutes.post(
  "/post-depreciation",
  zValidator("json", postDepreciationSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    // Idempotency: check for existing ASSET entry with this assetRef + periodMonth as reference
    const idempotencyRef = `DEPR:${body.assetRef}:${body.periodMonth}`;

    const [existing] = await db
      .select({ id: finJournalEntries.id })
      .from(finJournalEntries)
      .where(
        and(
          eq(finJournalEntries.tenantId, tenantId),
          eq(finJournalEntries.sourceType, "ASSET"),
          eq(finJournalEntries.reference, idempotencyRef)
        )
      )
      .limit(1);

    if (existing) {
      return c.json({ entryId: existing.id, existing: true }, 200);
    }

    // Credit account: 121 for fixed assets, 124 for intangible assets
    const creditAccountCode = body.assetType === "fixed" ? "121" : "124";
    const creditAccountName =
      body.assetType === "fixed"
        ? "Amortizarea mijloacelor fixe"
        : "Amortizarea activelor nemateriale";

    // Entry date: last day of periodMonth
    const [year, mon] = body.periodMonth.split("-").map(Number);
    const lastDay = new Date(year, mon, 0);
    const entryDate = lastDay.toISOString().slice(0, 10);

    const [entry] = await db
      .insert(finJournalEntries)
      .values({
        tenantId,
        entryDate,
        description:
          body.description ??
          `Depreciere ${body.assetRef} — ${body.periodMonth}`,
        reference: idempotencyRef,
        sourceType: "ASSET",
        sourceId: null,
        status: "posted",
        createdBy: user.id,
      })
      .returning({ id: finJournalEntries.id });

    await db.insert(finJournalLines).values([
      {
        entryId: entry.id,
        accountCode: "713",
        debitCents: body.depreciationCents,
        creditCents: 0,
        currency: "MDL",
        description: `Cheltuieli uzură/depreciere — ${body.assetRef}`,
      },
      {
        entryId: entry.id,
        accountCode: creditAccountCode,
        debitCents: 0,
        creditCents: body.depreciationCents,
        currency: "MDL",
        description: creditAccountName,
      },
    ]);

    return c.json({ entryId: entry.id, existing: false }, 201);
  }
);

// ─── LEDGER-003: GET /reconcile ────────────────────────────────────────────────
// Compare GL entries vs source tables (payments, payroll_entries).
// Returns { ok, gaps: [{ sourceType, sourceId, amountCents, date }] }.

const reconcileQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
});

finLedgerRoutes.get(
  "/reconcile",
  zValidator("query", reconcileQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { from, to } = c.req.valid("query");

    // ── 1. Payments: get all payments in range ──────────────────────────
    const paymentFilters = [eq(payments.tenantId, tenantId)];
    if (from) paymentFilters.push(gte(payments.paidAt, new Date(from)));
    if (to) paymentFilters.push(lte(payments.paidAt, new Date(to + "T23:59:59Z")));

    const allPayments = await db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(and(...paymentFilters));

    // ── 2. Posted PAY entries in GL ────────────────────────────────────
    const postedPayEntries = await db
      .select({ sourceId: finJournalEntries.sourceId })
      .from(finJournalEntries)
      .where(
        and(
          eq(finJournalEntries.tenantId, tenantId),
          eq(finJournalEntries.sourceType, "PAY"),
          eq(finJournalEntries.status, "posted")
        )
      );

    const postedPayIds = new Set(
      postedPayEntries.map((e) => e.sourceId).filter(Boolean)
    );

    // ── 3. Payroll entries: get paid payroll in range ──────────────────
    const payrollFilters = [
      eq(payrollEntries.tenantId, tenantId),
      eq(payrollEntries.status, "paid"),
    ];
    // payroll uses month (YYYY-MM), convert to range
    if (from) payrollFilters.push(gte(payrollEntries.month, from.slice(0, 7)));
    if (to) payrollFilters.push(lte(payrollEntries.month, to.slice(0, 7)));

    const allPayroll = await db
      .select({
        id: payrollEntries.id,
        totalCents: payrollEntries.totalCents,
        month: payrollEntries.month,
      })
      .from(payrollEntries)
      .where(and(...payrollFilters));

    // ── 4. Posted SALARY entries in GL ───────────────────────────────
    const postedSalaryEntries = await db
      .select({ sourceId: finJournalEntries.sourceId })
      .from(finJournalEntries)
      .where(
        and(
          eq(finJournalEntries.tenantId, tenantId),
          eq(finJournalEntries.sourceType, "SALARY"),
          eq(finJournalEntries.status, "posted")
        )
      );

    const postedSalaryIds = new Set(
      postedSalaryEntries.map((e) => e.sourceId).filter(Boolean)
    );

    // ── 5. Build gap lists ─────────────────────────────────────────────
    type ReconcileGap = {
      sourceType: string;
      sourceId: string;
      amountCents: number;
      date: string | null;
    };

    const gaps: ReconcileGap[] = [];

    for (const p of allPayments) {
      if (!postedPayIds.has(p.id)) {
        gaps.push({
          sourceType: "PAY",
          sourceId: p.id,
          amountCents: p.amountCents,
          date: p.paidAt ? p.paidAt.toISOString().slice(0, 10) : null,
        });
      }
    }

    for (const pr of allPayroll) {
      if (!postedSalaryIds.has(pr.id)) {
        gaps.push({
          sourceType: "SALARY",
          sourceId: pr.id,
          amountCents: pr.totalCents,
          date: pr.month,
        });
      }
    }

    return c.json(
      {
        ok: gaps.length === 0,
        postedPayments: postedPayIds.size,
        unpostedPayments: allPayments.length - postedPayIds.size,
        postedPayroll: postedSalaryIds.size,
        unpostedPayroll: allPayroll.length - postedSalaryIds.size,
        gaps,
        periodFrom: from ?? null,
        periodTo: to ?? null,
      },
      200
    );
  }
);

// ─── LEDGER-004: GET /account/:code ──────────────────────────────────────────
// Carte mare: all journal line movements for one account, with running balance.
// Returns: { account, openingBalance, closingBalance, lines: AccountLedgerLine[] }

const accountLedgerQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format dată: YYYY-MM-DD")
    .optional(),
});

finLedgerRoutes.get(
  "/account/:code",
  zValidator("query", accountLedgerQuerySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const accountCode = c.req.param("code");
    const { from, to } = c.req.valid("query");

    // Fetch account metadata
    const [account] = await db
      .select()
      .from(finLedgerAccounts)
      .where(
        and(
          eq(finLedgerAccounts.tenantId, tenantId),
          eq(finLedgerAccounts.code, accountCode)
        )
      )
      .limit(1);

    if (!account) {
      return c.json({ error: "account_not_found" }, 404);
    }

    // Build date filters on journal entries
    const entryFilters = [
      eq(finJournalEntries.tenantId, tenantId),
      eq(finJournalEntries.status, "posted"),
    ];

    // Calculate opening balance (all movements BEFORE from date)
    let openingBalance = 0;
    if (from) {
      const priorEntries = await db
        .select({ id: finJournalEntries.id })
        .from(finJournalEntries)
        .where(
          and(
            eq(finJournalEntries.tenantId, tenantId),
            eq(finJournalEntries.status, "posted"),
            lt(finJournalEntries.entryDate, from)
          )
        );

      if (priorEntries.length > 0) {
        const priorIds = priorEntries.map((e) => e.id);
        const priorAgg = await db
          .select({
            debitSum: sum(finJournalLines.debitCents),
            creditSum: sum(finJournalLines.creditCents),
          })
          .from(finJournalLines)
          .where(
            and(
              inArray(finJournalLines.entryId, priorIds),
              eq(finJournalLines.accountCode, accountCode)
            )
          );

        const pr = priorAgg[0];
        openingBalance =
          Number(pr?.debitSum ?? 0) - Number(pr?.creditSum ?? 0);
      }
    }

    // Get movements in range
    if (from) {
      entryFilters.push(gte(finJournalEntries.entryDate, from));
    }
    if (to) {
      entryFilters.push(lte(finJournalEntries.entryDate, to));
    }

    const rangeEntries = await db
      .select({
        id: finJournalEntries.id,
        entryDate: finJournalEntries.entryDate,
        description: finJournalEntries.description,
        reference: finJournalEntries.reference,
        sourceType: finJournalEntries.sourceType,
      })
      .from(finJournalEntries)
      .where(and(...entryFilters))
      .orderBy(asc(finJournalEntries.entryDate), asc(finJournalEntries.createdAt));

    if (rangeEntries.length === 0) {
      return c.json({
        account,
        openingBalance,
        closingBalance: openingBalance,
        lines: [],
        periodFrom: from ?? null,
        periodTo: to ?? null,
      });
    }

    const rangeIds = rangeEntries.map((e) => e.id);

    // Fetch matching journal lines for this account in range
    const matchingLines = await db
      .select({
        entryId: finJournalLines.entryId,
        debitCents: finJournalLines.debitCents,
        creditCents: finJournalLines.creditCents,
        description: finJournalLines.description,
      })
      .from(finJournalLines)
      .where(
        and(
          inArray(finJournalLines.entryId, rangeIds),
          eq(finJournalLines.accountCode, accountCode)
        )
      );

    // Build a map entryId → lines
    const linesMap = new Map<string, typeof matchingLines>();
    for (const l of matchingLines) {
      const arr = linesMap.get(l.entryId) ?? [];
      arr.push(l);
      linesMap.set(l.entryId, arr);
    }

    // Build output lines with running balance
    let runningBalance = openingBalance;
    type AccountLedgerLine = {
      date: string;
      entryId: string;
      description: string | null;
      reference: string | null;
      sourceType: string;
      debitCents: number;
      creditCents: number;
      runningBalance: number;
    };

    const outputLines: AccountLedgerLine[] = [];

    for (const entry of rangeEntries) {
      const entryLines = linesMap.get(entry.id) ?? [];
      if (entryLines.length === 0) continue; // entry doesn't affect this account

      const totalDebit = entryLines.reduce((s, l) => s + Number(l.debitCents), 0);
      const totalCredit = entryLines.reduce(
        (s, l) => s + Number(l.creditCents),
        0
      );
      runningBalance += totalDebit - totalCredit;

      outputLines.push({
        date: entry.entryDate,
        entryId: entry.id,
        description: entry.description ?? null,
        reference: entry.reference ?? null,
        sourceType: entry.sourceType,
        debitCents: totalDebit,
        creditCents: totalCredit,
        runningBalance,
      });
    }

    return c.json({
      account,
      openingBalance,
      closingBalance: runningBalance,
      lines: outputLines,
      periodFrom: from ?? null,
      periodTo: to ?? null,
    });
  }
);
