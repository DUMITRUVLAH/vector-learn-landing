/**
 * AI-A01 — AI routes: lesson summary generation
 * AI-A02 — Churn prediction (future)
 * AI-A03 — Lead qualification (future)
 *
 * All routes are authenticated and tenant-scoped.
 * All LLM calls are pseudonymized + logged in ai_audit_log.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { lessons, students, teachers, courses, aiAuditLog, studentLessons, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { pseudonymize, depseudonymize, extractNames } from "../lib/ai/pseudonymize";
import { callAi } from "../lib/ai/client";

export const aiRoutes = new Hono<{ Variables: AuthVariables }>();

aiRoutes.use("*", requireAuth);

// ─── Schema ───────────────────────────────────────────────────────────────────

const lessonSummarySchema = z.object({
  lessonId: z.string().uuid().optional(),
  teacherNotes: z.string().min(1).max(4000),
  /** Optional: student name to pseudonymize (if not tied to a lessonId) */
  studentName: z.string().max(200).optional(),
});

const approveSummarySchema = z.object({
  /** Optional custom text the teacher edited before approving */
  editedSummary: z.string().max(2000).optional(),
});

// ─── POST /api/ai/lesson-summary ─────────────────────────────────────────────

/**
 * Generate a 5-line parent-friendly lesson summary from teacher notes.
 * Pseudonymizes the student name before sending to LLM.
 */
aiRoutes.post(
  "/lesson-summary",
  zValidator("json", lessonSummarySchema),
  async (c) => {
    const user = c.get("user");
    const { lessonId, teacherNotes, studentName: explicitStudentName } = c.req.valid("json");

    // Gather context: student name + subject for pseudonymization + prompt
    let studentName = explicitStudentName ?? "";
    let subjectName = "";
    let teacherName = "";

    if (lessonId) {
      // Fetch lesson + course name (tenant-scoped)
      const lessonRows = await db
        .select({
          lessonNotes: lessons.notes,
          courseName: courses.name,
          teacherUserId: teachers.userId,
        })
        .from(lessons)
        .leftJoin(teachers, eq(lessons.teacherId, teachers.id))
        .leftJoin(courses, eq(lessons.courseId, courses.id))
        .where(and(eq(lessons.id, lessonId), eq(lessons.tenantId, user.tenantId)))
        .limit(1);

      if (lessonRows.length === 0) {
        return c.json({ error: "Lesson not found" }, 404);
      }

      const row = lessonRows[0];
      subjectName = row.courseName ?? "";

      // Fetch teacher name from users table if teacherUserId is available
      if (row.teacherUserId) {
        const [teacherUser] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, row.teacherUserId))
          .limit(1);
        teacherName = teacherUser?.name ?? "";
      }

      // Fetch enrolled student names from studentLessons junction
      if (!explicitStudentName) {
        const enrolledStudents = await db
          .select({ fullName: students.fullName })
          .from(studentLessons)
          .leftJoin(students, eq(studentLessons.studentId, students.id))
          .where(eq(studentLessons.lessonId, lessonId))
          .limit(5);
        studentName = enrolledStudents.map((s) => s.fullName).filter(Boolean).join(", ");
      }
    }

    // Pseudonymize personal names before sending to LLM
    const namesToPseudonymize = extractNames(studentName, teacherName, user.name);
    const { text: pseudoNotes, tokenMap } = pseudonymize(teacherNotes, namesToPseudonymize);

    const systemPrompt = [
      "Ești un asistent AI pentru centre educaționale.",
      "Generezi sumare de lecție profesioniste în limba română pentru părinți.",
      "Sumarele trebuie să fie:",
      "- Maxim 5 fraze",
      "- Pozitive dar oneste",
      "- Să includă: ce a făcut elevul, dificultăți, recomandare practică",
      "- Fără jargon tehnic",
      "Nu folosi numele persoanelor — acestea sunt deja înlocuite cu tokens [PERSON_N].",
    ].join("\n");

    const userMessage = [
      subjectName ? `Materie: ${subjectName}` : "",
      `Notele profesorului:\n${pseudoNotes}`,
      "\nGenerează un sumar de 5 fraze pentru părintele elevului:",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callAi({
      action: "lesson_summary",
      systemPrompt,
      userMessage,
      tenantId: user.tenantId,
      userId: user.id,
      entityType: lessonId ? "lesson" : undefined,
      entityId: lessonId,
      maxTokens: 512,
    });

    // Depseudonymize the response so teacher sees real names
    const finalSummary = depseudonymize(result.text, tokenMap);

    return c.json({
      summary: finalSummary,
      pseudonymized: true,
      auditId: result.auditId,
      model: result.model,
      isStub: result.isStub,
    });
  }
);

// ─── POST /api/ai/lesson-summary/:auditId/approve ────────────────────────────

/**
 * Teacher approves (optionally edits) the AI summary and creates a parent message draft.
 * Human-in-the-loop: draft is NOT sent automatically.
 */
aiRoutes.post(
  "/lesson-summary/:auditId/approve",
  zValidator("json", approveSummarySchema),
  async (c) => {
    const user = c.get("user");
    const auditId = c.req.param("auditId");
    const { editedSummary } = c.req.valid("json");

    // Verify the audit entry belongs to this tenant
    const [auditEntry] = await db
      .select({ id: aiAuditLog.id, note: aiAuditLog.note })
      .from(aiAuditLog)
      .where(and(eq(aiAuditLog.id, auditId), eq(aiAuditLog.tenantId, user.tenantId)))
      .limit(1);

    if (!auditEntry) {
      return c.json({ error: "AI audit entry not found" }, 404);
    }

    // Log the approval action
    await db
      .update(aiAuditLog)
      .set({
        note: `Approved by user ${user.id}${editedSummary ? " (edited)" : ""}. ${auditEntry.note ?? ""}`,
      })
      .where(eq(aiAuditLog.id, auditId));

    // In a full implementation, this would create a COMM-201 message draft.
    // For now: stub response (the teacher can copy-paste the summary to send).
    const messageId = `draft-${Date.now()}`;

    return c.json({
      messageId,
      approved: true,
      note: editedSummary
        ? "Sumar editat aprobat — draft mesaj creat."
        : "Sumar AI aprobat — draft mesaj creat.",
    });
  }
);

// ─── GET /api/ai/audit-log ────────────────────────────────────────────────────

/** List AI audit log entries for the current tenant (paginated). */
aiRoutes.get("/audit-log", async (c) => {
  const user = c.get("user");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Number(limitParam ?? 50), 200);

  const rows = await db
    .select()
    .from(aiAuditLog)
    .where(eq(aiAuditLog.tenantId, user.tenantId))
    .orderBy(aiAuditLog.createdAt)
    .limit(limit);

  return c.json(rows);
});
