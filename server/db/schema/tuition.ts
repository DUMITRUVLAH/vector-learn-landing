/**
 * SCHOOL-004 — Schema taxe școlare (tuition billing)
 *
 * Entități:
 *   tuition_plans         — Plan de taxă (sumă anuală/per termen/lunar)
 *   tuition_installments  — Rate ale unui plan
 *   student_tuition       — Asignarea unui elev la un plan, cu reduceri
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  numeric,
  date,
  text,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { academicYears, schoolClasses } from "./school";

// ─── Enum ─────────────────────────────────────────────────────────────────────

export const billingCycleEnum = pgEnum("billing_cycle", [
  "annual",
  "per_term",
  "monthly",
]);

// ─── tuition_plans ────────────────────────────────────────────────────────────

export const tuitionPlans = pgTable(
  "tuition_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id, { onDelete: "cascade" }),
    /** Ex. „Taxă anuală 2026-2027 — Primar" */
    name: varchar("name", { length: 200 }).notNull(),
    /** Suma totală în cenți (ex. 1500000 = 15.000 RON) */
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("RON"),
    billingCycle: billingCycleEnum("billing_cycle").notNull().default("annual"),
    /** Procentul de reducere per copil suplimentar (ex. 10 = 10%) */
    siblingDiscountPercent: numeric("sibling_discount_percent", { precision: 4, scale: 1 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantYearIdx: index("tuition_plans_tenant_year_idx").on(t.tenantId, t.academicYearId),
  })
);

export type TuitionPlan = typeof tuitionPlans.$inferSelect;
export type NewTuitionPlan = typeof tuitionPlans.$inferInsert;

// ─── tuition_installments ─────────────────────────────────────────────────────

export const tuitionInstallments = pgTable(
  "tuition_installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => tuitionPlans.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    orderIndex: integer("order_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePlanOrder: unique("tuition_installments_plan_order_unique").on(t.planId, t.orderIndex),
    tenantPlanIdx: index("tuition_installments_tenant_plan_idx").on(t.tenantId, t.planId),
  })
);

export type TuitionInstallment = typeof tuitionInstallments.$inferSelect;
export type NewTuitionInstallment = typeof tuitionInstallments.$inferInsert;

// ─── student_tuition ──────────────────────────────────────────────────────────

export const studentTuition = pgTable(
  "student_tuition",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => tuitionPlans.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => schoolClasses.id, { onDelete: "set null" }),
    /** 1 = primul copil din familie (fără reducere), 2,3 = frați cu reducere */
    siblingRank: integer("sibling_rank").notNull().default(1),
    /** Bursă ca sumă fixă în cenți */
    scholarshipAmountCents: integer("scholarship_amount_cents").notNull().default(0),
    /** Bursă ca procent (0–100) */
    scholarshipPercent: numeric("scholarship_percent", { precision: 4, scale: 1 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueStudentPlan: unique("student_tuition_student_plan_unique").on(t.studentId, t.planId),
    tenantStudentIdx: index("student_tuition_tenant_student_idx").on(t.tenantId, t.studentId),
  })
);

export type StudentTuition = typeof studentTuition.$inferSelect;
export type NewStudentTuition = typeof studentTuition.$inferInsert;
