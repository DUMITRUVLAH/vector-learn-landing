/**
 * KINDER-001 — Kindergarten / Daycare: check-in / sign-out API
 *
 * GET  /api/kinder/checkin/today             — all students with today's status
 * POST /api/kinder/checkin                   — check-in or check-out a student
 * GET  /api/kinder/students/:id/pickups      — list authorized pickups for a student
 * POST /api/kinder/students/:id/pickups      — add an authorized pickup
 * DELETE /api/kinder/students/:id/pickups/:pickupId — remove an authorized pickup
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db/client";
import { students, authorizedPickups, checkinLog } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderRoutes = new Hono<{ Variables: AuthVariables }>();

kinderRoutes.use("*", requireAuth);

/** Deterministic today date string (UTC, YYYY-MM-DD) */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** SHA-256 of a PIN string */
function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

// ─── GET /api/kinder/checkin/today ───────────────────────────────────────────
kinderRoutes.get("/checkin/today", async (c) => {
  const user = c.get("user");
  const today = todayDate();

  // Fetch all active students
  const allStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      birthDate: students.birthDate,
    })
    .from(students)
    .where(and(eq(students.tenantId, user.tenantId), eq(students.status, "active")));

  // Fetch today's checkin log entries
  const todayLogs = await db
    .select()
    .from(checkinLog)
    .where(and(eq(checkinLog.tenantId, user.tenantId), eq(checkinLog.logDate, today)));

  const logMap = new Map(todayLogs.map((l) => [l.studentId, l]));

  // Merge
  const result = allStudents.map((s) => {
    const log = logMap.get(s.id);
    return {
      studentId: s.id,
      fullName: s.fullName,
      birthDate: s.birthDate,
      checkedInAt: log?.checkedInAt ?? null,
      checkedOutAt: log?.checkedOutAt ?? null,
      pickupPersonName: log?.pickupPersonName ?? null,
      logId: log?.id ?? null,
    };
  });

  const presentCount = result.filter((r) => r.checkedInAt && !r.checkedOutAt).length;

  return c.json({ date: today, presentCount, total: result.length, students: result });
});

// ─── POST /api/kinder/checkin ─────────────────────────────────────────────────
const checkinSchema = z.object({
  studentId: z.string().uuid(),
  action: z.enum(["in", "out"]),
  pickupPersonName: z.string().max(200).optional(),
  signatureDataUrl: z.string().max(100000).optional(), // base64 canvas can be large
  pin: z.string().max(6).optional(),
  notes: z.string().max(500).optional(),
});

kinderRoutes.post("/checkin", zValidator("json", checkinSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const today = todayDate();

  // Verify student belongs to this tenant
  const [student] = await db
    .select({ id: students.id, tenantId: students.tenantId })
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  // If PIN provided, validate against authorized pickups
  if (body.pin) {
    const pinHash = hashPin(body.pin);
    const [pickup] = await db
      .select({ id: authorizedPickups.id })
      .from(authorizedPickups)
      .where(
        and(
          eq(authorizedPickups.studentId, body.studentId),
          eq(authorizedPickups.pinHash, pinHash)
        )
      );
    if (!pickup) return c.json({ error: "invalid_pin" }, 400);
  }

  // Check if there's already an entry for today
  const [existing] = await db
    .select()
    .from(checkinLog)
    .where(
      and(
        eq(checkinLog.studentId, body.studentId),
        eq(checkinLog.logDate, today)
      )
    );

  const now = new Date();

  if (body.action === "in") {
    if (existing) {
      // Update existing entry: reset check-in, clear check-out
      const [updated] = await db
        .update(checkinLog)
        .set({
          checkedInAt: now,
          checkedOutAt: null,
          staffUserId: user.id,
          notes: body.notes ?? existing.notes,
          updatedAt: now,
        })
        .where(eq(checkinLog.id, existing.id))
        .returning();
      return c.json({ ok: true, log: updated });
    } else {
      // Create new entry
      const [created] = await db
        .insert(checkinLog)
        .values({
          tenantId: user.tenantId,
          studentId: body.studentId,
          logDate: today,
          checkedInAt: now,
          staffUserId: user.id,
          notes: body.notes,
        })
        .returning();
      return c.json({ ok: true, log: created });
    }
  } else {
    // action === "out"
    if (!existing) {
      return c.json({ error: "not_checked_in" }, 400);
    }
    const [updated] = await db
      .update(checkinLog)
      .set({
        checkedOutAt: now,
        pickupPersonName: body.pickupPersonName ?? existing.pickupPersonName,
        signatureDataUrl: body.signatureDataUrl ?? existing.signatureDataUrl,
        staffUserId: user.id,
        notes: body.notes ?? existing.notes,
        updatedAt: now,
      })
      .where(eq(checkinLog.id, existing.id))
      .returning();
    return c.json({ ok: true, log: updated });
  }
});

// ─── GET /api/kinder/students/:id/pickups ────────────────────────────────────
kinderRoutes.get("/students/:id/pickups", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("id");

  // Verify student belongs to tenant
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));
  if (!student) return c.json({ error: "not_found" }, 404);

  const pickups = await db
    .select({
      id: authorizedPickups.id,
      name: authorizedPickups.name,
      relation: authorizedPickups.relation,
      phone: authorizedPickups.phone,
      isDefault: authorizedPickups.isDefault,
      hasPin: authorizedPickups.pinHash,
      createdAt: authorizedPickups.createdAt,
    })
    .from(authorizedPickups)
    .where(eq(authorizedPickups.studentId, studentId))
    .orderBy(desc(authorizedPickups.isDefault), authorizedPickups.name);

  // Don't expose pinHash — just indicate whether a PIN is set
  return c.json(
    pickups.map((p) => ({ ...p, hasPin: !!p.hasPin, pinHash: undefined }))
  );
});

// ─── POST /api/kinder/students/:id/pickups ───────────────────────────────────
const pickupSchema = z.object({
  name: z.string().min(2).max(200),
  relation: z.string().max(100).optional(),
  phone: z.string().max(32).optional(),
  pin: z.string().min(4).max(6).optional(),
  isDefault: z.boolean().optional().default(false),
});

kinderRoutes.post("/students/:id/pickups", zValidator("json", pickupSchema), async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("id");
  const body = c.req.valid("json");

  // Verify student
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));
  if (!student) return c.json({ error: "not_found" }, 404);

  const [created] = await db
    .insert(authorizedPickups)
    .values({
      tenantId: user.tenantId,
      studentId,
      name: body.name,
      relation: body.relation,
      phone: body.phone,
      pinHash: body.pin ? hashPin(body.pin) : null,
      isDefault: body.isDefault ?? false,
    })
    .returning();

  return c.json({ ok: true, pickup: { ...created, pinHash: undefined, hasPin: !!created.pinHash } }, 201);
});

// ─── DELETE /api/kinder/students/:id/pickups/:pickupId ───────────────────────
kinderRoutes.delete("/students/:id/pickups/:pickupId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("id");
  const pickupId = c.req.param("pickupId");

  // Verify student and pickup belong to this tenant
  const [pickup] = await db
    .select({ id: authorizedPickups.id })
    .from(authorizedPickups)
    .where(
      and(
        eq(authorizedPickups.id, pickupId),
        eq(authorizedPickups.studentId, studentId),
        eq(authorizedPickups.tenantId, user.tenantId)
      )
    );
  if (!pickup) return c.json({ error: "not_found" }, 404);

  await db.delete(authorizedPickups).where(eq(authorizedPickups.id, pickupId));
  return c.json({ ok: true });
});
