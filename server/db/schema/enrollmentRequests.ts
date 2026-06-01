/**
 * GAP-011: Enrollment requests — public self-enrollment into cohorts.
 * A prospect fills a form, gets a Stripe Checkout URL (or waitlist).
 * On payment completion, a student is created and added to the cohort.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { cohorts } from "./cohorts";

export const enrollmentRequestStatusEnum = pgEnum("enrollment_request_status", [
  "pending",
  "paid",
  "waitlisted",
  "cancelled",
]);

export const enrollmentRequests = pgTable(
  "enrollment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    status: enrollmentRequestStatusEnum("status").notNull().default("pending"),
    /** Stripe Checkout Session ID — set when a session is created */
    stripeSessionId: varchar("stripe_session_id", { length: 200 }),
    /** Created student ID after payment webhook resolves */
    createdStudentId: uuid("created_student_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("er_tenant_idx").on(t.tenantId),
    cohortIdx: index("er_cohort_idx").on(t.cohortId, t.status),
    emailIdx: index("er_email_idx").on(t.email),
  })
);

export type EnrollmentRequest = typeof enrollmentRequests.$inferSelect;
export type NewEnrollmentRequest = typeof enrollmentRequests.$inferInsert;
