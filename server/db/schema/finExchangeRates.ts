/**
 * MULTICURRENCY-001: BNM daily exchange rates
 * Stores per-tenant currency pair rates for MDL revaluation.
 * Migration: drizzle/0115_fin_exchange_rates.sql
 */
import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const finExchangeRates = pgTable(
  "fin_exchange_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** ISO 4217 currency code, e.g. "EUR" */
    currencyFrom: varchar("currency_from", { length: 3 }).notNull(),
    /** ISO 4217 currency code, e.g. "MDL" */
    currencyTo: varchar("currency_to", { length: 3 }).notNull(),
    /** Exchange rate: 1 unit of currency_from = rate units of currency_to */
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    /** The calendar date this rate applies to */
    rateDate: date("rate_date").notNull(),
    /** Source of the rate: "BNM" | "manual" */
    source: varchar("source", { length: 20 }).notNull().default("BNM"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** One rate per currency pair per day per tenant */
    uniquePairDate: uniqueIndex("fin_exchange_rates_pair_date_idx").on(
      t.tenantId,
      t.currencyFrom,
      t.currencyTo,
      t.rateDate
    ),
    tenantIdx: index("fin_exchange_rates_tenant_idx").on(t.tenantId),
  })
);

export type FinExchangeRate = typeof finExchangeRates.$inferSelect;
export type NewFinExchangeRate = typeof finExchangeRates.$inferInsert;
