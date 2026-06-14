/**
 * LEDGER-001/002: General Ledger routes for FinDesk
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
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - GAP-ANALYSIS G1: real double-entry accounting — sum(debit)==sum(credit) enforced.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, lt, sum, count, inArray, asc, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  finLedgerAccounts,
  finJournalEntries,
  finJournalLines,
} from "../db/schema/finLedger";
import { payments } from "../db/schema/payments";
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
