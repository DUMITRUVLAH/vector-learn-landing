/**
 * PAY-006: Payment plans — allows splitting a payment into N installments.
 * Each plan generates N invoices with different due dates.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const paymentPlanStatusEnum = pgEnum("payment_plan_status", [
  "active",
  "completed",
  "cancelled",
]);

export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Optional: course or subscription this plan is for */
    description: varchar("description", { length: 500 }),
    /** Total amount in cents for the entire plan */
    totalAmountCents: integer("total_amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RON"),
    /** Number of installments */
    installmentsCount: integer("installments_count").notNull(),
    /** Days between installments (e.g. 30 = monthly) */
    intervalDays: integer("interval_days").notNull().default(30),
    status: paymentPlanStatusEnum("status").notNull().default("active"),
    /** ID of user who created the plan */
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("payment_plans_tenant_idx").on(t.tenantId),
    studentIdx: index("payment_plans_student_idx").on(t.studentId),
    statusIdx: index("payment_plans_status_idx").on(t.tenantId, t.status),
  })
);

export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type NewPaymentPlan = typeof paymentPlans.$inferInsert;
