/**
 * MULTICURRENCY-002: FIN General Ledger entries (fx_revaluation + other entry types)
 * Stores month-close FX revaluation differences and other posted entries.
 * Migration: drizzle/0116_fin_ledger.sql
 */
import {
  pgTable,
  uuid,
  varchar,
  bigint,
  numeric,
  timestamp,
  text,
  date,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const finLedgerEntries = pgTable(
  "fin_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /**
     * Entry type:
     *   "fx_revaluation" — month-close FX revaluation difference
     *   "payment"        — posted payment
     *   "invoice"        — posted invoice
     */
    entryType: varchar("entry_type", { length: 30 }).notNull(),
    /** ISO 4217 source currency (e.g. "EUR") */
    currencyFrom: varchar("currency_from", { length: 3 }).notNull(),
    /** ISO 4217 target currency (e.g. "MDL") */
    currencyTo: varchar("currency_to", { length: 3 }).notNull(),
    /** Amount in source currency, in cents/minor units */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** BNM rate used for this entry */
    rateUsed: numeric("rate_used", { precision: 18, scale: 6 }).notNull(),
    /**
     * FX gain (+) or loss (-) in target currency cents.
     * = amountCents * (rateUsed - rateAtBooking)
     */
    fxGainLossCents: bigint("fx_gain_loss_cents", { mode: "number" })
      .notNull()
      .default(0),
    /** Optional FK to the source transaction (payment id, invoice id, etc.) */
    referenceId: uuid("reference_id"),
    /** First day of the month this revaluation covers, e.g. 2026-05-01 */
    periodMonth: date("period_month").notNull(),
    /** User who triggered the posting */
    postedBy: uuid("posted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
  },
  (t) => ({
    tenantIdx: index("fin_ledger_tenant_idx").on(t.tenantId),
    periodIdx: index("fin_ledger_period_idx").on(t.tenantId, t.periodMonth),
    entryTypeIdx: index("fin_ledger_entry_type_idx").on(
      t.tenantId,
      t.entryType
    ),
  })
);

export type FinLedgerEntry = typeof finLedgerEntries.$inferSelect;
export type NewFinLedgerEntry = typeof finLedgerEntries.$inferInsert;
