/**
 * BANKLINK-001: BankLink — bank connectors + imported transactions
 *
 * Two tables:
 *   fin_bank_connections   — configuration for each bank account connector per tenant
 *   fin_bank_transactions  — transactions imported from OFX/MT940 files (deduped by external_id)
 *
 * Design:
 * - One connector per bank account. A tenant with 6 branches can have 6 connectors.
 * - Dedup: unique constraint on (bank_connection_id, external_id) prevents double-imports.
 * - Status workflow: unmatched → matched (linked to payment/invoice) or ignored.
 * - Tenant isolation: all queries filter by tenantId.
 * - GAP-ANALYSIS G2: competitors lack bank integration — key differentiator for multi-branch academies.
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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";

// ─── fin_bank_connections — Bank account connector configuration ──────────────

export const BANK_CODES_MD = [
  "MAIB",
  "MOBIASBANCA",
  "VICBANK",
  "ENERGBANK",
  "PROCREDIT",
  "COMERTBANK",
  "FINCOMBANK",
  "EximBank",
  "OTHER",
] as const;
export type BankCodeMD = (typeof BANK_CODES_MD)[number];

export const IMPORT_FORMATS = ["OFX", "MT940", "CSV"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const finBankConnections = pgTable(
  "fin_bank_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Human-readable name, e.g. "BC Maib — Cont Principal" */
    name: text("name").notNull(),

    /** Bank identifier — Moldovan banks: MAIB, MOBIASBANCA, VICBANK, etc. */
    bankCode: varchar("bank_code", { length: 30 }),

    /** IBAN of the connected account (up to 34 chars per ISO 13616) */
    accountIban: varchar("account_iban", { length: 34 }),

    /** Default currency for this account */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Import file format: OFX (standard), MT940 (SWIFT), CSV (custom) */
    importFormat: varchar("import_format", { length: 20 })
      .notNull()
      .default("OFX"),

    /** Deactivated connectors are hidden but historical transactions remain */
    isActive: boolean("is_active").notNull().default(true),

    /** Timestamp of the most recent successful import */
    lastImportAt: timestamp("last_import_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fbc_tenant_idx").on(t.tenantId),
    tenantActiveIdx: index("fbc_tenant_active_idx").on(t.tenantId, t.isActive),
  })
);

// ─── fin_bank_transactions — Imported transactions ────────────────────────────

export const BANK_TRANSACTION_STATUSES = [
  "unmatched",
  "matched",
  "ignored",
] as const;
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number];

export const finBankTransactions = pgTable(
  "fin_bank_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** FK to the bank connector that produced this transaction */
    bankConnectionId: uuid("bank_connection_id")
      .notNull()
      .references(() => finBankConnections.id, { onDelete: "cascade" }),

    /** Tenant denormalized for direct tenant-level queries without JOIN */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Unique transaction ID from the source file (OFX FITID, MT940 :61: ref, etc.).
     * Used for deduplication — same file can be imported multiple times safely.
     */
    externalId: varchar("external_id", { length: 100 }).notNull(),

    /** Accounting date of the transaction */
    transactionDate: date("transaction_date").notNull(),

    /** Value date (settlement date) — may differ from transaction date */
    valueDate: date("value_date"),

    /**
     * Amount in cents. Sign convention:
     *   Positive → credit (money IN, e.g. payment received)
     *   Negative → debit  (money OUT, e.g. expense paid)
     */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),

    /** Currency code (ISO 4217) */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Transaction description from the bank statement */
    description: text("description"),

    /** Counterparty / payee name */
    counterpartyName: text("counterparty_name"),

    /** Counterparty IBAN */
    counterpartyIban: varchar("counterparty_iban", { length: 34 }),

    /** Bank reference number */
    reference: varchar("reference", { length: 100 }),

    /**
     * Status:
     *   unmatched — newly imported, not yet linked to a payment/invoice
     *   matched   — linked to an existing payment or invoice
     *   ignored   — manually marked as irrelevant (transfers, fees)
     */
    status: varchar("status", { length: 20 })
      .notNull()
      .default("unmatched"),

    /** If matched, the sourceType of the linked record (e.g. "payment", "invoice") */
    matchedSourceType: varchar("matched_source_type", { length: 30 }),

    /** If matched, the UUID of the linked record */
    matchedSourceId: uuid("matched_source_id"),

    /**
     * Match confidence score in basis points (0..10000 = 0..100%).
     * Produced by the auto-match engine. 0 = no match or not yet scored.
     * Stored as integer for PGlite compatibility (no NUMERIC needed).
     */
    matchedScoreBp: bigint("matched_score_bp", { mode: "number" }).default(0),

    /** When this transaction was imported into the system */
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** Deduplication constraint: same bank account can't have two transactions with the same external_id */
    connectionExternalIdUniq: unique("fbt_connection_external_id_uniq").on(
      t.bankConnectionId,
      t.externalId
    ),
    tenantDateIdx: index("fbt_tenant_date_idx").on(t.tenantId, t.transactionDate),
    tenantStatusIdx: index("fbt_tenant_status_idx").on(t.tenantId, t.status),
    connectionIdx: index("fbt_connection_idx").on(t.bankConnectionId),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finBankConnectionsRelations = relations(
  finBankConnections,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [finBankConnections.tenantId],
      references: [tenants.id],
    }),
    transactions: many(finBankTransactions),
  })
);

export const finBankTransactionsRelations = relations(
  finBankTransactions,
  ({ one }) => ({
    connection: one(finBankConnections, {
      fields: [finBankTransactions.bankConnectionId],
      references: [finBankConnections.id],
    }),
    tenant: one(tenants, {
      fields: [finBankTransactions.tenantId],
      references: [tenants.id],
    }),
  })
);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type FinBankConnection = typeof finBankConnections.$inferSelect;
export type InsertFinBankConnection = typeof finBankConnections.$inferInsert;

export type FinBankTransaction = typeof finBankTransactions.$inferSelect;
export type InsertFinBankTransaction = typeof finBankTransactions.$inferInsert;

/** Parsed transaction from OFX/MT940/CSV file — before DB insert */
export interface ParsedBankTransaction {
  externalId: string;
  transactionDate: string; // YYYY-MM-DD
  valueDate: string | null; // YYYY-MM-DD or null
  amountCents: number; // signed: positive=credit, negative=debit
  description: string | null;
  counterpartyName: string | null;
  reference: string | null;
}
