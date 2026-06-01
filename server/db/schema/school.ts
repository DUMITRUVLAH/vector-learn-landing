/**
 * SCHOOL-001 — Schema fundație pentru modul de școală privată K-12
 *
 * Entități:
 *   academic_years      — An școlar (ex. „2026–2027"), unul curent per tenant
 *   academic_terms      — Termene / semestre / trimestre ale unui an
 *   school_classes      — Clase permanente (ex. „a V-a A") cu diriginte
 *   class_enrollments   — Înscrierea unui elev într-o clasă
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  date,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { teachers } from "./teachers";
import { students } from "./students";

// ─── Enum ─────────────────────────────────────────────────────────────────────

export const classEnrollmentStatusEnum = pgEnum("class_enrollment_status", [
  "active",
  "transferred",
  "withdrawn",
]);

// ─── academic_years ───────────────────────────────────────────────────────────

export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Ex. „2026–2027" */
    name: varchar("name", { length: 100 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /**
     * Cel mult un an curent per tenant — enforced în rută (setarea unuia nou
     * îl scoate pe cel vechi din curent).
     */
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("academic_years_tenant_idx").on(t.tenantId),
    tenantCurrentIdx: index("academic_years_tenant_current_idx").on(t.tenantId, t.isCurrent),
  })
);

export type AcademicYear = typeof academicYears.$inferSelect;
export type NewAcademicYear = typeof academicYears.$inferInsert;

// ─── academic_terms ───────────────────────────────────────────────────────────

export const academicTerms = pgTable(
  "academic_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    /** Ex. „Semestrul I", „Trimestrul 2" */
    name: varchar("name", { length: 100 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Ordinea în an (1, 2, 3…) */
    orderIndex: integer("order_index").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantYearIdx: index("academic_terms_tenant_year_idx").on(t.tenantId, t.academicYearId),
    orderIdx: index("academic_terms_order_idx").on(t.academicYearId, t.orderIndex),
  })
);

export type AcademicTerm = typeof academicTerms.$inferSelect;
export type NewAcademicTerm = typeof academicTerms.$inferInsert;

// ─── school_classes ───────────────────────────────────────────────────────────

export const schoolClasses = pgTable(
  "school_classes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    /** Ex. „a V-a A", derivat din gradeLevel + section */
    name: varchar("name", { length: 100 }).notNull(),
    /** Numărul clasei: „1", „5", „12" */
    gradeLevel: varchar("grade_level", { length: 10 }).notNull(),
    /** Litera secțiunii: „A", „B", null pentru singura secțiune */
    section: varchar("section", { length: 10 }),
    /** Profesorul diriginte — opțional */
    homeroomTeacherId: uuid("homeroom_teacher_id").references(() => teachers.id, {
      onDelete: "set null",
    }),
    /** Capacitate maximă de elevi, null = nelimitată */
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantYearIdx: index("school_classes_tenant_year_idx").on(t.tenantId, t.academicYearId),
    tenantNameIdx: index("school_classes_tenant_name_idx").on(t.tenantId, t.name),
  })
);

export type SchoolClass = typeof schoolClasses.$inferSelect;
export type NewSchoolClass = typeof schoolClasses.$inferInsert;

// ─── class_enrollments ────────────────────────────────────────────────────────

export const classEnrollments = pgTable(
  "class_enrollments",
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
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    status: classEnrollmentStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Un elev poate fi înscris o singură dată într-o clasă */
    uniqueClassStudent: unique("class_enrollments_class_student_unique").on(
      t.classId,
      t.studentId
    ),
    tenantStudentIdx: index("class_enrollments_tenant_student_idx").on(t.tenantId, t.studentId),
    classIdx: index("class_enrollments_class_idx").on(t.classId),
  })
);

export type ClassEnrollment = typeof classEnrollments.$inferSelect;
export type NewClassEnrollment = typeof classEnrollments.$inferInsert;
