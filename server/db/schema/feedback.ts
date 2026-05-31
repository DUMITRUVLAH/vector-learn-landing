/**
 * FEEDBACK-601 — Feedback forms sent to students/parents.
 *
 * Flow: manager builds form → sends to student (creates invitation with token) →
 *       student submits via public no-auth endpoint → manager sees aggregate scores.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  text,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";

export const feedbackQuestionTypeEnum = pgEnum("feedback_question_type", [
  "rating",  // 1–5 stars
  "nps",     // 0–10 Net Promoter Score
  "text",    // free text answer
  "yesno",   // yes / no
]);

export const feedbackInvitationStatusEnum = pgEnum("feedback_invitation_status", [
  "pending",
  "submitted",
]);

/** A feedback form created by the tenant manager. */
export const feedbackForms = pgTable(
  "feedback_forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("feedback_forms_tenant_idx").on(t.tenantId),
  })
);

/** A question belonging to a form. Ordered by `position`. */
export const feedbackQuestions = pgTable(
  "feedback_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "cascade" }),
    type: feedbackQuestionTypeEnum("type").notNull(),
    label: varchar("label", { length: 500 }).notNull(),
    required: boolean("required").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    formIdx: index("feedback_questions_form_idx").on(t.formId),
  })
);

/** One invitation = one (form × student) pair. Token is used in public URL. */
export const feedbackInvitations = pgTable(
  "feedback_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formId: uuid("form_id")
      .notNull()
      .references(() => feedbackForms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    token: uuid("token").notNull().defaultRandom(),
    status: feedbackInvitationStatusEnum("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    formIdx: index("feedback_invitations_form_idx").on(t.formId),
    studentIdx: index("feedback_invitations_student_idx").on(t.studentId),
    tokenIdx: index("feedback_invitations_token_idx").on(t.token),
  })
);

/** One answer per (invitation × question). Value stored as text; parsed based on question type. */
export const feedbackAnswers = pgTable(
  "feedback_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => feedbackInvitations.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => feedbackQuestions.id, { onDelete: "cascade" }),
    /** Stored as text to handle all types: "4" for rating, "8" for nps, "yes"/"no", or free text */
    value: text("value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invitationIdx: index("feedback_answers_invitation_idx").on(t.invitationId),
    questionIdx: index("feedback_answers_question_idx").on(t.questionId),
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
