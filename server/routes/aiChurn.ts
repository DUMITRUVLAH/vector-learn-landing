/**
 * AI-A02 — Churn prediction routes
 * POST /api/ai/churn-score  — compute + save scores for all students (or one)
 * GET  /api/ai/churn-scores — list cached scores for this tenant
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, desc } from "drizzle-orm";
import { db } from "../db/client";
import { studentChurnScores } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { scoreChurnRisk, scoreAllStudents } from "../lib/ai/churnScorer";
import { callAi } from "../lib/ai/client";
import { pseudonymize } from "../lib/ai/pseudonymize";

export const aiChurnRoutes = new Hono<{ Variables: AuthVariables }>();

aiChurnRoutes.use("*", requireAuth);

const scoreBodySchema = z.object({
  /** If provided, score only this student. Otherwise scores all active students. */
  studentId: z.string().uuid().optional(),
});

// ─── POST /api/ai/churn-score ─────────────────────────────────────────────────

aiChurnRoutes.post("/", zValidator("json", scoreBodySchema), async (c) => {
  const user = c.get("user");
  const { studentId } = c.req.valid("json");

  // Score one student or all
  const toScore = studentId
    ? await (async () => {
        const r = await scoreChurnRisk(studentId, user.tenantId);
        return r ? [r] : [];
      })()
    : await scoreAllStudents(user.tenantId);

  let updated = 0;

  for (const result of toScore) {
    // Generate suggested action via AI client (pseudonymized, stub-safe)
    const factors = result.factors.join("; ");
    const pseudoFactors = pseudonymize(factors, [result.studentName]).text;

    let suggestedAction: string | undefined;
    let auditId: string | undefined;

    try {
      const aiResult = await callAi({
        action: "churn_prediction",
        userMessage: `Elev cu risc ${result.score}%. Factori: ${pseudoFactors}. Trend: ${result.trend}. Propune o acțiune concisă (1-2 fraze) în română pentru a preveni abandonul.`,
        tenantId: user.tenantId,
        userId: user.id,
        entityType: "student",
        entityId: result.studentId,
        maxTokens: 200,
      });
      suggestedAction = aiResult.text;
      auditId = aiResult.auditId;
    } catch {
      // Non-blocking: proceed without suggested action if AI fails
    }

    // Upsert the churn score (delete old entry + insert new)
    await db
      .delete(studentChurnScores)
      .where(
        and(
          eq(studentChurnScores.studentId, result.studentId),
          eq(studentChurnScores.tenantId, user.tenantId)
        )
      );

    await db.insert(studentChurnScores).values({
      tenantId: user.tenantId,
      studentId: result.studentId,
      score: result.score,
      factors: result.factors,
      trend: result.trend,
      suggestedAction,
      auditId,
    });

    updated++;
  }

  return c.json({
    updated,
    scores: toScore.map((r) => ({
      studentId: r.studentId,
      studentName: r.studentName,
      score: r.score,
      factors: r.factors,
      trend: r.trend,
    })),
  });
});

// ─── GET /api/ai/churn-scores ─────────────────────────────────────────────────

aiChurnRoutes.get("/scores", async (c) => {
  const user = c.get("user");
  const minScoreParam = c.req.query("minScore");
  const limitParam = c.req.query("limit");
  const minScore = Number(minScoreParam ?? 0);
  const limit = Math.min(Number(limitParam ?? 50), 200);

  const rows = await db
    .select({
      id: studentChurnScores.id,
      studentId: studentChurnScores.studentId,
      score: studentChurnScores.score,
      factors: studentChurnScores.factors,
      trend: studentChurnScores.trend,
      suggestedAction: studentChurnScores.suggestedAction,
      scoredAt: studentChurnScores.scoredAt,
    })
    .from(studentChurnScores)
    .where(
      and(
        eq(studentChurnScores.tenantId, user.tenantId),
        gte(studentChurnScores.score, minScore)
      )
    )
    .orderBy(desc(studentChurnScores.score))
    .limit(limit);

  return c.json(rows);
});

// ─── DELETE /api/ai/churn-scores/:studentId ───────────────────────────────────

/** Mark a student's churn risk as resolved (delete the cached score). */
aiChurnRoutes.delete("/scores/:studentId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");

  await db
    .delete(studentChurnScores)
    .where(
      and(
        eq(studentChurnScores.studentId, studentId),
        eq(studentChurnScores.tenantId, user.tenantId)
      )
    );

  return c.json({ ok: true });
});
