import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { lessons } from "./lessons";

/** GAP-013: Make-up credits generated when a lesson is cancelled or attendance is excused */
export const makeupCredits = pgTable(
  "makeup_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** The original lesson that was cancelled/excused */
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 50 }).notNull().default("cancelled"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** The make-up lesson booked using this credit */
    makeupLessonId: uuid("makeup_lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("makeup_tenant_idx").on(t.tenantId),
    studentIdx: index("makeup_student_idx").on(t.tenantId, t.studentId),
    lessonIdx: index("makeup_lesson_idx").on(t.tenantId, t.lessonId),
  })
);

export type MakeupCredit = typeof makeupCredits.$inferSelect;
export type NewMakeupCredit = typeof makeupCredits.$inferInsert;
