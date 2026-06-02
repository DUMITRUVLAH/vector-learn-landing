/**
 * CX-703/705 — Cohort participants API
 *
 * GET    /api/cohorts/:cohortId/participants   — list (CRM + manual merged)
 * GET    /api/cohorts/:cohortId/breakeven      — break-even / projected profit (CX-705)
 * POST   /api/cohorts/:cohortId/participants   — add manual participant
 * PATCH  /api/cohorts/:cohortId/participants/:id — update participant
 * DELETE /api/cohorts/:cohortId/participants/:id — remove manual participant
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  cohortParticipants,
  cohorts,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { computeCohortBreakeven } from "../lib/cohortBreakeven";

export const cohortParticipantsRoutes = new Hono<{ Variables: AuthVariables }>();

cohortParticipantsRoutes.use("*", requireAuth);

// ─── Validators ──────────────────────────────────────────────────────────────

const addSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  whatsappJoined: z.boolean().default(false),
  paymentStatus: z.enum(["full", "half", "pending", "free"]).optional().nullable(),
  amountCents: z.number().int().min(0).default(0),
  /** Only allowed for CRM source; UI should pass studentId when linking */
  studentId: z.string().uuid().optional().nullable(),
});

const patchSchema = addSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertCohortOwnership(
  cohortId: string,
  tenantId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: cohorts.id })
    .from(cohorts)
    .where(and(eq(cohorts.id, cohortId), eq(cohorts.tenantId, tenantId)));
  const list =
    Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return list.length > 0;
}

// ─── GET /api/cohorts/:cohortId/participants ──────────────────────────────────
//
// Merges two sources:
//   1. Manual participants stored in cohort_participants with source='manual'
//   2. CRM-sourced participants stored in cohort_participants with source='crm'
//      (auto-enrolled when a lead is converted to a student for this cohort)
//
// The API returns all rows from cohort_participants for this cohort+tenant.
// Enriches CRM rows with up-to-date student name/email/phone for display.

cohortParticipantsRoutes.get("/:cohortId/participants", async (c) => {
  const user = c.get("user");
  const cohortId = c.req.param("cohortId");

  if (!(await assertCohortOwnership(cohortId, user.tenantId))) {
    return c.json({ error: "not_found" }, 404);
  }

  // Get all participants for this cohort
  const rows = await db
    .select({
      participant: cohortParticipants,
      student: {
        id: students.id,
        fullName: students.fullName,
        email: students.email,
        phone: students.phone,
      },
    })
    .from(cohortParticipants)
    .leftJoin(students, eq(cohortParticipants.studentId, students.id))
    .where(
      and(
        eq(cohortParticipants.cohortId, cohortId),
        eq(cohortParticipants.tenantId, user.tenantId)
      )
    );

  const list =
    Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  // For CRM participants, use live student data if available
  const enriched = list.map(({ participant, student }) => ({
    ...participant,
    // Override with live student data for display consistency
    fullName: student?.fullName ?? participant.fullName,
    email: student?.email ?? participant.email,
    phone: student?.phone ?? participant.phone,
  }));

  return c.json({ participants: enriched });
});

// ─── GET /api/cohorts/:cohortId/breakeven ─────────────────────────────────────
// CX-705: returns projected profit / break-even data for the cohort.
// Reads cohort costs from the cohorts table; participant revenue from cohort_participants.

cohortParticipantsRoutes.get("/:cohortId/breakeven", async (c) => {
  const user = c.get("user");
  const cohortId = c.req.param("cohortId");

  // Fetch cohort (includes cost fields)
  const cohortRows = await db
    .select()
    .from(cohorts)
    .where(and(eq(cohorts.id, cohortId), eq(cohorts.tenantId, user.tenantId)));
  const cohortList =
    Array.isArray(cohortRows)
      ? cohortRows
      : (cohortRows as unknown as { rows: typeof cohortRows }).rows ?? cohortRows;

  if (cohortList.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }
  const cohort = cohortList[0]!;

  // Fetch participants to compute revenue
  const partRows = await db
    .select()
    .from(cohortParticipants)
    .where(
      and(
        eq(cohortParticipants.cohortId, cohortId),
        eq(cohortParticipants.tenantId, user.tenantId)
      )
    );
  const partList =
    Array.isArray(partRows)
      ? partRows
      : (partRows as unknown as { rows: typeof partRows }).rows ?? partRows;

  // Compute revenue totals
  let incasatCents = 0;
  let expectedCents = 0;
  for (const p of partList) {
    switch (p.paymentStatus) {
      case "full":
        incasatCents += p.amountCents;
        expectedCents += p.amountCents;
        break;
      case "half":
        incasatCents += p.amountCents;
        expectedCents += p.amountCents * 2;
        break;
      case "pending":
        expectedCents += p.amountCents;
        break;
      case "free":
      default:
        break;
    }
  }

  const result = computeCohortBreakeven({
    incasatCents,
    expectedCents,
    mentorCostCents: cohort.mentorCostCents,
    roomCostCents: cohort.roomCostCents,
    marketingCostCents: cohort.marketingCostCents ?? 0,
    allocatedFixedCostCents: 0, // fixed costs module TBD
  });

  return c.json({ breakeven: result });
});

// ─── POST /api/cohorts/:cohortId/participants ─────────────────────────────────

cohortParticipantsRoutes.post(
  "/:cohortId/participants",
  zValidator("json", addSchema),
  async (c) => {
    const user = c.get("user");
    const cohortId = c.req.param("cohortId");
    const body = c.req.valid("json");

    if (!(await assertCohortOwnership(cohortId, user.tenantId))) {
      return c.json({ error: "not_found" }, 404);
    }

    const source = body.studentId ? "crm" : "manual";

    const inserted = await db
      .insert(cohortParticipants)
      .values({
        tenantId: user.tenantId,
        cohortId,
        studentId: body.studentId ?? null,
        fullName: body.fullName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        whatsappJoined: body.whatsappJoined,
        paymentStatus: body.paymentStatus ?? null,
        amountCents: body.amountCents,
        source,
      })
      .returning();

    const row =
      Array.isArray(inserted)
        ? inserted[0]
        : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;

    return c.json({ participant: row }, 201);
  }
);

// ─── PATCH /api/cohorts/:cohortId/participants/:id ────────────────────────────

cohortParticipantsRoutes.patch(
  "/:cohortId/participants/:id",
  zValidator("json", patchSchema),
  async (c) => {
    const user = c.get("user");
    const cohortId = c.req.param("cohortId");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    if (!(await assertCohortOwnership(cohortId, user.tenantId))) {
      return c.json({ error: "not_found" }, 404);
    }

    const updated = await db
      .update(cohortParticipants)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(cohortParticipants.id, id),
          eq(cohortParticipants.cohortId, cohortId),
          eq(cohortParticipants.tenantId, user.tenantId)
        )
      )
      .returning();

    const row =
      Array.isArray(updated)
        ? updated[0]
        : (updated as unknown as { rows: typeof updated }).rows?.[0];

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ participant: row });
  }
);

// ─── DELETE /api/cohorts/:cohortId/participants/:id ───────────────────────────

cohortParticipantsRoutes.delete("/:cohortId/participants/:id", async (c) => {
  const user = c.get("user");
  const cohortId = c.req.param("cohortId");
  const id = c.req.param("id");

  if (!(await assertCohortOwnership(cohortId, user.tenantId))) {
    return c.json({ error: "not_found" }, 404);
  }

  const deleted = await db
    .delete(cohortParticipants)
    .where(
      and(
        eq(cohortParticipants.id, id),
        eq(cohortParticipants.cohortId, cohortId),
        eq(cohortParticipants.tenantId, user.tenantId)
      )
    )
    .returning();

  const row =
    Array.isArray(deleted)
      ? deleted[0]
      : (deleted as unknown as { rows: typeof deleted }).rows?.[0];

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
