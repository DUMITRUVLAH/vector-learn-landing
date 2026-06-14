/**
 * CALENDAR-001: FinDesk — Calendar Fiscal (obligații + blocarea perioadelor)
 *
 * Tables:
 *   fin_obligations   — obligații fiscale/de plată ale tenantului (TVA, CAS, CNAM, salariu, ...)
 *   fin_period_locks  — perioadele contabile blocate (FIN-CORE regula #8: imutabilitate)
 *
 * Migration: drizzle/0115_fin_calendar.sql
 *
 * Design decisions:
 * - FIN-CORE §1.14 + regula #8: perioadele blocate sunt imutabile — nicio postare contabilă
 *   nu mai poate fi modificată retroactiv după blocare.
 * - obligation_type stocat ca VARCHAR (nu pgEnum) pentru portabilitate PGlite↔Postgres
 *   (adăugarea de valori noi nu necesită migrare ALTER TYPE).
 * - status stocat ca VARCHAR cu validare la nivel de aplicație.
 * - Banii: ÎNTOTDEAUNA în cenți (BIGINT). (FIN-CORE regula #10.)
 * - Tenant isolation: TOATE interogările filtrează explicit după tenant_id.
 * - Portabilitate PGlite↔Postgres: usați db.query.X.findMany() (nu raw execute).
 * - fin_tax_declarations FK este loose (nullable, nu CASCADE) — oblligația există
 *   independent de declarație.
 *
 * Reuse:
 * - `tenants` table FK (cascade delete).
 * - `users` table FK pentru locked_by (SET NULL la ștergere user).
 * - `inAppNotifications` table (CALENDAR-002) pentru remindere.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  char,
  timestamp,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Obligation types (as union type for code safety) ─────────────────────────

/**
 * Tipurile de obligații fiscale și de plată suportate.
 * Stocat ca VARCHAR în DB pentru portabilitate — validat în aplicație.
 */
export type FinObligationType =
  | "tva_md"           // TVA lunar / trimestrial (Republica Moldova, SFS)
  | "tva_ro"           // TVA lunar / trimestrial (România, ANAF)
  | "income_tax_md"    // Impozit venit (Republica Moldova)
  | "income_tax_ro"    // Impozit venit (România)
  | "cas_employee"     // CAS reținut la angajat (24% brut, MD 2026)
  | "cas_employer"     // CAS contribuție angajator (24% brut, MD 2026)
  | "cnam"             // CNAM (9% brut, MD 2026)
  | "salary"           // Salariu net de plătit (plată directă, nu impozit)
  | "custom";          // Obligație personalizată (descriere liberă)

/** Statusurile posibile ale unei obligații. */
export type FinObligationStatus = "pending" | "paid" | "overdue";

// ─── fin_obligations ──────────────────────────────────────────────────────────

/**
 * Obligații fiscale și de plată ale tenantului.
 *
 * O obligație = o sumă de plătit la o dată scadentă, asociată unei perioade calendaristice.
 * Exemple:
 *   - TVA lunar pentru Ianuarie 2026, scadent 25 Februarie, 12.500 MDL
 *   - Salariu Ianuarie 2026, scadent 31 Ianuarie, 85.000 MDL
 *   - CAS angajator Ianuarie 2026, scadent 25 Februarie, 20.400 MDL
 *
 * Suma (amount_cents) este estimată la generare și actualizată la calcul definitiv.
 * Calculele sunt DETERMINISTE în cod — AI nu calculează obligații (FIN-CORE regula #4).
 */
export const finObligations = pgTable(
  "fin_obligations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /**
     * Tipul obligației: tva_md|tva_ro|income_tax_md|income_tax_ro|cas_employee|
     *                   cas_employer|cnam|salary|custom.
     * VARCHAR permite extinderi fără migrare ALTER TYPE.
     */
    obligationType: varchar("obligation_type", { length: 50 }).notNull(),
    /**
     * Descriere liberă (ex. "TVA lunar Ianuarie 2026", "Salariu echipă dev").
     * Populată la generare, editabilă manual.
     */
    description: varchar("description", { length: 500 }),
    /** Anul perioadei fiscale (ex. 2026). */
    periodYear: integer("period_year").notNull(),
    /** Luna perioadei fiscale 1–12 (ex. 1 pentru Ianuarie). */
    periodMonth: integer("period_month").notNull(),
    /** Data scadentă — când trebuie efectuată plata (ex. 2026-02-25 pentru TVA Ianuarie). */
    dueDate: date("due_date").notNull(),
    /**
     * Suma de plătit în cenți (BIGINT).
     * 0 = obligație de verificat (valoarea nu a fost calculată încă).
     * FIN-CORE regula #10: banii sunt întotdeauna în cenți.
     */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    /**
     * Moneda (ISO 4217): MDL (lei moldovenești), RON (lei românești), EUR.
     * Default MDL (piața principală: Republica Moldova).
     */
    currency: char("currency", { length: 3 }).notNull().default("MDL"),
    /**
     * Status:
     * - pending  : de plătit (implicit)
     * - paid     : plătit (paid_at populat)
     * - overdue  : termen depășit (calculat la afișare: due_date < now() și status = pending)
     */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Data și ora plății efective (null dacă status ≠ 'paid'). */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /**
     * FK opțional spre fin_tax_periods (declarație asociată).
     * Loose (nu CASCADE) — obligația există independent de declarație.
     * Populat de CALENDAR-002 la generare din FISC.
     */
    declarationId: uuid("declaration_id"),
    /** Note / comentariu contabil. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** Index principal pentru listare per tenant. */
    tenantIdx: index("fob_tenant_idx").on(t.tenantId),
    /** Index pentru filtrare per an/lună — utilizat frecvent la vizualizarea calendarului. */
    tenantYearMonthIdx: index("fob_tenant_year_month_idx").on(
      t.tenantId,
      t.periodYear,
      t.periodMonth
    ),
    /** Index pentru sortare/filtrare după dată scadentă (alertă scadențe). */
    dueDateIdx: index("fob_due_date_idx").on(t.dueDate),
  })
);

// ─── fin_period_locks ─────────────────────────────────────────────────────────

/**
 * Perioadele contabile blocate (FIN-CORE regula #8).
 *
 * Odată blocată o perioadă (lună+an), nicio scriere (mark-paid, actualizare obligație,
 * generare retroactivă) nu mai este permisă pentru acea perioadă.
 * Imutabilitate garantată de business logic (middleware guard în CALENDAR-003).
 *
 * Un singur lock per (tenant_id, period_year, period_month) — constraint UNIQUE.
 */
export const finPeriodLocks = pgTable(
  "fin_period_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Anul perioadei blocate (ex. 2025). */
    periodYear: integer("period_year").notNull(),
    /** Luna perioadei blocate 1–12 (ex. 12 pentru Decembrie). */
    periodMonth: integer("period_month").notNull(),
    /** Când a fost blocată perioada. */
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Utilizatorul care a blocat perioada.
     * ON DELETE SET NULL — lock-ul rămâne dacă utilizatorul e șters.
     */
    lockedBy: uuid("locked_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Motivul blocării (ex. "Decembrie 2025 reconciliat și verificat de audit"). */
    notes: text("notes"),
  },
  (t) => ({
    /** Index principal pentru listare per tenant. */
    tenantIdx: index("fpl_tenant_idx").on(t.tenantId),
    /**
     * Constraint UNIQUE: o singură perioadă blocată per lună per tenant.
     * Previne duplicate și permite UPSERT simplu.
     */
    tenantYearMonthUniq: uniqueIndex("fpl_tenant_year_month_uniq").on(
      t.tenantId,
      t.periodYear,
      t.periodMonth
    ),
  })
);

// ─── TypeScript inference types ───────────────────────────────────────────────

export type FinObligation = typeof finObligations.$inferSelect;
export type InsertFinObligation = typeof finObligations.$inferInsert;

export type FinPeriodLock = typeof finPeriodLocks.$inferSelect;
export type InsertFinPeriodLock = typeof finPeriodLocks.$inferInsert;

// ─── Drizzle relations ────────────────────────────────────────────────────────

/**
 * finObligations → tenants (many-to-one).
 */
export const finObligationsRelations = relations(finObligations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [finObligations.tenantId],
    references: [tenants.id],
  }),
}));

/**
 * finPeriodLocks → tenants + users (many-to-one).
 */
export const finPeriodLocksRelations = relations(finPeriodLocks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [finPeriodLocks.tenantId],
    references: [tenants.id],
  }),
  lockedByUser: one(users, {
    fields: [finPeriodLocks.lockedBy],
    references: [users.id],
  }),
}));

// ─── Label maps (Romanian) ────────────────────────────────────────────────────

export const FIN_OBLIGATION_TYPE_LABELS: Record<FinObligationType, string> = {
  tva_md: "TVA (MD)",
  tva_ro: "TVA (RO)",
  income_tax_md: "Impozit venit (MD)",
  income_tax_ro: "Impozit venit (RO)",
  cas_employee: "CAS angajat",
  cas_employer: "CAS angajator",
  cnam: "CNAM",
  salary: "Salariu",
  custom: "Altă obligație",
};

export const FIN_OBLIGATION_STATUS_LABELS: Record<FinObligationStatus, string> = {
  pending: "De plătit",
  paid: "Plătit",
  overdue: "Restantă",
};
