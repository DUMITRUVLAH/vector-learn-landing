/**
 * GAP-009: Recovery requests — make-up lessons for absent students.
 * When a student is marked absent, a recovery_request is created automatically
 * with up to 3 suggested slots. The guardian can choose via a tokenized link (48h TTL).
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { studentLessons } from "./lessons";
import { lessons } from "./lessons";

export const recoveryStatusEnum = pgEnum("recovery_status", [
  "pending",
  "reserved",
  "expired",
  "completed",
]);

/** A slot suggestion stored in suggestedSlots jsonb */
export interface RecoverySuggestedSlot {
  lessonId: string;
  scheduledAt: string; // ISO datetime
  teacherName: string;
  courseName: string;
}

export const recoveryRequests = pgTable(
  "recovery_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The absent student_lesson that triggered this recovery */
    studentLessonId: uuid("student_lesson_id")
      .notNull()
      .references(() => studentLessons.id, { onDelete: "cascade" }),
    status: recoveryStatusEnum("status").notNull().default("pending"),
    /** JSON array of { lessonId, scheduledAt, teacherName, courseName } */
    suggestedSlots: jsonb("suggested_slots").$type<RecoverySuggestedSlot[]>().notNull().default([]),
    /** Set when the guardian reserves a specific slot */
    reservedLessonId: uuid("reserved_lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    /** Short-lived JWT token for public (no-auth) access — unique per request */
    token: varchar("token", { length: 500 }).notNull().unique(),
    /** 48h from creation — after this the request auto-expires */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("rr_tenant_idx").on(t.tenantId),
    tokenIdx: index("rr_token_idx").on(t.token),
    studentLessonUniq: unique("rr_student_lesson_uniq").on(t.studentLessonId),
  })
);

export type RecoveryRequest = typeof recoveryRequests.$inferSelect;
export type NewRecoveryRequest = typeof recoveryRequests.$inferInsert;
