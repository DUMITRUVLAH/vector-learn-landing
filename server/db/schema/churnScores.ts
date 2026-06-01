/**
 * AI-A02 — Student churn risk scores
 * Cached results of the AI churn scorer per student.
 */
import {
  pgTable,
  uuid,
  integer,
  varchar,
  jsonb,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const studentChurnScores = pgTable(
  "student_churn_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Risk score 0-100 */
    score: integer("score").notNull().default(0),
    /** Top 3 risk factors in Romanian */
    factors: jsonb("factors").$type<string[]>().notNull().default([]),
    /** Trend compared to previous period */
    trend: varchar("trend", { length: 16 }).notNull().default("stable"),
    /** AI-generated suggested action */
    suggestedAction: text("suggested_action"),
    /** The audit log entry that generated this action */
    auditId: uuid("audit_id"),
    /** When this score was computed */
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("churn_tenant_idx").on(t.tenantId),
    studentIdx: index("churn_student_idx").on(t.tenantId, t.studentId),
    scoreIdx: index("churn_score_idx").on(t.tenantId, t.score),
  })
);

export type StudentChurnScore = typeof studentChurnScores.$inferSelect;
export type NewStudentChurnScore = typeof studentChurnScores.$inferInsert;
