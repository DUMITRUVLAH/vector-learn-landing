/**
 * CX-701 — Cohorts API (editions)
 *
 * GET    /api/cohorts           — list cohorts for current tenant (with endDate + progress)
 * POST   /api/cohorts           — create cohort
 * PATCH  /api/cohorts/:id       — update cohort
 * DELETE /api/cohorts/:id       — delete cohort
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { cohorts } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  calculateCohortEndDate,
  calculateCohortProgress,
  classifyCohort,
} from "../lib/cohortDates";

export const cohortRoutes = new Hono<{ Variables: AuthVariables }>();

cohortRoutes.use("*", requireAuth);

// ─── Validators ──────────────────────────────────────────────────────────────

const cohortSchema = z.object({
  courseId: z.string().uuid(),
  label: z.string().min(1).max(300),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  totalHours: z.number().int().positive().default(32),
  hoursPerSession: z.number().int().positive().default(2),
  scheduleDays: z
    .array(
      z.enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ])
    )
    .optional()
    .nullable(),
  isOnline: z.boolean().default(false),
  manualEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  mentorCostCents: z.number().int().min(0).default(0),
  roomCostCents: z.number().int().min(0).default(0),
  driveFolderUrl: z.string().url().optional().nullable(),
  /** INTEG-103: branch_id (soft-ref, nullable UUID). FK deferred until BRANCH-faza-1 merges. */
  branchId: z.string().uuid().optional().nullable(),
});

const patchSchema = cohortSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function enrichCohort(c: typeof cohorts.$inferSelect) {
  const endDate = c.manualEndDate
    ? c.manualEndDate
    : calculateCohortEndDate(
        c.startDate,
        c.totalHours,
        c.hoursPerSession,
        c.scheduleDays as string[] | null
      )
        .toISOString()
        .slice(0, 10);

  const progress = calculateCohortProgress(c.startDate, endDate);
  const category = classifyCohort(c.startDate);

  return { ...c, endDate, progress, category };
}

// ─── GET /api/cohorts ────────────────────────────────────────────────────────

cohortRoutes.get("/", async (c) => {
  const user = c.get("user");
  const branchId = c.req.query("branchId");

  // INTEG-103: optional branchId filter
  const whereClause = branchId
    ? and(eq(cohorts.tenantId, user.tenantId), eq(cohorts.branchId, branchId))
    : eq(cohorts.tenantId, user.tenantId);

  const rows = await db
    .select()
    .from(cohorts)
    .where(whereClause)
    .orderBy(asc(cohorts.startDate));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ cohorts: list.map(enrichCohort) });
});

// ─── POST /api/cohorts ───────────────────────────────────────────────────────

cohortRoutes.post("/", zValidator("json", cohortSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const inserted = await db
    .insert(cohorts)
    .values({
      tenantId: user.tenantId,
      courseId: body.courseId,
      label: body.label,
      startDate: body.startDate,
      totalHours: body.totalHours,
      hoursPerSession: body.hoursPerSession,
      scheduleDays: body.scheduleDays ?? null,
      isOnline: body.isOnline,
      manualEndDate: body.manualEndDate ?? null,
      mentorCostCents: body.mentorCostCents,
      roomCostCents: body.roomCostCents,
      driveFolderUrl: body.driveFolderUrl ?? null,
      branchId: body.branchId ?? null, // INTEG-103
    })
    .returning();

  const row =
    Array.isArray(inserted)
      ? inserted[0]
      : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;

  return c.json({ cohort: enrichCohort(row) }, 201);
});

// ─── PATCH /api/cohorts/:id ──────────────────────────────────────────────────

cohortRoutes.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updated = await db
    .update(cohorts)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(cohorts.id, id), eq(cohorts.tenantId, user.tenantId)))
    .returning();

  const row =
    Array.isArray(updated)
      ? updated[0]
      : (updated as unknown as { rows: typeof updated }).rows?.[0];

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ cohort: enrichCohort(row) });
});

// ─── DELETE /api/cohorts/:id ─────────────────────────────────────────────────

cohortRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const deleted = await db
    .delete(cohorts)
    .where(and(eq(cohorts.id, id), eq(cohorts.tenantId, user.tenantId)))
    .returning();

  const row =
    Array.isArray(deleted)
      ? deleted[0]
      : (deleted as unknown as { rows: typeof deleted }).rows?.[0];

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
