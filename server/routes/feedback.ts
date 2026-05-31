/**
 * FEEDBACK-601 — Feedback forms API (tenant-authenticated endpoints)
 *
 * GET  /api/feedback              — list forms for current tenant
 * POST /api/feedback              — create form with questions
 * GET  /api/feedback/:id          — form details + aggregate scores
 * POST /api/feedback/:id/send     — send to a student (creates invitation + token)
 * GET  /api/feedback/:id/responses — list all responses for a form
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  feedbackForms,
  feedbackQuestions,
  feedbackInvitations,
  feedbackAnswers,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const feedbackRoutes = new Hono<{ Variables: AuthVariables }>();

feedbackRoutes.use("*", requireAuth);

const questionInput = z.object({
  type: z.enum(["rating", "nps", "text", "yesno"]),
  label: z.string().min(1).max(500),
  required: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

const createFormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  questions: z.array(questionInput).min(1).max(20),
});

const sendSchema = z.object({
  studentId: z.string().uuid(),
});

/** GET /api/feedback — list forms with response count + average score */
feedbackRoutes.get("/", async (c) => {
  const user = c.get("user");

  const forms = await db
    .select()
    .from(feedbackForms)
    .where(eq(feedbackForms.tenantId, user.tenantId))
    .orderBy(desc(feedbackForms.createdAt));

  const formList = Array.isArray(forms) ? forms : (forms as unknown as { rows: typeof forms }).rows ?? forms;

  // For each form, count invitations + submitted
  const enriched = await Promise.all(
    formList.map(async (form) => {
      const invRows = await db
        .select({ status: feedbackInvitations.status })
        .from(feedbackInvitations)
        .where(eq(feedbackInvitations.formId, form.id));

      const invList = Array.isArray(invRows) ? invRows : (invRows as unknown as { rows: typeof invRows }).rows ?? invRows;
      const total = invList.length;
      const submitted = invList.filter((i) => i.status === "submitted").length;

      // Average numeric score from rating + nps answers for this form
      const scoreRows = await db
        .select({ val: feedbackAnswers.value })
        .from(feedbackAnswers)
        .innerJoin(feedbackInvitations, eq(feedbackAnswers.invitationId, feedbackInvitations.id))
        .innerJoin(feedbackQuestions, eq(feedbackAnswers.questionId, feedbackQuestions.id))
        .where(
          and(
            eq(feedbackInvitations.formId, form.id),
            sql`${feedbackQuestions.type} IN ('rating', 'nps')`
          )
        );

      const scoreList = Array.isArray(scoreRows) ? scoreRows : (scoreRows as unknown as { rows: typeof scoreRows }).rows ?? scoreRows;
      const nums = scoreList
        .map((r) => (r.val ? parseFloat(r.val) : NaN))
        .filter((n) => !isNaN(n));
      const averageScore = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

      return { ...form, totalInvitations: total, submittedCount: submitted, averageScore };
    })
  );

  return c.json({ forms: enriched });
});

/** POST /api/feedback — create form + questions */
feedbackRoutes.post("/", zValidator("json", createFormSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const inserted = await db
    .insert(feedbackForms)
    .values({
      tenantId: user.tenantId,
      title: body.title,
      description: body.description ?? null,
    })
    .returning();

  const form = Array.isArray(inserted) ? inserted[0] : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;

  // Insert questions
  if (body.questions.length > 0) {
    await db.insert(feedbackQuestions).values(
      body.questions.map((q, i) => ({
        formId: form.id,
        type: q.type,
        label: q.label,
        required: q.required,
        position: q.position ?? i,
      }))
    );
  }

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, form.id))
    .orderBy(feedbackQuestions.position);

  const qList = Array.isArray(questions) ? questions : (questions as unknown as { rows: typeof questions }).rows ?? questions;

  return c.json({ form: { ...form, questions: qList } }, 201);
});

/** GET /api/feedback/:id — form details + questions + aggregate scores */
feedbackRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const formRows = await db
    .select()
    .from(feedbackForms)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, user.tenantId)));

  const formList = Array.isArray(formRows) ? formRows : (formRows as unknown as { rows: typeof formRows }).rows ?? formRows;
  const form = formList[0];
  if (!form) return c.json({ error: "not_found" }, 404);

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, form.id))
    .orderBy(feedbackQuestions.position);

  const qList = Array.isArray(questions) ? questions : (questions as unknown as { rows: typeof questions }).rows ?? questions;

  // Calculate average per numeric question
  const qStats = await Promise.all(
    qList
      .filter((q) => q.type === "rating" || q.type === "nps")
      .map(async (q) => {
        const ansRows = await db
          .select({ val: feedbackAnswers.value })
          .from(feedbackAnswers)
          .innerJoin(feedbackInvitations, eq(feedbackAnswers.invitationId, feedbackInvitations.id))
          .where(
            and(
              eq(feedbackAnswers.questionId, q.id),
              eq(feedbackInvitations.formId, form.id)
            )
          );

        const ansList = Array.isArray(ansRows) ? ansRows : (ansRows as unknown as { rows: typeof ansRows }).rows ?? ansRows;
        const nums = ansList.map((r) => (r.val ? parseFloat(r.val) : NaN)).filter((n) => !isNaN(n));
        const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        return { questionId: q.id, average: avg, responseCount: nums.length };
      })
  );

  const invRows = await db
    .select({ status: feedbackInvitations.status })
    .from(feedbackInvitations)
    .where(eq(feedbackInvitations.formId, form.id));

  const invList = Array.isArray(invRows) ? invRows : (invRows as unknown as { rows: typeof invRows }).rows ?? invRows;

  return c.json({
    form: {
      ...form,
      questions: qList,
      totalInvitations: invList.length,
      submittedCount: invList.filter((i) => i.status === "submitted").length,
      questionStats: qStats,
    },
  });
});

/** POST /api/feedback/:id/send — create invitation for a student */
feedbackRoutes.post("/:id/send", zValidator("json", sendSchema), async (c) => {
  const user = c.get("user");
  const formId = c.req.param("id");
  const { studentId } = c.req.valid("json");

  // Verify form belongs to tenant
  const formRows = await db
    .select()
    .from(feedbackForms)
    .where(and(eq(feedbackForms.id, formId), eq(feedbackForms.tenantId, user.tenantId)));

  const formList = Array.isArray(formRows) ? formRows : (formRows as unknown as { rows: typeof formRows }).rows ?? formRows;
  if (!formList[0]) return c.json({ error: "not_found" }, 404);

  // Verify student belongs to tenant
  const studentRows = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  const studentList = Array.isArray(studentRows) ? studentRows : (studentRows as unknown as { rows: typeof studentRows }).rows ?? studentRows;
  if (!studentList[0]) return c.json({ error: "student_not_found" }, 404);

  const inserted = await db
    .insert(feedbackInvitations)
    .values({ formId, studentId })
    .returning();

  const invitation = Array.isArray(inserted) ? inserted[0] : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;

  const publicUrl = `/feedback/${invitation.token}`;
  return c.json({ invitation, publicUrl }, 201);
});

/** GET /api/feedback/:id/responses — all responses for a form */
feedbackRoutes.get("/:id/responses", async (c) => {
  const user = c.get("user");
  const formId = c.req.param("id");

  // Verify form belongs to tenant
  const formRows = await db
    .select()
    .from(feedbackForms)
    .where(and(eq(feedbackForms.id, formId), eq(feedbackForms.tenantId, user.tenantId)));

  const formList = Array.isArray(formRows) ? formRows : (formRows as unknown as { rows: typeof formRows }).rows ?? formRows;
  if (!formList[0]) return c.json({ error: "not_found" }, 404);

  const invRows = await db
    .select({
      id: feedbackInvitations.id,
      studentId: feedbackInvitations.studentId,
      status: feedbackInvitations.status,
      submittedAt: feedbackInvitations.submittedAt,
      createdAt: feedbackInvitations.createdAt,
    })
    .from(feedbackInvitations)
    .where(eq(feedbackInvitations.formId, formId))
    .orderBy(desc(feedbackInvitations.createdAt));

  const invList = Array.isArray(invRows) ? invRows : (invRows as unknown as { rows: typeof invRows }).rows ?? invRows;

  // For each submitted invitation, include answers
  const withAnswers = await Promise.all(
    invList.map(async (inv) => {
      if (inv.status !== "submitted") return { ...inv, answers: [] };
      const ansRows = await db
        .select({
          questionId: feedbackAnswers.questionId,
          value: feedbackAnswers.value,
        })
        .from(feedbackAnswers)
        .where(eq(feedbackAnswers.invitationId, inv.id));

      const ansList = Array.isArray(ansRows) ? ansRows : (ansRows as unknown as { rows: typeof ansRows }).rows ?? ansRows;
      return { ...inv, answers: ansList };
    })
  );

  return c.json({ responses: withAnswers });
});
