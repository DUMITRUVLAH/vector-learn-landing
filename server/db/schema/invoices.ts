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
