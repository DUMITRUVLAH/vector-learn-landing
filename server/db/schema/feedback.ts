/**
 * FB-001..004: Feedback forms sent to students (cursanți) and analyzed.
 *
 * Model:
 *   feedback_forms      — a configurable form. One of 3 stage templates:
 *                         initial (după prima săptămână), mid (mijloc curs), final.
 *                         Tenant-scoped. Optionally bound to a course.
 *   feedback_questions  — ordered questions belonging to a form.
 *   feedback_invitations— one row per (form, student) the form was sent to.
 *                         Carries a public token so the student can open + submit
 *                         without logging in. Status: pending → submitted.
 *   feedback_answers    — one row per (invitation, question) answer.
 *
 * Flow: build form → send to a set of students (creates invitations) →
 *       student submits answers via public token → manager analyzes aggregates.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { courses } from "./courses";
import { students } from "./students";

/** The three lifecycle stages the owner specified. */
export const feedbackStageEnum = pgEnum("feedback_stage", ["initial", "mid", "final"]);

/** Question input types. */
export const feedbackQuestionTypeEnum = pgEnum("feedback_question_type", [
  "rating", // 1–5 stars
  "scale", // 0–10 NPS-style
  "single", // single choice from options
  "multi", // multiple choice from options
  "text", // free text
  "yesno", // yes / no
]);

export const feedbackInvitationStatusEnum = pgEnum("feedback_invitation_status", [
  "pending",
  "submitted",
]);

/** Default stage metadata — labels + descriptions match the owner's spec. */
export const FEEDBACK_STAGE_META: Record<
  "initial" | "mid" | "final",
  { label: string; description: string }
> = {
  initial: {
    label: "Feedback Inițial",
    description: "Trimis după prima săptămână de curs",
  },
  mid: {
    label: "Feedback Mijloc Curs",
    description: "Trimis la jumătatea cursului",
  },
  final: {
    label: "Feedback Final",
    description: "Trimis la finalul cursului",
  },
};

export const feedbackForms = pgTable(
  "feedback_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stage: feedbackStageEnum("stage").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    /** Optional: scope this form to a specific course (null = applies to all courses). */
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
    /** Draft forms can be edited; active forms can be sent. */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ff_tenant_idx").on(t.tenantId),
    stageIdx: index("ff_stage_idx").on(t.tenantId, t.stage),
  })
);

export const feedbackQuestions = pgTable(
  "feedback_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "cascade" }),
    type: feedbackQuestionTypeEnum("type").notNull(),
    label: varchar("label", { length: 500 }).notNull(),
    /** JSON array of option strings (single/multi only), stored as text. */
    options: text("options").notNull().default("[]"),
    required: boolean("required").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    formIdx: index("fq_form_idx").on(t.formId, t.position),
    tenantIdx: index("fq_tenant_idx").on(t.tenantId),
  })
);

export const feedbackInvitations = pgTable(
  "feedback_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Public, unguessable token used in the student-facing link. */
    token: varchar("token", { length: 64 }).notNull(),
    status: feedbackInvitationStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => ({
    tokenIdx: uniqueIndex("fi_token_idx").on(t.token),
    // One invitation per student per form.
    formStudentIdx: uniqueIndex("fi_form_student_idx").on(t.formId, t.studentId),
    tenantIdx: index("fi_tenant_idx").on(t.tenantId),
    statusIdx: index("fi_status_idx").on(t.formId, t.status),
  })
);

export const feedbackAnswers = pgTable(
  "feedback_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => feedbackInvitations.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => feedbackQuestions.id, { onDelete: "cascade" }),
    /** Numeric value for rating/scale/yesno (yes=1,no=0); null otherwise. */
    valueNumber: integer("value_number"),
    /** Text value for text answers and the joined label(s) of single/multi. */
    valueText: text("value_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invitationIdx: index("fa_invitation_idx").on(t.invitationId),
    questionIdx: index("fa_question_idx").on(t.questionId),
    tenantIdx: index("fa_tenant_idx").on(t.tenantId),
  })
);

export type FeedbackForm = typeof feedbackForms.$inferSelect;
export type NewFeedbackForm = typeof feedbackForms.$inferInsert;
export type FeedbackQuestion = typeof feedbackQuestions.$inferSelect;
export type NewFeedbackQuestion = typeof feedbackQuestions.$inferInsert;
export type FeedbackInvitation = typeof feedbackInvitations.$inferSelect;
export type NewFeedbackInvitation = typeof feedbackInvitations.$inferInsert;
export type FeedbackAnswer = typeof feedbackAnswers.$inferSelect;
export type NewFeedbackAnswer = typeof feedbackAnswers.$inferInsert;

/** Generate an unguessable invitation token (URL-safe). */
export function generateInvitationToken(): string {
  // 32 hex chars = 128 bits of entropy; collision-safe + unique index guards it.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
