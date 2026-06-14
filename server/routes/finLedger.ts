/**
 * LEDGER-001: General Ledger routes for FinDesk
 *
 * Routes:
 *   GET /api/fin/ledger/accounts            — list chart of accounts (filterable by class, active)
 *   GET /api/fin/ledger/trial-balance       — debit/credit sum per account in date range
 *   POST /api/fin/ledger/accounts/seed      — seed standard SNC accounts for tenant (idempotent)
 *
 * Design:
 * - Tenant isolation via session.tenantId.
 * - No raw .execute().rows — Drizzle query builder throughout.
 * - GAP-ANALYSIS G1: real double-entry accounting.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, sum, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  finLedgerAccounts,
  finJournalEntries,
  finJournalLines,
} from "../db/schema/finLedger";
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

    if (entryIds.length === 0) {
      return c.json({ rows: [], totalDebitCents: 0, totalCreditCents: 0 }, 200);
    }

    const entryIdList = entryIds.map((e) => e.id);

    // Aggregate debit/credit per account_code + currency using inArray
    const aggregated = await db
      .select({
        accountCode: finJournalLines.accountCode,
        currency: finJournalLines.currency,
        debitSum: sum(finJournalLines.debitCents),
        creditSum: sum(finJournalLines.creditCents),
      })
      .from(finJournalLines)
      .where(inArray(finJournalLines.entryId, entryIdList))
      .groupBy(finJournalLines.accountCode, finJournalLines.currency);

    const rows = aggregated
      .map((r) => ({
        accountCode: r.accountCode,
        currency: r.currency,
        debitCents: Number(r.debitSum ?? 0),
        creditCents: Number(r.creditSum ?? 0),
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalDebitCents = rows.reduce((s, r) => s + r.debitCents, 0);
    const totalCreditCents = rows.reduce((s, r) => s + r.creditCents, 0);

    return c.json({ rows, totalDebitCents, totalCreditCents }, 200);
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
