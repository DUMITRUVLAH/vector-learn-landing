import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { teachers } from "./teachers";
import { students } from "./students";
import { users } from "./users";

export const lessonStatusEnum = pgEnum("lesson_status", [
  "scheduled",
  "completed",
  "cancelled",
  "rescheduled",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
  "pending",
]);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    status: lessonStatusEnum("status").notNull().default("scheduled"),
    meetingUrl: varchar("meeting_url", { length: 500 }),
    notes: varchar("notes", { length: 2000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lessons_tenant_idx").on(t.tenantId),
    teacherTimeIdx: index("lessons_teacher_time_idx").on(t.teacherId, t.scheduledAt),
    timeIdx: index("lessons_time_idx").on(t.tenantId, t.scheduledAt),
  })
);

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;

export const studentLessons = pgTable(
  "student_lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    attendanceStatus: attendanceStatusEnum("attendance_status").notNull().default("pending"),
    markedBy: uuid("marked_by").references(() => users.id, { onDelete: "set null" }),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("sl_tenant_idx").on(t.tenantId),
    lessonIdx: index("sl_lesson_idx").on(t.lessonId),
    studentIdx: index("sl_student_idx").on(t.studentId),
  })
);

export type StudentLesson = typeof studentLessons.$inferSelect;
export type NewStudentLesson = typeof studentLessons.$inferInsert;
