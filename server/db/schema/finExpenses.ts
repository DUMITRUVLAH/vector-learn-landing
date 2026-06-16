/**
 * SPEND-001: FinDesk — Cheltuieli (Expenses) schema
 * Copied from origin/feat/FIN-spend for MASS-003 cross-module dependency.
 * MASS-003 extends this: adds import_hash column via migration 0121.
 *
 * Tables:
 *   fin_expenses            — înregistrări cheltuieli per tenant
 *   fin_expense_attachments — documente atașate (bon, factură, contract)
 *
 * Migration: drizzle/0120_fin_expenses.sql (renumbered; import_hash added in 0121)
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const finExpenseCategoryEnum = pgEnum("fin_expense_category", [
  "rent",
  "utilities",
  "salaries",
  "marketing",
  "supplies",
  "software",
  "maintenance",
  "other",
]);

export const finExpenseSourceEnum = pgEnum("fin_expense_source", [
  "manual",
  "capture",
  "payroll",
  "asset",
  "par", // SPLIT-202: auto-created from approved/paid PAR request
]);

export const finExpenseStatusEnum = pgEnum("fin_expense_status", [
  "draft",
  "approved",
  "rejected",
  "paid",
]);

// ─── fin_expenses ─────────────────────────────────────────────────────────────

export const finExpenses = pgTable(
  "fin_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    category: finExpenseCategoryEnum("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    vatDeductible: boolean("vat_deductible").notNull(),
    vatAmountCents: integer("vat_amount_cents").notNull().default(0),
    source: finExpenseSourceEnum("source").notNull().default("manual"),
    status: finExpenseStatusEnum("status").notNull().default("draft"),
    description: text("description"),
    reference: varchar("reference", { length: 100 }),
    vendorName: varchar("vendor_name", { length: 200 }),
    expenseDate: date("expense_date").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * MASS-003: SHA-256 hash of the CSV row for idempotent import.
     * Null for manually-created expenses.
     */
    importHash: varchar("import_hash", { length: 64 }),
    /**
     * SPLIT-202: PAR → FinDesk bridge.
     * When a PAR is marked paid/approved, a fin_expense is auto-created with source='par'.
     * This FK links back to the originating par_request (SET NULL on PAR deletion).
     * Migration: drizzle/0148_split_par_findesk_bridge.sql
     */
    parRequestId: uuid("par_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_expenses_tenant_idx").on(t.tenantId),
    index("fin_expenses_tenant_category_idx").on(t.tenantId, t.category),
    index("fin_expenses_tenant_status_idx").on(t.tenantId, t.status),
    index("fin_expenses_tenant_date_idx").on(t.tenantId, t.expenseDate),
    index("fin_expenses_import_hash_idx").on(t.tenantId, t.importHash),
  ]
);

// ─── fin_expense_attachments ──────────────────────────────────────────────────

export const finExpenseAttachments = pgTable(
  "fin_expense_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => finExpenses.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_expense_att_expense_idx").on(t.expenseId),
    index("fin_expense_att_tenant_idx").on(t.tenantId),
  ]
);

// ─── TypeScript inference helpers ─────────────────────────────────────────────

export type FinExpense = typeof finExpenses.$inferSelect;
export type InsertFinExpense = typeof finExpenses.$inferInsert;
export type FinExpenseSource = typeof finExpenseSourceEnum.enumValues[number];
export type FinExpenseAttachment = typeof finExpenseAttachments.$inferSelect;
export type InsertFinExpenseAttachment = typeof finExpenseAttachments.$inferInsert;

// ─── Category labels (Romanian) ───────────────────────────────────────────────

export const FIN_EXPENSE_CATEGORY_LABELS: Record<
  (typeof finExpenseCategoryEnum.enumValues)[number],
  string
> = {
  rent: "Chirie",
  utilities: "Utilități",
  salaries: "Salarii",
  marketing: "Marketing",
  supplies: "Materiale",
  software: "Software/Licențe",
  maintenance: "Întreținere",
  other: "Altele",
};
