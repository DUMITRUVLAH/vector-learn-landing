/**
 * GAP-019 — Badges (gamification insigne)
 * GAP-020 — Leaderboard
 *
 * Routes:
 *   GET  /api/badges/students/:studentId   — lista insigne ale elevului
 *   POST /api/badges/check/:studentId      — rulează awarding logic; returnează nou-acordate
 *   GET  /api/badges/leaderboard?limit=10  — top elevi după badge count (GAP-020)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { studentBadges, students, studentLessons } from "../db/schema";
import type { BadgeType } from "../db/schema/badges";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BADGE_REASONS: Record<BadgeType, (n: number) => string> = {
  first_lesson: () => "Attended first lesson",
  ten_lessons: () => "Attended 10 lessons",
  hundred_lessons: () => "Attended 100 lessons",
  first_homework: () => "Submitted first homework",
  five_homework: () => "Submitted 5 homework assignments",
  thirty_day_streak: () => "30-day attendance streak",
  perfect_week: () => "Perfect attendance week (5 days)",
};

/**
 * Award badges for a student.  Returns array of newly-awarded badge types.
 * Idempotent: existing badges are silently skipped (unique constraint).
 */
export async function awardBadgesForStudent(
  tenantId: string,
  studentId: string
): Promise<BadgeType[]> {
  // Count completed lessons (attendance_status = 'present')
  const attendedRows = await db
    .select({ cnt: count() })
    .from(studentLessons)
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, studentId),
        eq(studentLessons.attendanceStatus, "present")
      )
    );
  const attendedCount = Number(attendedRows[0]?.cnt ?? 0);

  // Count unique days attended in the last 30 days (for streak)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentDaysRows = await db
    .selectDistinct({ day: sql<string>`DATE(${studentLessons.markedAt})` })
    .from(studentLessons)
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, studentId),
        eq(studentLessons.attendanceStatus, "present"),
        gte(studentLessons.markedAt, thirtyDaysAgo)
      )
    );
  const recentDays = recentDaysRows.length;

  // Perfect week: 5 distinct days in last 7 calendar days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekDaysRows = await db
    .selectDistinct({ day: sql<string>`DATE(${studentLessons.markedAt})` })
    .from(studentLessons)
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, studentId),
        eq(studentLessons.attendanceStatus, "present"),
        gte(studentLessons.markedAt, sevenDaysAgo)
      )
    );
  const weekDays = weekDaysRows.length;

  // Homework counts — graceful fallback if table doesn't exist yet
  let homeworkCount = 0;
  try {
    const { homeworkSubmissions } = await import("../db/schema/homework");
    const hwRows = await db
      .select({ cnt: count() })
      .from(homeworkSubmissions)
      .where(
        and(
          eq(homeworkSubmissions.tenantId, tenantId),
          eq(homeworkSubmissions.studentId, studentId)
        )
      );
    homeworkCount = Number(hwRows[0]?.cnt ?? 0);
  } catch {
    // homework table not yet migrated — skip homework badges
    homeworkCount = -1;
  }

  // Determine which badges to award
  const toAward: BadgeType[] = [];
  if (attendedCount >= 1) toAward.push("first_lesson");
  if (attendedCount >= 10) toAward.push("ten_lessons");
  if (attendedCount >= 100) toAward.push("hundred_lessons");
  if (recentDays >= 30) toAward.push("thirty_day_streak");
  if (weekDays >= 5) toAward.push("perfect_week");
  if (homeworkCount >= 1) toAward.push("first_homework");
  if (homeworkCount >= 5) toAward.push("five_homework");

  const newlyAwarded: BadgeType[] = [];
  for (const badgeType of toAward) {
    try {
      await db.insert(studentBadges).values({
        tenantId,
        studentId,
        badgeType,
        awardedReason: BADGE_REASONS[badgeType](0),
      });
      newlyAwarded.push(badgeType);
    } catch {
      // unique constraint violation → already awarded, skip
    }
  }

  return newlyAwarded;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const badgesRoutes = new Hono<{ Variables: AuthVariables }>();
badgesRoutes.use("*", requireAuth);

/** GET /api/badges/students/:studentId — lista insigne ale elevului */
badgesRoutes.get("/students/:studentId", async (c) => {
  const { tenantId } = c.get("session");
  const { studentId } = c.req.param();

  const rows = await db
    .select({
      id: studentBadges.id,
      badgeType: studentBadges.badgeType,
      awardedAt: studentBadges.awardedAt,
      awardedReason: studentBadges.awardedReason,
    })
    .from(studentBadges)
    .where(
      and(
        eq(studentBadges.tenantId, tenantId),
        eq(studentBadges.studentId, studentId)
      )
    )
    .orderBy(studentBadges.awardedAt);

  return c.json(rows);
});

/** POST /api/badges/check/:studentId — rulează awarding logic */
badgesRoutes.post("/check/:studentId", async (c) => {
  const { tenantId } = c.get("session");
  const { studentId } = c.req.param();

  // Verify student belongs to this tenant
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));

  if (!student) return c.json({ error: "not_found" }, 404);

  const awarded = await awardBadgesForStudent(tenantId, studentId);
  return c.json({ awarded });
});

/** GET /api/badges/leaderboard?limit=10 — GAP-020: top elevi după badge count */
badgesRoutes.get("/leaderboard", zValidator("query", z.object({ limit: z.coerce.number().int().min(1).max(50).optional().default(10) })), async (c) => {
  const { tenantId } = c.get("session");
  const { limit } = c.req.valid("query");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Total badge count per student (all time)
  const rows = await db
    .select({
      studentId: studentBadges.studentId,
      badgeCount: count(studentBadges.id),
    })
    .from(studentBadges)
    .where(eq(studentBadges.tenantId, tenantId))
    .groupBy(studentBadges.studentId)
    .orderBy(desc(count(studentBadges.id)))
    .limit(limit);

  // Badges awarded in last 30 days per student (for changeFromLastMonth)
  const recentRows = await db
    .select({
      studentId: studentBadges.studentId,
      recentCount: count(studentBadges.id),
    })
    .from(studentBadges)
    .where(
      and(
        eq(studentBadges.tenantId, tenantId),
        gte(studentBadges.awardedAt, thirtyDaysAgo)
      )
    )
    .groupBy(studentBadges.studentId);

  const recentMap = new Map(recentRows.map((r) => [r.studentId, Number(r.recentCount)]));

  // Fetch student names
  const studentIds = rows.map((r) => r.studentId);
  const studentNameMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const studentRows = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(eq(students.tenantId, tenantId));
    for (const s of studentRows) {
      studentNameMap.set(s.id, s.fullName);
    }
  }

  const leaderboard = rows.map((r, idx) => ({
    rank: idx + 1,
    studentId: r.studentId,
    studentName: studentNameMap.get(r.studentId) ?? "Unknown",
    badgeCount: Number(r.badgeCount),
    changeFromLastMonth: recentMap.get(r.studentId) ?? 0,
  }));

  return c.json(leaderboard);
});

/** GET /api/badges/stats — statistici globale (pentru GAP-020 card) */
badgesRoutes.get("/stats", async (c) => {
  const { tenantId } = c.get("session");

  // Total badges awarded
  const [totalRow] = await db
    .select({ total: count() })
    .from(studentBadges)
    .where(eq(studentBadges.tenantId, tenantId));

  // Students with at least 1 badge
  const studentsWithBadgesRows = await db
    .selectDistinct({ studentId: studentBadges.studentId })
    .from(studentBadges)
    .where(eq(studentBadges.tenantId, tenantId));

  // Most common badge type
  const badgeFreqRows = await db
    .select({
      badgeType: studentBadges.badgeType,
      freq: count(),
    })
    .from(studentBadges)
    .where(eq(studentBadges.tenantId, tenantId))
    .groupBy(studentBadges.badgeType)
    .orderBy(desc(count()))
    .limit(1);

  return c.json({
    totalBadges: Number(totalRow?.total ?? 0),
    studentsWithBadges: studentsWithBadgesRows.length,
    topBadgeType: badgeFreqRows[0]?.badgeType ?? null,
  });
});
