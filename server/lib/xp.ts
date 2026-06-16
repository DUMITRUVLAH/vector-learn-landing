/**
 * MOB-105: XP & Streak utilities
 * Called from attendance marking (SCHED-503) and homework submission (MOB-102).
 */
import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "../db/client";
import { xpEvents, studentStreaks, badges } from "../db/schema";

/** XP amounts per action type */
export const XP_AMOUNTS: Record<string, number> = {
  attendance: 10,
  homework_submit: 20,
  quiz_complete: 15,
  login: 5,
};

/**
 * Award XP to a student for a given action type.
 * Records a new xp_events row; also checks XP-based badge thresholds.
 */
export async function awardXP(
  tenantId: string,
  studentId: string,
  type: string,
  amount?: number
): Promise<void> {
  const pts = amount ?? XP_AMOUNTS[type] ?? 10;

  await db.insert(xpEvents).values({
    tenantId,
    studentId,
    type,
    amount: pts,
    description: `${type} — +${pts} XP`,
  });

  // Check XP milestones for badges
  const totalResult = await db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(and(eq(xpEvents.tenantId, tenantId), eq(xpEvents.studentId, studentId)))
    .limit(1);

  const totalXP = Number(totalResult[0]?.total ?? 0);

  const xpBadgeThresholds: Array<{ min: number; type: string }> = [
    { min: 100, type: "xp_100" },
    { min: 500, type: "xp_500" },
  ];

  for (const threshold of xpBadgeThresholds) {
    if (totalXP >= threshold.min) {
      await maybeAwardBadge(tenantId, studentId, threshold.type);
    }
  }

  // first_homework badge
  if (type === "homework_submit") {
    await maybeAwardBadge(tenantId, studentId, "first_homework");
  }
}

/**
 * Update a student's consecutive-day streak.
 * Call this whenever the student completes an activity (attendance, homework, login).
 * Awards streak_7 and streak_30 badges at milestone days.
 */
export async function updateStreak(
  tenantId: string,
  studentId: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [existing] = await db
    .select()
    .from(studentStreaks)
    .where(
      and(
        eq(studentStreaks.tenantId, tenantId),
        eq(studentStreaks.studentId, studentId)
      )
    )
    .limit(1);

  if (!existing) {
    // First ever activity
    const [created] = await db
      .insert(studentStreaks)
      .values({
        tenantId,
        studentId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
      })
      .returning();

    return { currentStreak: created.currentStreak, longestStreak: created.longestStreak };
  }

  const lastDate = existing.lastActivityDate;

  if (lastDate === today) {
    // Already updated today — no change
    return { currentStreak: existing.currentStreak, longestStreak: existing.longestStreak };
  }

  // Check if consecutive day
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let newStreak: number;
  if (lastDate === yesterdayStr) {
    // Consecutive!
    newStreak = existing.currentStreak + 1;
  } else {
    // Streak broken — reset
    newStreak = 1;
  }

  const newLongest = Math.max(newStreak, existing.longestStreak);

  await db
    .update(studentStreaks)
    .set({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityDate: today,
      updatedAt: sql`now()`,
    })
    .where(eq(studentStreaks.id, existing.id));

  // Milestone badges
  if (newStreak === 7) {
    await maybeAwardBadge(tenantId, studentId, "streak_7");
  }
  if (newStreak === 30) {
    await maybeAwardBadge(tenantId, studentId, "streak_30");
  }

  return { currentStreak: newStreak, longestStreak: newLongest };
}

/**
 * Award a badge only if it hasn't been earned yet (idempotent).
 */
async function maybeAwardBadge(
  tenantId: string,
  studentId: string,
  badgeType: string
): Promise<void> {
  const existing = await db
    .select({ id: badges.id })
    .from(badges)
    .where(
      and(
        eq(badges.tenantId, tenantId),
        eq(badges.studentId, studentId),
        eq(badges.badgeType, badgeType)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(badges).values({ tenantId, studentId, badgeType });
  }
}

/**
 * Get total XP and level for a student.
 * Level = floor(totalXP / 100) + 1
 */
export async function getStudentXP(
  tenantId: string,
  studentId: string
): Promise<{ totalXP: number; level: number }> {
  const result = await db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(and(eq(xpEvents.tenantId, tenantId), eq(xpEvents.studentId, studentId)))
    .limit(1);

  const totalXP = Number(result[0]?.total ?? 0);
  const level = Math.floor(totalXP / 100) + 1;
  return { totalXP, level };
}
