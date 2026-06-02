/**
 * GUARDIAN-001 — Schema tutori autorizați per elev
 *
 * Entități:
 *   student_guardians — tutori (părinți, bunici, îngrijitori) cu drepturi/permisiuni per elev
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

// ─── student_guardians ────────────────────────────────────────────────────────

export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Ex. „Maria Ionescu" */
    fullName: varchar("full_name", { length: 200 }).notNull(),
    /** Ex. „Mamă", „Tată", „Bunic", „Tutore legal" */
    relationship: varchar("relationship", { length: 50 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    /**
     * Tutorele principal — maxim 1 per elev.
     * Enforced în rută: setarea unuia ca primar scoate primarul anterior.
     */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Drept legal de custodie */
    hasCustody: boolean("has_custody").notNull().default(true),
    /** Poate ridica fizic copilul de la școală */
    canPickup: boolean("can_pickup").notNull().default(true),
    /** Primește notificări, facturi, note */
    receivesCommunications: boolean("receives_communications").notNull().default(true),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStudentIdx: index("student_guardians_tenant_student_idx").on(t.tenantId, t.studentId),
  })
);

export type StudentGuardian = typeof studentGuardians.$inferSelect;
export type NewStudentGuardian = typeof studentGuardians.$inferInsert;
