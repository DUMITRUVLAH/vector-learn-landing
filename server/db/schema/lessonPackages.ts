/**
 * GAP-006: Lesson packages — prepay bundles of N lessons per student per course.
 * Created early (at GAP-004 conversion step) so convert-trial can attach a package.
 * Full package management (GAP-006) will build on this table.
 */
import {
  pgTable,
  uuid,
  integer,
  boolean,
  date,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { courses } from "./courses";
import { invoices } from "./invoices";

export const lessonPackageStatusEnum = pgEnum("lesson_package_status", [
  "active",
  "exhausted",
  "expired",
  "cancelled",
]);

export const lessonPackages = pgTable(
  "lesson_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    /** Optional FK to the invoice that paid for this package */
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /** Total lessons included in this package */
    unitsTotal: integer("units_total").notNull(),
    /** Remaining lessons (decremented on each present mark) */
    unitsRemaining: integer("units_remaining").notNull(),
    /** GAP-008: Auto-renew when exhausted */
    autoRenew: boolean("auto_renew").notNull().default(false),
    /** GAP-009: If true, make-up lessons do not consume a unit */
    recoveryIncludedInPackage: boolean("recovery_included_in_package").notNull().default(true),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until"),
    status: lessonPackageStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lp_tenant_idx").on(t.tenantId),
    studentIdx: index("lp_student_idx").on(t.studentId),
    courseIdx: index("lp_course_idx").on(t.courseId),
    statusIdx: index("lp_status_idx").on(t.tenantId, t.status),
  })
);

export type LessonPackage = typeof lessonPackages.$inferSelect;
export type NewLessonPackage = typeof lessonPackages.$inferInsert;
