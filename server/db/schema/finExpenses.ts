/**
 * SPEND-001: FinDesk — Cheltuieli (Expenses) schema
 *
 * Tables:
 *   fin_expenses            — înregistrări cheltuieli per tenant
 *   fin_expense_attachments — documente atașate (bon, factură, contract)
 *
 * Migration: drizzle/0119_fin_expenses.sql
 *
 * Design decisions:
 * - vat_deductible este NOT NULL boolean — regula #1 FIN-CORE: TVA deductibil
 *   TREBUIE indicat explicit la creare; nu se poate omite.
 * - source enum separă originea (manual, stat de plată, activ, OCR/capture)
 *   pentru a permite tratament contabil diferit per sursă.
 * - status flow: draft → approved → paid (sau draft → rejected).
 * - approved_by FK → users.id nullable; setată de rol director/manager.
 * - fin_expense_attachments fără relație Drizzle la storage — file_key trimis
 *   direct la S3/Vercel Blob, fără stocare locală.
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

/** Categoria contabilă a cheltuielii. */
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

/** Sursa înregistrării cheltuielii. */
export const finExpenseSourceEnum = pgEnum("fin_expense_source", [
  "manual",
  "capture",
  "payroll",
  "asset",
]);

/** Statusul cheltuielii în fluxul de aprobare. */
export const finExpenseStatusEnum = pgEnum("fin_expense_status", [
  "draft",
  "approved",
  "rejected",
  "paid",
]);

// ─── fin_expenses ─────────────────────────────────────────────────────────────

/**
 * Cheltuieli înregistrate de academic per tenant.
 *
 * Câmp critic: vat_deductible (NOT NULL).
 * Dacă nu e specificat la creare → API returnează 400 "vat_deductible_required".
 */
export const finExpenses = pgTable(
  "fin_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține cheltuiala. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Categoria contabilă (chirire, utilități, salarii etc.). */
    category: finExpenseCategoryEnum("category").notNull(),

    /** Valoarea cheltuielii în cenți (MDL sau altă valută). */
    amountCents: integer("amount_cents").notNull(),

    /** Codul valutei (ISO 4217). Default MDL pentru Moldova. */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /**
     * TVA deductibil — OBLIGATORIU (NOT NULL).
     * Regula #1 FIN-CORE: directorul trebuie să marcheze explicit.
     * true  = TVA recuperabil de la stat.
     * false = TVA cost final.
     */
    vatDeductible: boolean("vat_deductible").notNull(),

    /** Suma TVA calculată (în cenți). 0 dacă nu se aplică. */
    vatAmountCents: integer("vat_amount_cents").notNull().default(0),

    /**
     * Sursa cheltuielii:
     * - manual   = introdusă manual de utilizator
     * - capture  = scanată/OCR din bon
     * - payroll  = generată de modulul HR (stat de plată)
     * - asset    = generată de evidența activelor
     */
    source: finExpenseSourceEnum("source").notNull().default("manual"),

    /** Statusul în fluxul de aprobare. */
    status: finExpenseStatusEnum("status").notNull().default("draft"),

    /** Descriere liberă. */
    description: text("description"),

    /**
     * Referința documentului original (nr. bon, factură furnizor, contract).
     * Ajută la reconciliere manuală.
     */
    reference: varchar("reference", { length: 100 }),

    /** Furnizorul / prestatorul de servicii. */
    vendorName: varchar("vendor_name", { length: 200 }),

    /** Data cheltuielii (data documentului original). */
    expenseDate: date("expense_date").notNull(),

    /** Data plății efective. null = neplătit. */
    paidAt: timestamp("paid_at", { withTimezone: true }),

    /** Utilizatorul care a aprobat cheltuiala. null = neaprovat. */
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Timestamp aprobare. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    /** Utilizatorul care a creat cheltuiala. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_expenses_tenant_idx").on(t.tenantId),
    index("fin_expenses_tenant_category_idx").on(t.tenantId, t.category),
    index("fin_expenses_tenant_status_idx").on(t.tenantId, t.status),
    index("fin_expenses_tenant_date_idx").on(t.tenantId, t.expenseDate),
  ]
);

// ─── fin_expense_attachments ──────────────────────────────────────────────────

/**
 * Documente atașate la cheltuieli (bon, factură furnizor, contract).
 * Fișierele sunt stocate în Vercel Blob / S3 — doar referința (file_key) în DB.
 */
export const finExpenseAttachments = pgTable(
  "fin_expense_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant scope (redundant cu expense, dar util pentru queries directe). */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Cheltuiala căreia îi aparține atașamentul. */
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => finExpenses.id, { onDelete: "cascade" }),

    /** Cheia în storage (Vercel Blob pathname sau S3 key). */
    fileKey: varchar("file_key", { length: 500 }).notNull(),

    /** Numele original al fișierului. */
    fileName: varchar("file_name", { length: 255 }).notNull(),

    /** MIME type (image/jpeg, application/pdf, etc.). */
    mimeType: varchar("mime_type", { length: 100 }).notNull(),

    /** Dimensiunea fișierului în octeți. */
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
export type FinExpenseAttachment = typeof finExpenseAttachments.$inferSelect;
export type InsertFinExpenseAttachment = typeof finExpenseAttachments.$inferInsert;

// ─── Category labels (Romanian) ───────────────────────────────────────────────

export const FIN_EXPENSE_CATEGORY_LABELS: Record<
  typeof finExpenseCategoryEnum.enumValues[number],
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
