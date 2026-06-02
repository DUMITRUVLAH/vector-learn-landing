/**
 * MOB-102: Homework and submissions schema
 * Teachers create homework assignments per lesson;
 * students submit text or image responses.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { lessons } from "./lessons";
import { students } from "./students";

export const homeworkStatusEnum = pgEnum("homework_status", [
  "pending",
  "submitted",
  "graded",
]);

export const homework = pgTable(
  "homework",
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
    /** Assignment description / instructions */
    body: text("body").notNull(),
    /** Deadline for submission */
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    status: homeworkStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("hw_tenant_idx").on(t.tenantId),
    studentIdx: index("hw_student_idx").on(t.studentId),
    lessonIdx: index("hw_lesson_idx").on(t.lessonId),
    deadlineIdx: index("hw_deadline_idx").on(t.studentId, t.deadline),
  })
);

export type Homework = typeof homework.$inferSelect;
export type NewHomework = typeof homework.$inferInsert;

export const homeworkSubmissions = pgTable(
  "homework_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    homeworkId: uuid("homework_id")
      .notNull()
      .references(() => homework.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    textBody: text("text_body"),
    imageUrl: varchar("image_url", { length: 500 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("hws_tenant_idx").on(t.tenantId),
    homeworkIdx: index("hws_homework_idx").on(t.homeworkId),
    studentIdx: index("hws_student_idx").on(t.studentId),
  })
);

export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type NewHomeworkSubmission = typeof homeworkSubmissions.$inferInsert;
