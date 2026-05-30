import {
  pgTable,
  uuid,
  varchar,
  integer,
  smallint,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RON"),
    /** Day of month 1–28 when invoice is generated */
    billingDay: smallint("billing_day").notNull(),
    description: varchar("description", { length: 200 }),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    /** Next date this subscription should be billed */
    nextBillingDate: date("next_billing_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("subscriptions_tenant_idx").on(t.tenantId),
    studentIdx: index("subscriptions_student_idx").on(t.studentId),
    statusIdx: index("subscriptions_status_idx").on(t.tenantId, t.status),
    billingIdx: index("subscriptions_billing_idx").on(t.tenantId, t.nextBillingDate),
  })
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
