/**
 * FEEDBACK-601 — Public (no-auth) feedback endpoints
 *
 * GET  /api/feedback-public/:token         — fetch form for student (no auth required)
 * POST /api/feedback-public/:token/submit  — submit answers (no auth required)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  feedbackForms,
  feedbackQuestions,
  feedbackInvitations,
  feedbackAnswers,
} from "../db/schema";

export const feedbackPublicRoutes = new Hono();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/feedback-public/:token — return form questions for the invited student */
feedbackPublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!UUID_REGEX.test(token)) return c.json({ error: "not_found" }, 404);

  const invRows = await db
    .select()
    .from(feedbackInvitations)
    .where(eq(feedbackInvitations.token, token));

  const invList = Array.isArray(invRows) ? invRows : (invRows as unknown as { rows: typeof invRows }).rows ?? invRows;
  const invitation = invList[0];
  if (!invitation) return c.json({ error: "not_found" }, 404);

  const formRows = await db
    .select()
    .from(feedbackForms)
    .where(eq(feedbackForms.id, invitation.formId));

  const formList = Array.isArray(formRows) ? formRows : (formRows as unknown as { rows: typeof formRows }).rows ?? formRows;
  const form = formList[0];
  if (!form) return c.json({ error: "not_found" }, 404);

  const qRows = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, form.id))
    .orderBy(feedbackQuestions.position);

  const questions = Array.isArray(qRows) ? qRows : (qRows as unknown as { rows: typeof qRows }).rows ?? qRows;

  return c.json({
    form: {
      id: form.id,
      title: form.title,
      description: form.description,
      questions,
      alreadySubmitted: invitation.status === "submitted",
    },
  });
});

const answerInput = z.object({
  questionId: z.string().uuid(),
  value: z.string().max(2000).optional().nullable(),
});

const submitSchema = z.object({
  answers: z.array(answerInput).min(1).max(50),
});

/** POST /api/feedback-public/:token/submit — student submits answers */
feedbackPublicRoutes.post(
  "/:token/submit",
  zValidator("json", submitSchema),
  async (c) => {
    const token = c.req.param("token");
    if (!UUID_REGEX.test(token)) return c.json({ error: "not_found" }, 404);
    const { answers } = c.req.valid("json");

    const invRows = await db
      .select()
      .from(feedbackInvitations)
      .where(eq(feedbackInvitations.token, token));

    const invList = Array.isArray(invRows) ? invRows : (invRows as unknown as { rows: typeof invRows }).rows ?? invRows;
    const invitation = invList[0];
    if (!invitation) return c.json({ error: "not_found" }, 404);

    // Prevent duplicate submission
    if (invitation.status === "submitted") {
      return c.json({ error: "already_submitted" }, 409);
    }

    // Insert answers
    if (answers.length > 0) {
      await db.insert(feedbackAnswers).values(
        answers.map((a) => ({
          invitationId: invitation.id,
          questionId: a.questionId,
          value: a.value ?? null,
        }))
      );
    }

    // Mark invitation as submitted
    await db
      .update(feedbackInvitations)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(feedbackInvitations.id, invitation.id));

    return c.json({ ok: true });
  }
);
