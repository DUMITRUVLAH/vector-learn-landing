/**
 * COURSE-103: Group enrollments — student ↔ group association.
 * Unique per (group_id, student_id). Supports soft-removal.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { groups } from "./groups";
import { students } from "./students";

export const groupEnrollments = pgTable(
  "group_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    /** active | removed */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("group_enrollments_tenant_idx").on(t.tenantId),
    groupIdx: index("group_enrollments_group_idx").on(t.groupId),
    studentIdx: index("group_enrollments_student_idx").on(t.studentId),
    // Unique constraint: one active enrollment per student per group
    uniqueEnrollment: unique("group_enrollments_unique").on(t.groupId, t.studentId),
  })
);

export type GroupEnrollment = typeof groupEnrollments.$inferSelect;
export type NewGroupEnrollment = typeof groupEnrollments.$inferInsert;
