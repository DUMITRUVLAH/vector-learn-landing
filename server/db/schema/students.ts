import { pgTable, uuid, varchar, timestamp, pgEnum, date, index, integer, jsonb, time } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { families } from "./families";

export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "trial",
  "paused",
  "archived",
]);

export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    parentPhone: varchar("parent_phone", { length: 32 }),
    parentEmail: varchar("parent_email", { length: 255 }),
    birthDate: date("birth_date"),
    status: studentStatusEnum("status").notNull().default("active"),
    notes: varchar("notes", { length: 1000 }),
    /** CRM-111: Link to payer family — plătitor↔elevi relationship */
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    /** FIN-602: Total outstanding debt in cents (floored at 0) */
    debtCents: integer("debt_cents").notNull().default(0),
    /** GAP-001: Preferred days of week (array of ints 1–7, Mon=1) */
    preferredDays: jsonb("preferred_days").$type<number[]>(),
    /** GAP-001: Preferred time window start (e.g. "17:00") */
    preferredTimeStart: time("preferred_time_start"),
    /** GAP-001: Preferred time window end (e.g. "19:00") */
    preferredTimeEnd: time("preferred_time_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("students_tenant_idx").on(t.tenantId),
    statusIdx: index("students_status_idx").on(t.tenantId, t.status),
    nameIdx: index("students_name_idx").on(t.tenantId, t.fullName),
    debtIdx: index("students_debt_idx").on(t.tenantId, t.debtCents),
  })
);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
