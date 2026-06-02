/**
 * PAY-005: Invoice reminders — tracks which reminder was sent for which invoice.
 * UNIQUE(invoice_id, reminder_day) ensures each reminder type is sent only once.
 */
import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { invoices } from "./invoices";

export const invoiceReminders = pgTable(
  "invoice_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** Days overdue threshold for this reminder (3, 7, or 14) */
    reminderDay: integer("reminder_day").notNull(),
    /** Channel used: email or whatsapp */
    channel: varchar("channel", { length: 20 }).notNull().default("email"),
    /** sent | failed | cancelled */
    status: varchar("status", { length: 20 }).notNull().default("sent"),
    /** Message that was sent */
    body: varchar("body", { length: 2000 }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("invoice_reminders_tenant_idx").on(t.tenantId),
    invoiceIdx: index("invoice_reminders_invoice_idx").on(t.invoiceId),
    /** One reminder per type per invoice (idempotency guarantee) */
    uniqInvoiceDay: unique("invoice_reminders_uniq_invoice_day").on(t.invoiceId, t.reminderDay),
  })
);

export type InvoiceReminder = typeof invoiceReminders.$inferSelect;
export type NewInvoiceReminder = typeof invoiceReminders.$inferInsert;
