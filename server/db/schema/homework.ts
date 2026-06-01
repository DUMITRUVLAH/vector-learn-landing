/**
 * GAP-015: Homework / assignments per lesson + student submissions
 *
 * lesson_homework — a teacher creates homework tasks for a lesson
 * homework_submissions — a student marks homework as submitted
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { lessons } from "./lessons";
import { students } from "./students";
import { users } from "./users";

export const lessonHomework = pgTable(
  "lesson_homework",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lesson_homework_tenant_idx").on(t.tenantId),
    lessonIdx: index("lesson_homework_lesson_idx").on(t.lessonId),
  })
);

export type LessonHomework = typeof lessonHomework.$inferSelect;
export type NewLessonHomework = typeof lessonHomework.$inferInsert;

export const homeworkSubmissions = pgTable(
  "homework_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    homeworkId: uuid("homework_id")
      .notNull()
      .references(() => lessonHomework.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("homework_submissions_tenant_idx").on(t.tenantId),
    homeworkIdx: index("homework_submissions_homework_idx").on(t.homeworkId),
    studentIdx: index("homework_submissions_student_idx").on(t.studentId),
    uniqueSubmission: unique("homework_submissions_unique").on(t.homeworkId, t.studentId),
  })
);

export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type NewHomeworkSubmission = typeof homeworkSubmissions.$inferInsert;
