/**
 * GAP-010: Student portal tokens — magic-link access for student/parent self-service portal.
 * A UUID token per student, sent by admin via SMS/email. No password required.
 * Token expires after 30 days of non-use (lastUsedAt updated on each access).
 */
import {
  pgTable,
  uuid,
  timestamp,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const studentPortalTokens = pgTable(
  "student_portal_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** The token sent to the student/parent — a UUID used as a secure URL param */
    token: uuid("token").defaultRandom().notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("spt_tenant_idx").on(t.tenantId),
    tokenIdx: index("spt_token_idx").on(t.token),
    studentIdx: index("spt_student_idx").on(t.studentId, t.isActive),
  })
);

export type StudentPortalToken = typeof studentPortalTokens.$inferSelect;
export type NewStudentPortalToken = typeof studentPortalTokens.$inferInsert;
