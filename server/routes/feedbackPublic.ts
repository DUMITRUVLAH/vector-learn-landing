/**
 * FB-003: PUBLIC student-facing feedback endpoints (token-based, NO auth).
 * Mounted at /api/public/feedback (a prefix that does NOT collide with the
 * auth-guarded /api/feedback mount). A student opens the form via an invitation
 * token from their link, sees the questions, and submits answers once.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  feedbackForms,
  feedbackQuestions,
  feedbackInvitations,
  feedbackAnswers,
  students,
  FEEDBACK_STAGE_META,
} from "../db/schema";

export const feedbackPublicRoutes = new Hono();

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        valueNumber: z.number().int().optional().nullable(),
        valueText: z.string().max(5000).optional().nullable(),
      })
    )
    .min(1),
});

// GET /api/feedback-public/:token — load the form a student was invited to fill
feedbackPublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");

  const invitation = await db.query.feedbackInvitations.findFirst({
    where: eq(feedbackInvitations.token, token),
  });
  if (!invitation) return c.json({ error: "not_found" }, 404);

  const form = await db.query.feedbackForms.findFirst({
    where: eq(feedbackForms.id, invitation.formId),
  });
  if (!form) return c.json({ error: "not_found" }, 404);

  const student = await db.query.students.findFirst({
    where: eq(students.id, invitation.studentId),
  });

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, form.id))
    .orderBy(asc(feedbackQuestions.position));

  return c.json({
    alreadySubmitted: invitation.status === "submitted",
    studentName: student?.fullName ?? null,
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      stage: form.stage,
      stageMeta: FEEDBACK_STAGE_META[form.stage],
    },
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label,
      options: JSON.parse(q.options ?? "[]") as string[],
      required: q.required,
    })),
  });
});

// POST /api/feedback-public/:token — submit answers (idempotent: once only)
feedbackPublicRoutes.post("/:token", zValidator("json", submitSchema), async (c) => {
  const token = c.req.param("token");
  const { answers } = c.req.valid("json");

  const invitation = await db.query.feedbackInvitations.findFirst({
    where: eq(feedbackInvitations.token, token),
  });
  if (!invitation) return c.json({ error: "not_found" }, 404);
  if (invitation.status === "submitted") return c.json({ error: "already_submitted" }, 409);

  // Validate every answered question belongs to this form, and required ones are present.
  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, invitation.formId));
  const qById = new Map(questions.map((q) => [q.id, q]));

  for (const a of answers) {
    if (!qById.has(a.questionId)) return c.json({ error: "invalid_question" }, 400);
  }
  const answeredIds = new Set(answers.map((a) => a.questionId));
  for (const q of questions) {
    if (q.required && !answeredIds.has(q.id)) {
      return c.json({ error: "missing_required", questionId: q.id }, 400);
    }
  }

  await db.insert(feedbackAnswers).values(
    answers.map((a) => ({
      tenantId: invitation.tenantId,
      invitationId: invitation.id,
      questionId: a.questionId,
      valueNumber: a.valueNumber ?? null,
      valueText: a.valueText ?? null,
    }))
  );

  await db
    .update(feedbackInvitations)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(feedbackInvitations.id, invitation.id));

  return c.json({ ok: true });
});
