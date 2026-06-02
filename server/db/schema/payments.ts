import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { promoCodes } from "./promoCodes"; // COURSE-203
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "overdue",
  "refunded",
  "cancelled",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    description: varchar("description", { length: 500 }),
    // COURSE-203: optional promo code applied to this payment
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id, {
      onDelete: "set null",
    }),
    originalAmountCents: integer("original_amount_cents"), // before discount
    /** INTEG-102: optional FK to the course this payment is for */
    courseId: uuid("course_id").references((): AnyPgColumn => {
      // Lazy import to avoid circular dependency — courses imports payments indirectly
      const { courses } = require("./courses");
      return courses.id;
    }, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("payments_tenant_idx").on(t.tenantId),
    studentIdx: index("payments_student_idx").on(t.studentId),
    statusIdx: index("payments_status_idx").on(t.tenantId, t.status),
  })
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
