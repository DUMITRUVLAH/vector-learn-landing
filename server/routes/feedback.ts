/**
 * FB-002/003/004: Feedback forms — manager-facing CRUD, send-to-students, analytics.
 *
 * Mounted at /api/feedback (auth required). The PUBLIC student-facing submit
 * endpoints live in routes/feedbackPublic.ts (token-based, no auth).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  feedbackForms,
  feedbackQuestions,
  feedbackInvitations,
  feedbackAnswers,
  students,
  generateInvitationToken,
  FEEDBACK_STAGE_META,
  type FeedbackQuestion,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const feedbackRoutes = new Hono<{ Variables: AuthVariables }>();

feedbackRoutes.use("/*", requireAuth);

const stageEnum = z.enum(["initial", "mid", "final"]);
const questionTypeEnum = z.enum(["rating", "scale", "single", "multi", "text", "yesno"]);

const questionInput = z.object({
  type: questionTypeEnum,
  label: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).max(20).default([]),
  required: z.boolean().default(true),
});

const createFormSchema = z.object({
  stage: stageEnum,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  questions: z.array(questionInput).min(1).max(50),
});

const updateFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  questions: z.array(questionInput).min(1).max(50).optional(),
});

const sendSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
});

/** Shape a question row for the API (parse options JSON). */
function shapeQuestion(q: FeedbackQuestion) {
  return {
    id: q.id,
    type: q.type,
    label: q.label,
    options: JSON.parse(q.options ?? "[]") as string[],
    required: q.required,
    position: q.position,
  };
}

// GET /api/feedback/stages — the 3 built-in stage templates (labels + descriptions)
feedbackRoutes.get("/stages", (c) => {
  return c.json({
    stages: (["initial", "mid", "final"] as const).map((stage) => ({
      stage,
      ...FEEDBACK_STAGE_META[stage],
    })),
  });
});

// GET /api/feedback — list forms for tenant, with question + invitation counts
feedbackRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const forms = await db
    .select()
    .from(feedbackForms)
    .where(eq(feedbackForms.tenantId, tenantId))
    .orderBy(asc(feedbackForms.stage), desc(feedbackForms.createdAt));

  if (forms.length === 0) return c.json({ items: [] });

  const formIds = forms.map((f) => f.id);
  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(inArray(feedbackQuestions.formId, formIds));
  const invitations = await db
    .select()
    .from(feedbackInvitations)
    .where(inArray(feedbackInvitations.formId, formIds));

  const items = forms.map((f) => {
    const inv = invitations.filter((i) => i.formId === f.id);
    return {
      ...f,
      stageMeta: FEEDBACK_STAGE_META[f.stage],
      questionCount: questions.filter((q) => q.formId === f.id).length,
      sentCount: inv.length,
      submittedCount: inv.filter((i) => i.status === "submitted").length,
    };
  });

  return c.json({ items });
});

// GET /api/feedback/:id — single form with its ordered questions
feedbackRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const form = await db.query.feedbackForms.findFirst({
    where: and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)),
  });
  if (!form) return c.json({ error: "not_found" }, 404);

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, id))
    .orderBy(asc(feedbackQuestions.position));

  return c.json({
    ...form,
    stageMeta: FEEDBACK_STAGE_META[form.stage],
    questions: questions.map(shapeQuestion),
  });
});

// POST /api/feedback — create a form + its questions
feedbackRoutes.post("/", zValidator("json", createFormSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [form] = await db
    .insert(feedbackForms)
    .values({
      tenantId,
      stage: body.stage,
      title: body.title,
      description: body.description ?? null,
      courseId: body.courseId ?? null,
    })
    .returning();

  await db.insert(feedbackQuestions).values(
    body.questions.map((q, idx) => ({
      tenantId,
      formId: form.id,
      type: q.type,
      label: q.label,
      options: JSON.stringify(q.options ?? []),
      required: q.required,
      position: idx,
    }))
  );

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, form.id))
    .orderBy(asc(feedbackQuestions.position));

  return c.json(
    { ...form, stageMeta: FEEDBACK_STAGE_META[form.stage], questions: questions.map(shapeQuestion) },
    201
  );
});

// PATCH /api/feedback/:id — update form metadata and/or replace questions
feedbackRoutes.patch("/:id", zValidator("json", updateFormSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.feedbackForms.findFirst({
    where: and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.courseId !== undefined) patch.courseId = body.courseId;
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  const [updated] = await db
    .update(feedbackForms)
    .set(patch)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)))
    .returning();

  // Replace questions wholesale if provided (simplest correct edit semantics).
  if (body.questions) {
    await db.delete(feedbackQuestions).where(eq(feedbackQuestions.formId, id));
    await db.insert(feedbackQuestions).values(
      body.questions.map((q, idx) => ({
        tenantId,
        formId: id,
        type: q.type,
        label: q.label,
        options: JSON.stringify(q.options ?? []),
        required: q.required,
        position: idx,
      }))
    );
  }

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, id))
    .orderBy(asc(feedbackQuestions.position));

  return c.json({
    ...updated,
    stageMeta: FEEDBACK_STAGE_META[updated.stage],
    questions: questions.map(shapeQuestion),
  });
});

// DELETE /api/feedback/:id
feedbackRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  await db
    .delete(feedbackForms)
    .where(and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)));
  return c.json({ deleted: true });
});

// POST /api/feedback/:id/send — send the form to a set of students (creates invitations)
feedbackRoutes.post("/:id/send", zValidator("json", sendSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const { studentIds } = c.req.valid("json");

  const form = await db.query.feedbackForms.findFirst({
    where: and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)),
  });
  if (!form) return c.json({ error: "not_found" }, 404);
  if (!form.isActive) return c.json({ error: "form_inactive" }, 400);

  // Only students that belong to this tenant — never trust the client's id list.
  const validStudents = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), inArray(students.id, studentIds)));
  const validIds = new Set(validStudents.map((s) => s.id));

  // Skip students already invited to this form (unique index also guards this).
  const already = await db
    .select({ studentId: feedbackInvitations.studentId })
    .from(feedbackInvitations)
    .where(eq(feedbackInvitations.formId, id));
  const alreadySet = new Set(already.map((a) => a.studentId));

  const toCreate = [...validIds].filter((sid) => !alreadySet.has(sid));
  let created = 0;
  if (toCreate.length > 0) {
    await db.insert(feedbackInvitations).values(
      toCreate.map((studentId) => ({
        tenantId,
        formId: id,
        studentId,
        token: generateInvitationToken(),
      }))
    );
    created = toCreate.length;
  }

  return c.json({
    sent: created,
    skipped: studentIds.length - created,
    alreadyInvited: studentIds.filter((s) => alreadySet.has(s)).length,
  });
});

// GET /api/feedback/:id/invitations — recipients + their status (for the "sent" tab)
feedbackRoutes.get("/:id/invitations", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      id: feedbackInvitations.id,
      studentId: feedbackInvitations.studentId,
      studentName: students.fullName,
      status: feedbackInvitations.status,
      token: feedbackInvitations.token,
      sentAt: feedbackInvitations.sentAt,
      submittedAt: feedbackInvitations.submittedAt,
    })
    .from(feedbackInvitations)
    .innerJoin(students, eq(students.id, feedbackInvitations.studentId))
    .where(and(eq(feedbackInvitations.formId, id), eq(feedbackInvitations.tenantId, tenantId)))
    .orderBy(asc(students.fullName));

  return c.json({ items: rows });
});

// GET /api/feedback/:id/results — aggregated analysis of submitted answers
feedbackRoutes.get("/:id/results", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const form = await db.query.feedbackForms.findFirst({
    where: and(eq(feedbackForms.id, id), eq(feedbackForms.tenantId, tenantId)),
  });
  if (!form) return c.json({ error: "not_found" }, 404);

  const questions = await db
    .select()
    .from(feedbackQuestions)
    .where(eq(feedbackQuestions.formId, id))
    .orderBy(asc(feedbackQuestions.position));

  const invitations = await db
    .select()
    .from(feedbackInvitations)
    .where(and(eq(feedbackInvitations.formId, id), eq(feedbackInvitations.tenantId, tenantId)));
  const submittedInvIds = invitations.filter((i) => i.status === "submitted").map((i) => i.id);

  const answers =
    submittedInvIds.length > 0
      ? await db
          .select()
          .from(feedbackAnswers)
          .where(inArray(feedbackAnswers.invitationId, submittedInvIds))
      : [];

  const responseRate = invitations.length
    ? Math.round((submittedInvIds.length / invitations.length) * 100)
    : 0;

  const perQuestion = questions.map((q) => {
    const qAnswers = answers.filter((a) => a.questionId === q.id);
    const opts = JSON.parse(q.options ?? "[]") as string[];

    if (q.type === "rating" || q.type === "scale") {
      const nums = qAnswers.map((a) => a.valueNumber).filter((n): n is number => n != null);
      const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
      // Distribution histogram keyed by value.
      const distribution: Record<number, number> = {};
      for (const n of nums) distribution[n] = (distribution[n] ?? 0) + 1;
      return {
        questionId: q.id,
        label: q.label,
        type: q.type,
        count: nums.length,
        average: avg != null ? Math.round(avg * 100) / 100 : null,
        distribution,
      };
    }

    if (q.type === "yesno") {
      const yes = qAnswers.filter((a) => a.valueNumber === 1).length;
      const no = qAnswers.filter((a) => a.valueNumber === 0).length;
      return { questionId: q.id, label: q.label, type: q.type, count: yes + no, yes, no };
    }

    if (q.type === "single" || q.type === "multi") {
      const tally: Record<string, number> = {};
      for (const opt of opts) tally[opt] = 0;
      for (const a of qAnswers) {
        // multi answers store comma-joined labels.
        const picked = (a.valueText ?? "").split("|").map((s) => s.trim()).filter(Boolean);
        for (const p of picked) tally[p] = (tally[p] ?? 0) + 1;
      }
      return { questionId: q.id, label: q.label, type: q.type, count: qAnswers.length, tally };
    }

    // text
    return {
      questionId: q.id,
      label: q.label,
      type: q.type,
      count: qAnswers.length,
      responses: qAnswers.map((a) => a.valueText ?? "").filter(Boolean),
    };
  });

  return c.json({
    form: { id: form.id, title: form.title, stage: form.stage, stageMeta: FEEDBACK_STAGE_META[form.stage] },
    sentCount: invitations.length,
    submittedCount: submittedInvIds.length,
    responseRate,
    questions: perQuestion,
  });
});
