/**
 * GAP-005: Course waitlist — students waiting for a spot in a full course.
 * When a course reaches maxStudents, new students join the waitlist.
 * On spot release, the first in line is notified (48h expiry).
 */
import {
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { students } from "./students";

export const courseWaitlist = pgTable(
  "course_waitlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Position in queue (1 = first to be notified) */
    position: integer("position").notNull(),
    /** When the system notified this student that a spot is available */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /** When the student confirmed enrollment */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Confirmation deadline (notifiedAt + 48h) — null if not yet notified */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("cwl_tenant_idx").on(t.tenantId),
    courseIdx: index("cwl_course_idx").on(t.courseId),
    positionIdx: index("cwl_position_idx").on(t.courseId, t.position),
    /** A student can be in a course's waitlist only once */
    uniqueEntry: unique("cwl_unique_entry").on(t.courseId, t.studentId),
  })
);

export type CourseWaitlistEntry = typeof courseWaitlist.$inferSelect;
export type NewCourseWaitlistEntry = typeof courseWaitlist.$inferInsert;
