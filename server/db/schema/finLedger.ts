/**
 * LEDGER-001: General Ledger — double-entry accounting for FinDesk
 *
 * Three tables:
 *   fin_ledger_accounts  — Chart of accounts (plan de conturi) per tenant
 *   fin_journal_entries  — Journal entry headers (tranzacție contabilă)
 *   fin_journal_lines    — Journal entry lines (debit / credit pairs)
 *
 * Design:
 * - Every financial event (BILL, SPEND, PAY, ASSET) posts a journal entry with balanced lines.
 * - Double-entry: sum(debit) must equal sum(credit) across all lines of an entry.
 * - Each line is either debit OR credit (never both non-zero — enforced by DB CHECK constraint).
 * - Tenant isolation: all queries filter by tenantId.
 * - Account codes follow the Moldovan SNC plan (compatible with Romanian accounting).
 * - GAP-ANALYSIS G1: competitors lack a real ledger — this is our key differentiator.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  bigint,
  date,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── fin_ledger_accounts — Chart of accounts ─────────────────────────────────

/**
 * Account class codes (SNC Moldova):
 *   A = Activ (Assets)
 *   P = Pasiv (Liabilities/Equity)
 *   V = Venituri (Revenue)
 *   C = Cheltuieli (Expenses)
 *   B = Bifuncțional (bi-directional — can be debit or credit depending on balance)
 */
export const ACCOUNT_CLASSES = ["A", "P", "V", "C", "B"] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const finLedgerAccounts = pgTable(
  "fin_ledger_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Account code, e.g. "111", "221", "531" */
    code: varchar("code", { length: 20 }).notNull(),

    /** Human-readable name in Romanian */
    name: text("name").notNull(),

    /**
     * Account class: A=Activ, P=Pasiv, V=Venituri, C=Cheltuieli, B=Bifuncțional.
     * Determines normal balance side (A/C = debit, P/V = credit, B = either).
     */
    accountClass: varchar("account_class", { length: 1 }).notNull(),

    /**
     * Optional parent code for hierarchical chart (e.g. "211" → parent "21" → parent "2").
     * Null for top-level class accounts.
     */
    parentCode: varchar("parent_code", { length: 20 }),

    /**
     * System accounts are seeded automatically for all tenants and cannot be deleted.
     * Tenants can add custom accounts (is_system=false).
     */
    isSystem: boolean("is_system").notNull().default(true),

    /** Deactivated accounts can't receive new postings but remain for historical reporting. */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantCodeUniq: unique("fla_tenant_code_uniq").on(t.tenantId, t.code),
    tenantIdx: index("fla_tenant_idx").on(t.tenantId),
    classIdx: index("fla_class_idx").on(t.tenantId, t.accountClass),
    activeIdx: index("fla_active_idx").on(t.tenantId, t.isActive),
  })
);

// ─── fin_journal_entries — Journal entry headers ─────────────────────────────

/**
 * Source types: where this journal entry originated from.
 *   BILL     — from a fin_invoice (B2B bill)
 *   SPEND    — from a fin_expense / fin_spend_entries
 *   PAY      — from a payment received (fin_invoices settled)
 *   ASSET    — from an asset acquisition/depreciation
 *   MANUAL   — manually entered by accountant
 */
export const JOURNAL_SOURCE_TYPES = [
  "BILL",
  "SPEND",
  "PAY",
  "ASSET",
  "SALARY",
  "MANUAL",
] as const;
export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

export const JOURNAL_STATUSES = ["draft", "posted", "reversed"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const finJournalEntries = pgTable(
  "fin_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Accounting date (may differ from created_at — e.g. backdating an invoice) */
    entryDate: date("entry_date").notNull(),

    /** Human-readable description of what this entry represents */
    description: text("description"),

    /** Document reference number (invoice nr., payment nr., etc.) */
    reference: varchar("reference", { length: 100 }),

    /** Where did this entry originate */
    sourceType: varchar("source_type", { length: 30 })
      .notNull()
      .default("MANUAL"),

    /** FK to the originating record (invoice_id, payment_id, expense_id, etc.) */
    sourceId: uuid("source_id"),

    /** Entry status: draft (not yet posted), posted (in ledger), reversed (cancelled) */
    status: varchar("status", { length: 20 }).notNull().default("posted"),

    /** User who created this entry */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fje_tenant_idx").on(t.tenantId),
    tenantDateIdx: index("fje_tenant_date_idx").on(t.tenantId, t.entryDate),
    sourceIdx: index("fje_source_idx").on(
      t.tenantId,
      t.sourceType,
      t.sourceId
    ),
    statusIdx: index("fje_status_idx").on(t.tenantId, t.status),
  })
);

// ─── fin_journal_lines — Journal entry lines ──────────────────────────────────

export const finJournalLines = pgTable(
  "fin_journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** FK to the journal entry header */
    entryId: uuid("entry_id")
      .notNull()
      .references(() => finJournalEntries.id, { onDelete: "cascade" }),

    /** Account code from fin_ledger_accounts.code */
    accountCode: varchar("account_code", { length: 20 }).notNull(),

    /**
     * Debit amount in cents. Zero if this line is a credit.
     * debit_cents > 0 → debit side (increases assets/expenses).
     * CONSTRAINT: debit_cents = 0 OR credit_cents = 0 (enforced in DB).
     */
    debitCents: bigint("debit_cents", { mode: "number" }).notNull().default(0),

    /**
     * Credit amount in cents. Zero if this line is a debit.
     * credit_cents > 0 → credit side (increases liabilities/equity/revenue).
     */
    creditCents: bigint("credit_cents", { mode: "number" }).notNull().default(0),

    /** Currency code (ISO 4217), e.g. "MDL", "EUR", "USD" */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Optional per-line description (e.g. "Servicii web design — ian 2026") */
    description: text("description"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entryIdx: index("fjl_entry_idx").on(t.entryId),
    accountIdx: index("fjl_account_idx").on(t.accountCode),
    // DB-level constraint: debit XOR credit (not both non-zero on the same line)
    debitXorCredit: check(
      "fjl_debit_xor_credit",
      sql`debit_cents = 0 OR credit_cents = 0`
    ),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finLedgerAccountsRelations = relations(
  finLedgerAccounts,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [finLedgerAccounts.tenantId],
      references: [tenants.id],
    }),
  })
);

export const finJournalEntriesRelations = relations(
  finJournalEntries,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [finJournalEntries.tenantId],
      references: [tenants.id],
    }),
    creator: one(users, {
      fields: [finJournalEntries.createdBy],
      references: [users.id],
    }),
    lines: many(finJournalLines),
  })
);

export const finJournalLinesRelations = relations(finJournalLines, ({ one }) => ({
  entry: one(finJournalEntries, {
    fields: [finJournalLines.entryId],
    references: [finJournalEntries.id],
  }),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type FinLedgerAccount = typeof finLedgerAccounts.$inferSelect;
export type InsertFinLedgerAccount = typeof finLedgerAccounts.$inferInsert;

export type FinJournalEntry = typeof finJournalEntries.$inferSelect;
export type InsertFinJournalEntry = typeof finJournalEntries.$inferInsert;

export type FinJournalLine = typeof finJournalLines.$inferSelect;
export type InsertFinJournalLine = typeof finJournalLines.$inferInsert;
