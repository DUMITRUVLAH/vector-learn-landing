import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { students } from "./students";
import { teachers } from "./teachers";
import { lessons } from "./lessons";

/** GAP-012: Skills defined per course (e.g. "Pronunție", "Vocabular") */
export const progressSkills = pgTable(
  "progress_skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("prskills_tenant_idx").on(t.tenantId),
    courseIdx: index("prskills_course_idx").on(t.tenantId, t.courseId),
  })
);

export type ProgressSkill = typeof progressSkills.$inferSelect;
export type NewProgressSkill = typeof progressSkills.$inferInsert;

/** GAP-012: Individual evaluation entries per student per skill */
export const progressEntries = pgTable(
  "progress_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => progressSkills.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    /** Score 0–100 */
    score: integer("score").notNull(),
    comment: varchar("comment", { length: 1000 }),
    evaluatedBy: uuid("evaluated_by").references(() => teachers.id, { onDelete: "set null" }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("prentries_tenant_idx").on(t.tenantId),
    studentIdx: index("prentries_student_idx").on(t.tenantId, t.studentId),
    skillIdx: index("prentries_skill_idx").on(t.tenantId, t.skillId),
    timeIdx: index("prentries_time_idx").on(t.tenantId, t.studentId, t.evaluatedAt),
  })
);

export type ProgressEntry = typeof progressEntries.$inferSelect;
export type NewProgressEntry = typeof progressEntries.$inferInsert;
