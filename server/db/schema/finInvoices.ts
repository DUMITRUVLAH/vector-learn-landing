/**
 * BILL-001: FinDesk — B2B Invoicing Schema
 * Tables: fin_invoices, fin_invoice_lines, fin_invoice_reminders
 * Migration: drizzle/0117_fin_invoices.sql
 *
 * Design decisions:
 * - fin_invoices: B2B commercial invoices — SEPARATE from student `invoices` table (B2C).
 *   FIN-CORE §1.5: "separare completă B2B vs B2C — nu vom extinde tabelul invoices".
 * - fin_invoice_lines: line items with mandatory vatPct per line (FIN-CORE Rule #1).
 * - fin_invoice_reminders: overdue reminders, idempotent via unique(invoiceId, reminderDay).
 * - FK references to fin_agreements, fin_parties, fin_agreement_services use nullable UUID
 *   without Drizzle `.references()` on this branch (those tables are on unmerged PRs).
 *   The migration SQL declares the same columns as plain UUIDs; FK constraints will be added
 *   when all FIN branches merge to main.
 * - totalCents / vatTotalCents: computed server-side at INSERT/UPDATE from line sums.
 * - invoiceNumber: e.g. "FIN-2026-0001" — set on INSERT by the API (BILL-002).
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Lifecycle status for a B2B invoice. */
export const finInvoiceStatusEnum = pgEnum("fin_invoice_status", [
  "draft",
  "issued",
  "paid",
  "overdue",
  "cancelled",
]);

// ─── fin_invoices ─────────────────────────────────────────────────────────────

export const finInvoices = pgTable(
  "fin_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant scope — cascade delete with the workspace. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Optional link to a fin_agreements row.
     * null = ad-hoc invoice (no contract backing).
     * FK enforced post-merge via migration ALTER TABLE.
     */
    agreementId: uuid("agreement_id"),

    /**
     * Recipient party (fin_parties).
     * null = internal / ad-hoc recipient.
     */
    partyId: uuid("party_id"),

    /** Invoice series prefix, e.g. "FIN". */
    series: varchar("series", { length: 20 }).notNull().default("FIN"),

    /** Sequential number within tenant (1, 2, 3, …). Auto-incremented at INSERT. */
    number: integer("number").notNull(),

    /**
     * Full human-readable invoice number: FIN-2026-0001.
     * Format: <series>-<YYYY>-<NNNN> (zero-padded to 4 digits).
     * Set by the API server at INSERT time.
     */
    invoiceNumber: varchar("invoice_number", { length: 30 }).notNull(),

    status: finInvoiceStatusEnum("status").notNull().default("draft"),

    /** ISO 4217 currency code, e.g. "MDL", "EUR". */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** When the invoice was marked "issued" (sent to client). */
    issuedAt: timestamp("issued_at", { withTimezone: true }),

    /** Date by which payment is due. */
    dueDate: date("due_date"),

    /**
     * Sum of all line totals (quantity × unitPriceCents × (1 + vatPct/100)), in cents.
     * Computed at INSERT/UPDATE by the server — NOT stored as a DB computed column
     * to stay compatible with PGlite.
     */
    totalCents: integer("total_cents").notNull().default(0),

    /**
     * Sum of VAT amounts across all lines, in cents.
     * vatAmount per line = quantity × unitPriceCents × vatPct / 100 (rounded).
     */
    vatTotalCents: integer("vat_total_cents").notNull().default(0),

    /** Free-text notes / memo for the invoice. */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_invoices_tenant_idx").on(t.tenantId),
    partyIdx: index("fin_invoices_party_idx").on(t.tenantId, t.partyId),
    statusIdx: index("fin_invoices_status_idx").on(t.tenantId, t.status),
    /** For auto-increment: MAX(number) WHERE tenantId. */
    numberIdx: index("fin_invoices_number_idx").on(t.tenantId, t.number),
  })
);

export type FinInvoice = typeof finInvoices.$inferSelect;
export type NewFinInvoice = typeof finInvoices.$inferInsert;

// ─── fin_invoice_lines ────────────────────────────────────────────────────────

/**
 * Line items on a B2B invoice.
 * FIN-CORE Rule #1: vatPct is NOT NULL — every line must declare its VAT rate.
 * The rule exists because Romanian/Moldovan fiscal law requires per-line VAT on commercial invoices.
 */
export const finInvoiceLines = pgTable(
  "fin_invoice_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Parent invoice — cascade delete. */
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => finInvoices.id, { onDelete: "cascade" }),

    /**
     * Optional link to the fin_agreement_services row that generated this line.
     * null = manually-entered line.
     */
    serviceId: uuid("service_id"),

    /** Description of the service/product billed on this line. */
    description: text("description").notNull(),

    /** Number of units billed (≥ 1). */
    quantity: integer("quantity").notNull().default(1),

    /** Price per unit in smallest currency unit (cents / bani). */
    unitPriceCents: integer("unit_price_cents").notNull(),

    /**
     * VAT percentage for this line (0–100).
     * NOT NULL — FIN-CORE Rule #1: TVA obligatoriu per linie.
     * Use 0 for VAT-exempt lines.
     */
    vatPct: integer("vat_pct").notNull().default(0),

    /**
     * Total for this line including VAT, in cents.
     * = round(quantity × unitPriceCents × (100 + vatPct) / 100)
     * Computed by the server at INSERT/UPDATE.
     */
    lineTotalCents: integer("line_total_cents").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdx: index("fin_invoice_lines_invoice_idx").on(t.invoiceId),
  })
);

export type FinInvoiceLine = typeof finInvoiceLines.$inferSelect;
export type NewFinInvoiceLine = typeof finInvoiceLines.$inferInsert;

// ─── fin_invoice_reminders ────────────────────────────────────────────────────

/**
 * Tracks overdue reminders sent for B2B invoices.
 * Idempotent: UNIQUE(invoiceId, reminderDay) prevents duplicate sends.
 * Mirrors the pattern from `invoiceReminders` (student invoices) in the CRM module.
 */
export const finInvoiceReminders = pgTable(
  "fin_invoice_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** The invoice this reminder belongs to. */
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => finInvoices.id, { onDelete: "cascade" }),

    /** Days overdue at which this reminder fires (e.g. 3, 7, 14). */
    reminderDay: integer("reminder_day").notNull(),

    /** Delivery channel: "email", "whatsapp", etc. */
    channel: varchar("channel", { length: 20 }).notNull().default("email"),

    /** Outcome: "sent" | "failed" | "cancelled". */
    status: varchar("status", { length: 20 }).notNull().default("sent"),

    /** Message body that was sent. */
    body: varchar("body", { length: 2000 }),

    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_invoice_reminders_tenant_idx").on(t.tenantId),
    invoiceIdx: index("fin_invoice_reminders_invoice_idx").on(t.invoiceId),
    /** One reminder per day threshold per invoice — idempotency guarantee. */
    uniqInvoiceDay: unique("fin_invoice_reminders_uniq_invoice_day").on(
      t.invoiceId,
      t.reminderDay
    ),
  })
);

export type FinInvoiceReminder = typeof finInvoiceReminders.$inferSelect;
export type NewFinInvoiceReminder = typeof finInvoiceReminders.$inferInsert;
