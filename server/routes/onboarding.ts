/**
 * ONBOARD-001 — Onboarding status endpoint
 *
 * GET /api/onboarding/status
 *
 * Returns the onboarding checklist for the current tenant.
 * Steps:
 *   1. add_teacher    — at least 1 teacher exists
 *   2. add_student    — at least 1 student exists
 *   3. schedule_lesson — at least 1 lesson exists
 *   4. invite_team    — at least 2 users exist (owner + 1 more)
 *
 * When all 4 steps are done, `completed: true` is returned.
 * This endpoint is tenant-safe via requireAuth.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, students, lessons, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const onboardingRoutes = new Hono<{ Variables: AuthVariables }>();

onboardingRoutes.use("*", requireAuth);

interface OnboardingStep {
  id: string;
  label: string;
  href: string;
  done: boolean;
}

interface OnboardingStatus {
  completed: boolean;
  steps: OnboardingStep[];
}

onboardingRoutes.get("/status", async (c) => {
  const tenantId = c.get("tenantId");

  // Run all 4 counts in parallel
  const [teacherCount, studentCount, lessonCount, userCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(teachers)
      .where(sql`${teachers.tenantId} = ${tenantId}`)
      .then((r) => (r[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(students)
      .where(sql`${students.tenantId} = ${tenantId} AND ${students.status} != 'archived'`)
      .then((r) => (r[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessons)
      .where(sql`${lessons.tenantId} = ${tenantId}`)
      .then((r) => (r[0]?.count ?? 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.tenantId} = ${tenantId}`)
      .then((r) => (r[0]?.count ?? 0)),
  ]);

  const steps: OnboardingStep[] = [
    {
      id: "add_teacher",
      label: "Adaugă un profesor",
      href: "#/app/teachers",
      done: teacherCount > 0,
    },
    {
      id: "add_student",
      label: "Adaugă primul elev",
      href: "#/app/students",
      done: studentCount > 0,
    },
    {
      id: "schedule_lesson",
      label: "Programează prima lecție",
      href: "#/app/schedule",
      done: lessonCount > 0,
    },
    {
      id: "invite_team",
      label: "Invită colegii",
      href: "#/app/settings/team",
      done: userCount > 1,
    },
  ];

  const completed = steps.every((s) => s.done);

  return c.json({ completed, steps } satisfies OnboardingStatus);
});
