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
     * EFMD: SIA e-Factura Moldova (SFS) — integrare semiautomatizată.
     * Seria + numărul sub care factura e înregistrată la SFS.
     */
    efacturaMdSeria: varchar("efactura_md_seria", { length: 20 }),
    efacturaMdNumber: varchar("efactura_md_number", { length: 30 }),
    /** Statutul SFS al facturii: 0=Draft, 1=Semnat Furnizor, 2=Refuzat, 3=Acceptat, 5=Anulat, 6=Arhivat, 7=Trimis, 8=Semnat Cumpărător, 10=Transportat */
    efacturaMdStatus: integer("efactura_md_status"),
    /** RequestId-ul transmiterii (reconciliere cu GetLogs/SearchInvoices). */
    efacturaMdRequestId: varchar("efactura_md_request_id", { length: 64 }),
    efacturaMdSubmittedAt: timestamp("efactura_md_submitted_at", { withTimezone: true }),
    /** Ultimul mesaj de eroare/diagnostic primit de la SFS. */
    efacturaMdMessage: text("efactura_md_message"),
    // GAP-014: Stripe Checkout fields
    stripeSessionId: varchar("stripe_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    paidOnline: varchar("paid_online", { length: 5 }).default("false"),
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
