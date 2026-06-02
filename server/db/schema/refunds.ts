/**
 * PAY-007: Refunds — partial or full refund on a paid invoice.
 * Manual refunds (cash/transfer) are recorded in system only.
 * Stripe refunds trigger the Stripe Refund API automatically.
 */
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
import { users } from "./users";
import { invoices } from "./invoices";

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "completed",
  "failed",
]);

export const refundMethodEnum = pgEnum("refund_method", [
  "stripe",
  "manual",
]);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RON"),
    reason: text("reason").notNull(),
    method: refundMethodEnum("method").notNull().default("manual"),
    /** Stripe refund ID when method = 'stripe' */
    stripeRefundId: varchar("stripe_refund_id", { length: 100 }),
    /** User who processed the refund */
    processedBy: uuid("processed_by").references(() => users.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    status: refundStatusEnum("status").notNull().default("completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("refunds_tenant_idx").on(t.tenantId),
    invoiceIdx: index("refunds_invoice_idx").on(t.invoiceId),
    statusIdx: index("refunds_status_idx").on(t.tenantId, t.status),
  })
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
