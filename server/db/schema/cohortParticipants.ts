/**
 * CX-703 — Cohort participants
 *
 * Participants can come from two sources:
 *   - "crm": students enrolled in the cohort (from CRM-111 lead→student conversion)
 *   - "manual": directly added via the UI (participants who paid cash, etc.)
 *
 * Payment status mirrors copy-roas enum:
 *   full     → paid in full
 *   half     → paid 50%
 *   pending  → payment expected
 *   free     → gratis / auditor
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { cohorts } from "./cohorts";
import { students } from "./students";

export const participantPaymentStatusEnum = pgEnum("participant_payment_status", [
  "full",
  "half",
  "pending",
  "free",
]);

export const participantSourceEnum = pgEnum("participant_source", ["crm", "manual"]);

export const cohortParticipants = pgTable(
  "cohort_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    /**
     * Set for CRM-sourced participants (link to students table).
     * Null for manual participants.
     */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    /** Display name — copied from student.fullName for CRM, typed for manual */
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    notes: varchar("notes", { length: 1000 }),
    /** WhatsApp group membership toggle */
    whatsappJoined: boolean("whatsapp_joined").notNull().default(false),
    paymentStatus: participantPaymentStatusEnum("payment_status"),
    /** Amount paid / expected in cents */
    amountCents: integer("amount_cents").notNull().default(0),
    source: participantSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCohortIdx: index("cohort_participants_tenant_cohort_idx").on(
      t.tenantId,
      t.cohortId
    ),
    cohortIdx: index("cohort_participants_cohort_idx").on(t.cohortId),
  })
);

export type CohortParticipant = typeof cohortParticipants.$inferSelect;
export type NewCohortParticipant = typeof cohortParticipants.$inferInsert;
