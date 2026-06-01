/**
 * GAP-012 — Gradebook / student progress routes
 *
 * Routes:
 *   GET  /api/progress/skills?courseId=       — list skills for a course
 *   POST /api/progress/skills                 — create skill
 *   DELETE /api/progress/skills/:id           — delete skill (if no entries)
 *   GET  /api/progress/students/:studentId    — full progress for a student
 *   POST /api/progress/entries                — add evaluation entry
 *   GET  /api/progress/public/:token          — no-auth public view (token = base64url(studentId))
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { progressSkills, progressEntries } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ─── Public routes (no auth) ─────────────────────────────────────────────────
const publicRoutes = new Hono();

/**
 * GET /api/progress/public/:token
 * Token is base64url-encoded studentId.  We intentionally do NOT expose the real
 * studentId in the URL so that guessing is harder.
 */
publicRoutes.get("/public/:token", async (c) => {
  const { token } = c.req.param();
  let studentId: string;
  try {
    studentId = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    // Validate UUID format
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new Error("bad format");
  } catch {
    return c.json({ error: "invalid_token" }, 401);
  }

  // Fetch all skills via entries (we get tenantId from entries)
  const entries = await db
    .select({
      entryId: progressEntries.id,
      score: progressEntries.score,
      comment: progressEntries.comment,
      evaluatedAt: progressEntries.evaluatedAt,
      skillId: progressEntries.skillId,
      skillName: progressSkills.name,
      skillDescription: progressSkills.description,
      courseId: progressSkills.courseId,
    })
    .from(progressEntries)
    .innerJoin(progressSkills, eq(progressEntries.skillId, progressSkills.id))
    .where(eq(progressEntries.studentId, studentId))
    .orderBy(desc(progressEntries.evaluatedAt));

  // Group by skill
  const skillsMap = new Map<
    string,
    {
      skillId: string;
      skillName: string;
      skillDescription: string | null;
      courseId: string;
      latestScore: number;
      latestAt: string;
      trend: "up" | "down" | "same" | "new";
      history: Array<{ score: number; evaluatedAt: string; comment: string | null }>;
    }
  >();

  for (const e of entries) {
    if (!skillsMap.has(e.skillId)) {
      skillsMap.set(e.skillId, {
        skillId: e.skillId,
        skillName: e.skillName,
        skillDescription: e.skillDescription,
        courseId: e.courseId,
        latestScore: e.score,
        latestAt: e.evaluatedAt.toISOString(),
        trend: "new",
        history: [],
      });
    }
    skillsMap.get(e.skillId)!.history.push({
      score: e.score,
      evaluatedAt: e.evaluatedAt.toISOString(),
      comment: e.comment ?? null,
    });
  }

  // Calculate trends
  for (const skill of skillsMap.values()) {
    if (skill.history.length >= 2) {
      const latest = skill.history[0].score;
      const prev = skill.history[1].score;
      skill.trend = latest > prev ? "up" : latest < prev ? "down" : "same";
    }
  }

  return c.json({
    studentId,
    skills: Array.from(skillsMap.values()),
    generatedAt: new Date().toISOString(),
  });
});

// ─── Authenticated routes ─────────────────────────────────────────────────────
const authRoutes = new Hono<{ Variables: AuthVariables }>();
authRoutes.use("*", requireAuth);

const createSkillSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const createEntrySchema = z.object({
  studentId: z.string().uuid(),
  skillId: z.string().uuid(),
  lessonId: z.string().uuid().optional().nullable(),
  score: z.number().int().min(0).max(100),
  comment: z.string().max(1000).optional().nullable(),
});

// GET /api/progress/skills?courseId=
authRoutes.get("/skills", async (c) => {
  const tenantId = c.get("user").tenantId;
  const courseId = c.req.query("courseId");

  const conditions = [eq(progressSkills.tenantId, tenantId)];
  if (courseId) conditions.push(eq(progressSkills.courseId, courseId));

  const skills = await db
    .select()
    .from(progressSkills)
    .where(and(...conditions))
    .orderBy(progressSkills.sortOrder, progressSkills.name);

  return c.json({ skills });
});

// POST /api/progress/skills
authRoutes.post("/skills", zValidator("json", createSkillSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [skill] = await db
    .insert(progressSkills)
    .values({
      tenantId,
      courseId: body.courseId,
      name: body.name,
      description: body.description ?? null,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();

  return c.json(skill, 201);
});

// DELETE /api/progress/skills/:id
authRoutes.delete("/skills/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();

  // Check no entries exist for this skill
  const existing = await db
    .select({ id: progressEntries.id })
    .from(progressEntries)
    .where(and(eq(progressEntries.tenantId, tenantId), eq(progressEntries.skillId, id)))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "skill_has_entries" }, 409);
  }

  await db
    .delete(progressSkills)
    .where(and(eq(progressSkills.tenantId, tenantId), eq(progressSkills.id, id)));

  return c.json({ ok: true });
});

// GET /api/progress/students/:studentId
authRoutes.get("/students/:studentId", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { studentId } = c.req.param();

  // Get all skills with their entries for this student
  const entries = await db
    .select({
      entryId: progressEntries.id,
      score: progressEntries.score,
      comment: progressEntries.comment,
      evaluatedAt: progressEntries.evaluatedAt,
      skillId: progressEntries.skillId,
      skillName: progressSkills.name,
      skillDescription: progressSkills.description,
      courseId: progressSkills.courseId,
      sortOrder: progressSkills.sortOrder,
    })
    .from(progressEntries)
    .innerJoin(progressSkills, eq(progressEntries.skillId, progressSkills.id))
    .where(
      and(
        eq(progressEntries.tenantId, tenantId),
        eq(progressEntries.studentId, studentId)
      )
    )
    .orderBy(progressSkills.sortOrder, progressSkills.name, desc(progressEntries.evaluatedAt));

  // Group by skill
  const skillsMap = new Map<
    string,
    {
      skillId: string;
      skillName: string;
      skillDescription: string | null;
      courseId: string;
      sortOrder: number;
      latestScore: number;
      latestAt: string;
      trend: "up" | "down" | "same" | "new";
      history: Array<{ score: number; evaluatedAt: string; comment: string | null }>;
    }
  >();

  for (const e of entries) {
    if (!skillsMap.has(e.skillId)) {
      skillsMap.set(e.skillId, {
        skillId: e.skillId,
        skillName: e.skillName,
        skillDescription: e.skillDescription,
        courseId: e.courseId,
        sortOrder: e.sortOrder,
        latestScore: e.score,
        latestAt: e.evaluatedAt.toISOString(),
        trend: "new",
        history: [],
      });
    }
    skillsMap.get(e.skillId)!.history.push({
      score: e.score,
      evaluatedAt: e.evaluatedAt.toISOString(),
      comment: e.comment ?? null,
    });
  }

  // Calculate trends
  for (const skill of skillsMap.values()) {
    if (skill.history.length >= 2) {
      const latest = skill.history[0].score;
      const prev = skill.history[1].score;
      skill.trend = latest > prev ? "up" : latest < prev ? "down" : "same";
    }
  }

  // Generate public token (base64url of studentId)
  const publicToken = btoa(studentId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return c.json({
    studentId,
    publicToken,
    skills: Array.from(skillsMap.values()).sort((a, b) => a.sortOrder - b.sortOrder),
  });
});

// POST /api/progress/entries
authRoutes.post("/entries", zValidator("json", createEntrySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Verify skill belongs to tenant
  const skill = await db
    .select({ id: progressSkills.id })
    .from(progressSkills)
    .where(and(eq(progressSkills.tenantId, tenantId), eq(progressSkills.id, body.skillId)))
    .limit(1);

  if (skill.length === 0) {
    return c.json({ error: "skill_not_found" }, 404);
  }

  const [entry] = await db
    .insert(progressEntries)
    .values({
      tenantId,
      studentId: body.studentId,
      skillId: body.skillId,
      lessonId: body.lessonId ?? null,
      score: body.score,
      comment: body.comment ?? null,
    })
    .returning();

  return c.json(entry, 201);
});

// Combine public + auth routes
export const progressRoutes = new Hono();
progressRoutes.route("/", publicRoutes);
progressRoutes.route("/", authRoutes);
