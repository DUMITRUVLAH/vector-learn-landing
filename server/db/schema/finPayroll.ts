/**
 * PAY-001 (FIN): FinDesk — Schema modul Payroll (salarizare angajați)
 *
 * Tables:
 *   fin_employees      — angajați per tenant (toți, nu doar profesori)
 *   fin_payroll_runs   — rulaje de salarizare lunare per tenant
 *   fin_payroll_items  — linii calcul brut↔net per angajat per rulaj
 *
 * Migration: drizzle/0115_fin_payroll.sql
 *
 * Design decisions:
 * - FIN-CORE §1.11 + regulile #2, #3, #4:
 *   - Cotele CAS/CASS/impozit provin din REGISTRY sau fallback la constante (PAY-002)
 *   - Confirmarea rulajului postează automat cheltuiala în fin_expenses (PAY-002)
 *   - Calculul DETERMINIST în cod, nu AI
 * - Banii: ÎNTOTDEAUNA în cenți (integer). (FIN-CORE regula #10.)
 * - Tenant isolation: TOATE interogările filtrează explicit după tenant_id.
 * - fin_employees este diferit de teachers — acoperă TOT personalul (admin, receptie etc.)
 * - deductions_jsonb: { cas_employee_cents, cass_employee_cents, income_tax_cents } per item
 * - employer_cost_cents = gross_cents + CAS_employer + CASS_employer
 *
 * Reuse:
 * - `tenants` table FK (cascadă delete).
 * - Pattern multi-tenant din server/routes/invoices.ts.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Tipul contractului angajatului. */
export const finEmployeeContractTypeEnum = pgEnum(
  "fin_employee_contract_type",
  [
    "employee",    // contract individual de muncă
    "contractor",  // prestare servicii / PFA
  ]
);

/** Statusul angajatului. */
export const finEmployeeStatusEnum = pgEnum("fin_employee_status", [
  "active",
  "inactive",
]);

/** Statusul rulajului de salarizare. */
export const finPayrollRunStatusEnum = pgEnum("fin_payroll_run_status", [
  "draft",      // neconfirmat, calculele pot fi modificate
  "confirmed",  // confirmat, cheltuielile au fost postate în fin_expenses
  "paid",       // plătit efectiv (virament bancar efectuat)
]);

// ─── fin_employees ─────────────────────────────────────────────────────────────

/**
 * Angajați per tenant.
 *
 * Separat de `teachers` — acoperă TOT personalul (administrativ, recepție,
 * profesori care nu sunt în sistemul de orar, etc.).
 * Un angajat poate fi asociat opțional cu un teacher (user_id), dar nu e obligatoriu.
 */
export const finEmployees = pgTable(
  "fin_employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține angajatul. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Numele complet al angajatului. */
    fullName: varchar("full_name", { length: 255 }).notNull(),

    /** Funcția / postul ocupat. */
    jobTitle: varchar("job_title", { length: 255 }),

    /** Tipul contractului: employee (CIM) sau contractor (PFA/SRL). */
    contractType: finEmployeeContractTypeEnum("contract_type")
      .notNull()
      .default("employee"),

    /**
     * Salariul brut lunar de bază, în cenți.
     * Acesta e baza de calcul pentru PAY-002 (motor salarii).
     */
    baseSalaryCents: integer("base_salary_cents").notNull().default(0),

    /** Valuta salariului: MDL, RON, EUR, USD. Default: MDL. */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Statusul: active / inactive. */
    status: finEmployeeStatusEnum("status").notNull().default("active"),

    /** Note opționale (număr contract, observații). */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_employees_tenant_idx").on(t.tenantId),
    index("fin_employees_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── fin_payroll_runs ──────────────────────────────────────────────────────────

/**
 * Rulaje de salarizare lunare.
 *
 * Un rulaj = o lună calendaristică pentru care se calculează salariile tuturor angajaților.
 * La confirmare (PAY-002), se generează automat cheltuieli în fin_expenses.
 */
export const finPayrollRuns = pgTable(
  "fin_payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține rulajul. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Luna perioadei (format YYYY-MM).
     * Ex: "2025-01" = January 2025.
     */
    periodMonth: varchar("period_month", { length: 7 }).notNull(),

    /** Statusul rulajului: draft / confirmed / paid. */
    status: finPayrollRunStatusEnum("status").notNull().default("draft"),

    /** Data confirmării (când s-au postat cheltuielile). */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

    /** Data plății efective (virament). */
    paidAt: timestamp("paid_at", { withTimezone: true }),

    /** Note opționale contabil. */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_payroll_runs_tenant_idx").on(t.tenantId),
    index("fin_payroll_runs_tenant_month_idx").on(t.tenantId, t.periodMonth),
    index("fin_payroll_runs_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── fin_payroll_items ─────────────────────────────────────────────────────────

/**
 * Linii calcul salariu per angajat per rulaj.
 *
 * Conține:
 *   - gross_cents: salariu brut calculat (poate diferi de base_salary_cents dacă sunt bonusuri)
 *   - deductions_jsonb: rețineri detaliate (CAS angajat, CASS angajat, impozit venit)
 *   - net_cents: salariu net de plătit = gross − rețineri
 *   - employer_cost_cents: costul total angajator = gross + CAS angajator + CASS angajator
 *
 * Calculul este DETERMINIST — PAY-002 (payrollCalculator.ts) îl efectuează.
 */
export const finPayrollItems = pgTable(
  "fin_payroll_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține linia de calcul. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Rulajul de salarizare aferent. */
    runId: uuid("run_id")
      .notNull()
      .references(() => finPayrollRuns.id, { onDelete: "cascade" }),

    /** Angajatul pentru care se calculează. */
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => finEmployees.id, { onDelete: "restrict" }),

    /** Salariu brut calculat, în cenți. */
    grossCents: integer("gross_cents").notNull().default(0),

    /**
     * Deduceri reținute angajat (JSONB):
     * {
     *   cas_employee_cents: number,   — CAS reținut (24% MD / 10% RO)
     *   cass_employee_cents: number,  — CASS reținut (9% MD / 10% RO)
     *   income_tax_cents: number,     — impozit venit reținut (12% MD / 16% RO)
     * }
     */
    deductionsJsonb: jsonb("deductions_jsonb").notNull().default({}),

    /** Salariu net de plătit = gross − rețineri, în cenți. */
    netCents: integer("net_cents").notNull().default(0),

    /**
     * Costul total angajator = gross + CAS angajator + CASS angajator, în cenți.
     * Aceasta e suma care se înregistrează în fin_expenses la confirmare.
     */
    employerCostCents: integer("employer_cost_cents").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_payroll_items_tenant_idx").on(t.tenantId),
    index("fin_payroll_items_run_idx").on(t.runId),
    index("fin_payroll_items_employee_idx").on(t.employeeId),
  ]
);

// ─── TypeScript inference types ───────────────────────────────────────────────

export type FinEmployee = typeof finEmployees.$inferSelect;
export type InsertFinEmployee = typeof finEmployees.$inferInsert;
export type FinEmployeeContractType =
  (typeof finEmployeeContractTypeEnum.enumValues)[number];
export type FinEmployeeStatus =
  (typeof finEmployeeStatusEnum.enumValues)[number];

export type FinPayrollRun = typeof finPayrollRuns.$inferSelect;
export type InsertFinPayrollRun = typeof finPayrollRuns.$inferInsert;
export type FinPayrollRunStatus =
  (typeof finPayrollRunStatusEnum.enumValues)[number];

export type FinPayrollItem = typeof finPayrollItems.$inferSelect;
export type InsertFinPayrollItem = typeof finPayrollItems.$inferInsert;

export interface FinPayrollDeductionsJsonb {
  cas_employee_cents: number;
  cass_employee_cents: number;
  income_tax_cents: number;
}

// ─── Label maps ───────────────────────────────────────────────────────────────

export const FIN_EMPLOYEE_CONTRACT_TYPE_LABELS: Record<
  FinEmployeeContractType,
  string
> = {
  employee: "Angajat (CIM)",
  contractor: "Prestator (PFA/SRL)",
};

export const FIN_EMPLOYEE_STATUS_LABELS: Record<FinEmployeeStatus, string> = {
  active: "Activ",
  inactive: "Inactiv",
};

export const FIN_PAYROLL_RUN_STATUS_LABELS: Record<FinPayrollRunStatus, string> = {
  draft: "Ciornă",
  confirmed: "Confirmat",
  paid: "Plătit",
};

// ─── Drizzle relations ────────────────────────────────────────────────────────

/** finPayrollRuns → items (one-to-many). */
export const finPayrollRunsRelations = relations(finPayrollRuns, ({ many }) => ({
  items: many(finPayrollItems),
}));

/** finPayrollItems → run (many-to-one) + employee (many-to-one). */
export const finPayrollItemsRelations = relations(finPayrollItems, ({ one }) => ({
  run: one(finPayrollRuns, {
    fields: [finPayrollItems.runId],
    references: [finPayrollRuns.id],
  }),
  employee: one(finEmployees, {
    fields: [finPayrollItems.employeeId],
    references: [finEmployees.id],
  }),
}));

/** finEmployees → items (one-to-many). */
export const finEmployeesRelations = relations(finEmployees, ({ many }) => ({
  payrollItems: many(finPayrollItems),
}));
