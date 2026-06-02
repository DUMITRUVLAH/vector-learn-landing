import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { teachers } from "./teachers";
import { students } from "./students";

// COURSE-202: group status
export const groupStatusEnum = pgEnum("group_status", ["active", "archived"]);

/**
 * COURSE-202: A group (class section) belongs to a course.
 * max_students enforces capacity; group_waitlist holds overflow.
 */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    teacherId: uuid("teacher_id").references(() => teachers.id, {
      onDelete: "set null",
    }),
    maxStudents: integer("max_students").notNull().default(20),
    status: groupStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("groups_tenant_idx").on(t.tenantId),
    courseIdx: index("groups_course_idx").on(t.courseId),
    tenantCourseIdx: index("groups_tenant_course_idx").on(
      t.tenantId,
      t.courseId
    ),
  })
);

/**
 * COURSE-202: Many-to-many enrollment of students into groups.
 */
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
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    groupIdx: index("ge_group_idx").on(t.groupId),
    studentIdx: index("ge_student_idx").on(t.studentId),
    tenantIdx: index("ge_tenant_idx").on(t.tenantId),
  })
);

/**
 * COURSE-202: Waitlist for full groups. FIFO by created_at.
 */
export const groupWaitlist = pgTable(
  "group_waitlist",
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    groupIdx: index("gw_group_idx").on(t.groupId),
    studentIdx: index("gw_student_idx").on(t.studentId),
    tenantIdx: index("gw_tenant_idx").on(t.tenantId),
    // For FIFO promotion: order by group + created_at
    fifoIdx: index("gw_fifo_idx").on(t.groupId, t.createdAt),
  })
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupEnrollment = typeof groupEnrollments.$inferSelect;
export type GroupWaitlist = typeof groupWaitlist.$inferSelect;
