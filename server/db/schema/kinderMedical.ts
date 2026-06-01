/**
 * KINDER-004 — Medical: allergies, immunization records, medication log
 *
 * child_allergies: per-student allergy records with reaction severity
 * immunization_records: vaccine history with due-date tracking
 * medication_log: daily medication administration journal
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  date,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

export const reactionTypeEnum = pgEnum("reaction_type", [
  "mild",
  "moderate",
  "severe",
]);

/**
 * Known allergies per student.
 * Shown as a warning banner in check-in and diary views.
 */
export const childAllergies = pgTable(
  "child_allergies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    allergen: varchar("allergen", { length: 200 }).notNull(),
    reactionType: reactionTypeEnum("reaction_type").notNull().default("mild"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("child_allergies_tenant_idx").on(t.tenantId),
    studentIdx: index("child_allergies_student_idx").on(t.studentId),
  })
);

/**
 * Immunization records per student.
 * `next_due_date` triggers alerts when approaching or past.
 */
export const immunizationRecords = pgTable(
  "immunization_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    vaccineName: varchar("vaccine_name", { length: 200 }).notNull(),
    administeredDate: date("administered_date"),
    nextDueDate: date("next_due_date"),
    provider: varchar("provider", { length: 200 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("immunization_records_tenant_idx").on(t.tenantId),
    studentIdx: index("immunization_records_student_idx").on(t.studentId),
    dueDateIdx: index("immunization_records_due_date_idx").on(t.nextDueDate),
  })
);

/**
 * Daily medication administration log.
 * One row per medication per administration event.
 */
export const medicationLog = pgTable(
  "medication_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    medicationName: varchar("medication_name", { length: 200 }).notNull(),
    dosage: varchar("dosage", { length: 100 }).notNull(),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull(),
    administeredByUserId: uuid("administered_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    /** Parent gave written/digital consent for this medication */
    parentConsent: boolean("parent_consent").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("medication_log_tenant_idx").on(t.tenantId),
    studentDateIdx: index("medication_log_student_date_idx").on(t.studentId, t.logDate),
    tenantDateIdx: index("medication_log_tenant_date_idx").on(t.tenantId, t.logDate),
  })
);

export type ChildAllergy = typeof childAllergies.$inferSelect;
export type NewChildAllergy = typeof childAllergies.$inferInsert;
export type ImmunizationRecord = typeof immunizationRecords.$inferSelect;
export type NewImmunizationRecord = typeof immunizationRecords.$inferInsert;
export type MedicationLog = typeof medicationLog.$inferSelect;
export type NewMedicationLog = typeof medicationLog.$inferInsert;
