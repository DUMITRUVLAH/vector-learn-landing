/**
 * COURSE-102: Groups (classes) as scheduling entities.
 * A group = a recurring class: course × teacher × room × schedule.
 * Students are enrolled into groups, not into courses directly.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { teachers } from "./teachers";
import { rooms } from "./rooms";

/**
 * Schedule template stored as jsonb:
 * { days: ["Luni", "Miercuri"], startTime: "14:00", endTime: "15:00" }
 */
export interface ScheduleTemplate {
  days: string[];
  startTime: string;
  endTime: string;
}

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id")
      .references(() => teachers.id, { onDelete: "set null" }),
    roomId: uuid("room_id")
      .references(() => rooms.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** JSON schedule: { days, startTime, endTime } */
    scheduleTemplate: jsonb("schedule_template").$type<ScheduleTemplate>(),
    maxStudents: integer("max_students").notNull().default(20),
    /** active | archived */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("groups_tenant_idx").on(t.tenantId),
    courseIdx: index("groups_course_idx").on(t.courseId),
    statusIdx: index("groups_status_idx").on(t.tenantId, t.status),
  })
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
