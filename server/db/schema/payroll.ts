/**
 * HR-401: Payroll entries — monthly salary calculations per teacher.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { teachers } from "./teachers";

export const payrollStatusEnum = pgEnum("payroll_status", [
  "draft",
  "approved",
  "paid",
]);

export const payrollEntries = pgTable(
  "payroll_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    /** Format: YYYY-MM */
    month: varchar("month", { length: 7 }).notNull(),
    totalHours: numeric("total_hours", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    totalCents: integer("total_cents").notNull().default(0),
    commissionCents: integer("commission_cents").notNull().default(0),
    bonusCents: integer("bonus_cents").notNull().default(0),
    status: payrollStatusEnum("status").notNull().default("draft"),
    /** Array of { lessonId, scheduledAt, durationMinutes, rateCents, subtotalCents } */
    breakdown: jsonb("breakdown"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("pe_tenant_idx").on(t.tenantId),
    teacherIdx: index("pe_teacher_idx").on(t.teacherId),
    monthIdx: index("pe_month_idx").on(t.tenantId, t.month),
  })
);

export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type NewPayrollEntry = typeof payrollEntries.$inferInsert;

export interface PayrollBreakdownItem {
  lessonId: string;
  scheduledAt: string;
  durationMinutes: number;
  rateCents: number;
  subtotalCents: number;
}
