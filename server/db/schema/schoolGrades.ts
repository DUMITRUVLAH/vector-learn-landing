/**
 * SCHOOL-002 — Schema catalog de note (gradebook) pentru modul de școală privată K-12
 *
 * Entități:
 *   school_subjects  — materii per tenant (Matematică, Română, …)
 *   grade_entries    — notă per elev per materie per termen + pondere + tip
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  numeric,
  date,
  pgEnum,
  index,
  text,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { teachers } from "./teachers";
import { students } from "./students";
import { schoolClasses, academicTerms } from "./school";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const gradeTypeEnum = pgEnum("grade_type", [
  "test",
  "homework",
  "oral",
  "final",
]);

// ─── school_subjects ──────────────────────────────────────────────────────────

export const schoolSubjects = pgTable(
  "school_subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Ex. „Matematică" */
    name: varchar("name", { length: 100 }).notNull(),
    /** Ex. „MAT" — opțional, pentru prescurtări */
    code: varchar("code", { length: 20 }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("school_subjects_tenant_idx").on(t.tenantId),
  })
);

export type SchoolSubject = typeof schoolSubjects.$inferSelect;
export type NewSchoolSubject = typeof schoolSubjects.$inferInsert;

// ─── grade_entries ────────────────────────────────────────────────────────────

export const gradeEntries = pgTable(
  "grade_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => schoolClasses.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => schoolSubjects.id, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => academicTerms.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    /** Nota: tipic 1–10 sau 1–100, zecimale permise */
    value: numeric("value", { precision: 5, scale: 2 }).notNull(),
    /** Ponderea notei în calculul mediei (default 1) */
    weight: numeric("weight", { precision: 4, scale: 2 }).notNull().default("1"),
    /** Tipul notei */
    type: gradeTypeEnum("type").notNull().default("test"),
    /** Titlul notei/temei (ex. „Lucrare scrisă sem. I") */
    title: varchar("title", { length: 200 }),
    gradedAt: date("graded_at").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantClassStudentIdx: index("grade_entries_tenant_class_student_idx").on(
      t.tenantId,
      t.classId,
      t.studentId
    ),
    tenantStudentTermIdx: index("grade_entries_tenant_student_term_idx").on(
      t.tenantId,
      t.studentId,
      t.termId
    ),
    tenantSubjectTermIdx: index("grade_entries_tenant_subject_term_idx").on(
      t.tenantId,
      t.subjectId,
      t.termId
    ),
  })
);

export type GradeEntry = typeof gradeEntries.$inferSelect;
export type NewGradeEntry = typeof gradeEntries.$inferInsert;
