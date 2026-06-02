import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
  text,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { payments } from "./payments";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "cancelled",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    /** Invoice series prefix, e.g. "VECT" */
    series: varchar("series", { length: 20 }).notNull().default("VECT"),
    /** Sequential number within tenant (1, 2, 3, …) */
    number: integer("number").notNull(),
    /** Full human-readable invoice number: VECT-2026-0001 */
    invoiceNumber: varchar("invoice_number", { length: 30 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RON"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    /** Storage key for a generated PDF (future) */
    pdfKey: varchar("pdf_key", { length: 500 }),
    /**
     * FIN-604: e-Factura SPV status — null = not exported,
     * 'pending' = XML exported / awaiting submission,
     * 'submitted' = sent to ANAF (future)
     */
    efacturaStatus: varchar("efactura_status", { length: 30 }),
    /**
     * PAY-004: Stripe Payment Intent ID — set when a payment link is created.
     * Used to reconcile the webhook `payment_intent.succeeded` event.
     */
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 100 }),
    /**
     * PAY-004: Stripe Checkout/Payment Link URL — stored so we can display or
     * re-send the same link without creating a new one.
     */
    stripePaymentLinkUrl: varchar("stripe_payment_link_url", { length: 2048 }),
    /**
     * PAY-004: How the invoice was paid — 'card' (Stripe), 'cash', 'transfer', etc.
     * Null if not yet paid.
     */
    paymentMethod: varchar("payment_method", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("invoices_tenant_idx").on(t.tenantId),
    studentIdx: index("invoices_student_idx").on(t.studentId),
    statusIdx: index("invoices_status_idx").on(t.tenantId, t.status),
    numberIdx: index("invoices_number_idx").on(t.tenantId, t.number),
  })
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
