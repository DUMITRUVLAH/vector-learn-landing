/**
 * BUDGET-001: FinDesk — Bugete (Budgets) schema
 *
 * Tables:
 *   fin_budgets      — antet buget per tenant / an fiscal / departament
 *   fin_budget_lines — linii buget: categorie, sumă bugetată
 *
 * Migration: drizzle/0115_fin_budgets.sql
 *
 * Design decisions:
 * - branch_id este soft FK (uuid nullable) — nu referențiem branches pentru a evita
 *   dependința circulară la acest nivel. Useful pentru bugete per filială.
 * - category pe linie mapează pe fin_expense_category (string varchar) — soft link,
 *   fără FK hard, deoarece fin_expenses poate fi pe un branch separat (SPEND).
 * - status enum: draft → active → closed (aprobare simplă de director).
 * - budgeted_cents în bigint pentru precizie MDL (cel mai mic cent = 0.01 MDL).
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Status enum ─────────────────────────────────────────────────────────────

export const finBudgetStatusEnum = pgEnum("fin_budget_status", [
  "draft",
  "active",
  "closed",
]);

// ─── fin_budgets ─────────────────────────────────────────────────────────────

export const finBudgets = pgTable(
  "fin_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Denumirea bugetului (ex: "Buget operațional 2026 — HQ") */
    name: varchar("name", { length: 200 }).notNull(),

    /**
     * Anul fiscal la care se referă bugetul (ex: 2026).
     * Cheltuielile reale se filtrează pe 1 ian — 31 dec al acestui an.
     */
    fiscalYear: integer("fiscal_year").notNull(),

    /**
     * Departamentul (ex: "Marketing", "HR", "IT") — text liber.
     * Null = buget general / întreg centrul.
     */
    department: varchar("department", { length: 100 }),

    /**
     * ID ramura (soft FK — fără referință Drizzle la branches).
     * Null = buget central (toate filialele).
     */
    branchId: uuid("branch_id"),

    status: finBudgetStatusEnum("status").default("draft").notNull(),

    /** Note / comentarii despre buget */
    notes: text("notes"),

    /** Utilizatorul care a creat bugetul */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_budgets_tenant_idx").on(t.tenantId),
    index("fin_budgets_tenant_year_idx").on(t.tenantId, t.fiscalYear),
    index("fin_budgets_tenant_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── fin_budget_lines ─────────────────────────────────────────────────────────

export const finBudgetLines = pgTable(
  "fin_budget_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    budgetId: uuid("budget_id")
      .notNull()
      .references(() => finBudgets.id, { onDelete: "cascade" }),

    /**
     * Categoria cheltuielii — mapează pe fin_expense_category string.
     * Exemple: "rent", "utilities", "salaries", "marketing", "supplies", "software",
     *          "maintenance", "other".
     * Poate fi și o categorie custom (ex: "transport").
     */
    category: varchar("category", { length: 50 }).notNull(),

    /** Etichetă afișabilă (ex: "Chirie sediu central") */
    label: varchar("label", { length: 200 }).notNull(),

    /**
     * Suma bugetată pentru această categorie, în MDL cents.
     * Valoarea este pentru întregul an fiscal al bugetului.
     */
    budgetedCents: bigint("budgeted_cents", { mode: "number" }).default(0).notNull(),

    /** Ordinea de afișare în UI (crescător = mai sus) */
    displayOrder: integer("display_order").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_budget_lines_budget_idx").on(t.budgetId),
    index("fin_budget_lines_tenant_idx").on(t.tenantId),
  ]
);

// ─── TypeScript inference helpers ─────────────────────────────────────────────

export type FinBudget = typeof finBudgets.$inferSelect;
export type InsertFinBudget = typeof finBudgets.$inferInsert;
export type FinBudgetLine = typeof finBudgetLines.$inferSelect;
export type InsertFinBudgetLine = typeof finBudgetLines.$inferInsert;

// ─── Category labels (Romanian) ───────────────────────────────────────────────

export const FIN_BUDGET_CATEGORY_LABELS: Record<string, string> = {
  rent: "Chirie",
  utilities: "Utilități",
  salaries: "Salarii",
  marketing: "Marketing",
  supplies: "Materiale",
  software: "Software/Licențe",
  maintenance: "Întreținere",
  transport: "Transport",
  other: "Altele",
};
