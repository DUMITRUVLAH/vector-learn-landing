/**
 * FX-001: cursul oficial BNM, cache global (NU per tenant).
 *
 * Cursul publicat de Banca Națională a Moldovei e date publice, identice pentru toți clienții —
 * spre deosebire de `fin_exchange_rates`, care ține cursuri per tenant (inclusiv manuale, pentru
 * reevaluare). De aceea tabela asta n-are `tenant_id`: e o oglindă locală a arhivei BNM.
 *
 * De ce o persistăm și nu ne bazăm doar pe cache-ul din memorie (server/lib/fx.ts): pe Vercel
 * fiecare invocare poate porni la rece, iar un grafic pe 30 de zile ar însemna 30 de descărcări
 * de la bnm.md la fiecare deschidere de pagină. Cursul unei zile trecute nu se mai schimbă, deci
 * o citim o singură dată și rămâne.
 *
 * Migrare: drizzle/0148_bnm_rates.sql
 */
import { pgTable, uuid, varchar, numeric, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const bnmRates = pgTable(
  "bnm_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Ziua pentru care BNM a publicat cursul. */
    rateDate: date("rate_date").notNull(),
    /** Cod ISO 4217, ex. "EUR". */
    code: varchar("code", { length: 3 }).notNull(),
    /** Denumirea publicată de BNM. */
    name: varchar("name", { length: 120 }).notNull().default(""),
    /** Câte unități acoperă `value` (10 ALL, 100 JPY …). */
    nominal: numeric("nominal", { precision: 12, scale: 4 }).notNull().default("1"),
    /** Cursul publicat: lei pentru `nominal` unități. */
    value: numeric("value", { precision: 18, scale: 6 }).notNull(),
    /** Lei pentru O unitate (`value / nominal`) — forma folosită la calcule. */
    mdlPerUnit: numeric("mdl_per_unit", { precision: 18, scale: 8 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueDateCode: uniqueIndex("bnm_rates_date_code_idx").on(t.rateDate, t.code),
    dateIdx: index("bnm_rates_date_idx").on(t.rateDate),
    codeIdx: index("bnm_rates_code_idx").on(t.code),
  })
);

export type BnmRate = typeof bnmRates.$inferSelect;
export type NewBnmRate = typeof bnmRates.$inferInsert;
