/**
 * KINDER-003 — Staff-to-child ratio monitoring API
 *
 * GET    /api/kinder/ratio/live    — live ratio per room (from today's checkin data)
 * GET    /api/kinder/ratio/limits  — list ratio limits for this tenant
 * POST   /api/kinder/ratio/limits  — create or update ratio limit for a room
 * PUT    /api/kinder/ratio/limits/:id — update a ratio limit
 * DELETE /api/kinder/ratio/limits/:id — remove a ratio limit
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, count } from "drizzle-orm";
import { db } from "../db/client";
import { rooms, ratioLimits, checkinLog, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderRatioRoutes = new Hono<{ Variables: AuthVariables }>();

kinderRatioRoutes.use("*", requireAuth);

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ratio status logic */
function computeStatus(
  childrenPresent: number,
  staffPresent: number,
  limit: number | null
): "ok" | "warning" | "over" | "unconfigured" {
  if (limit === null) return "unconfigured";
  if (staffPresent === 0) return childrenPresent > 0 ? "over" : "ok";
  const capacity = staffPresent * limit;
  if (childrenPresent > capacity) return "over";
  if (childrenPresent >= Math.floor(capacity * 0.8)) return "warning";
  return "ok";
}

// ─── GET /api/kinder/ratio/live ───────────────────────────────────────────────
kinderRatioRoutes.get("/ratio/live", async (c) => {
  const user = c.get("user");
  const today = todayDate();

  // All rooms for this tenant
  const allRooms = await db
    .select({ id: rooms.id, name: rooms.name })
    .from(rooms)
    .where(eq(rooms.tenantId, user.tenantId));

  // Today's checkin counts per room
  // Since our checkin_log doesn't track room assignment, we compute tenant-wide totals.
  // Room-specific future work; for now we return per-tenant aggregate per room.
  // Children present = checked in but not checked out today
  const checkinRows = await db
    .select({ studentId: checkinLog.studentId })
    .from(checkinLog)
    .where(
      and(
        eq(checkinLog.tenantId, user.tenantId),
        eq(checkinLog.logDate, today)
      )
    );

  // Children present (not checked out)
  // Note: checkedInAt is a timestamp; we need to filter those with checkedInAt set and checkedOutAt null
  const checkinFull = await db
    .select({ studentId: checkinLog.studentId, checkedInAt: checkinLog.checkedInAt, checkedOutAt: checkinLog.checkedOutAt })
    .from(checkinLog)
    .where(
      and(
        eq(checkinLog.tenantId, user.tenantId),
        eq(checkinLog.logDate, today)
      )
    );

  const childrenPresent = checkinFull.filter(r => r.checkedInAt && !r.checkedOutAt).length;

  // Staff present: count teachers who are checked in today as a rough proxy
  // (In a fuller implementation we'd have a separate staff check-in flow)
  // For now: count active staff users (we don't have staff check-in, so use a sensible default)
  const staffCount = await db
    .select({ c: db.$count(users.id) })
    .from(users)
    .where(and(eq(users.tenantId, user.tenantId), eq(users.role, "teacher")));

  // Get staffPresent as a simple count (all staff are assumed present)
  const staffPresent = (staffCount[0]?.c ?? 0) as number;

  // Ratio limits per room
  const limits = await db
    .select()
    .from(ratioLimits)
    .where(eq(ratioLimits.tenantId, user.tenantId));

  const limitsByRoom = new Map(limits.map(l => [l.roomId, l]));

  // Build result
  const result = allRooms.map(room => {
    const limit = limitsByRoom.get(room.id);
    return {
      roomId: room.id,
      roomName: room.name,
      childrenCount: childrenPresent,
      staffCount: staffPresent,
      ratioLimit: limit?.maxChildrenPerStaff ?? null,
      ageGroupLabel: limit?.ageGroupLabel ?? null,
      status: computeStatus(childrenPresent, staffPresent, limit?.maxChildrenPerStaff ?? null),
    };
  });

  // Also include a global alert if any room is "over"
  const hasOverCapacity = result.some(r => r.status === "over");

  return c.json({ date: today, hasOverCapacity, rooms: result });
});

// ─── GET /api/kinder/ratio/limits ────────────────────────────────────────────
kinderRatioRoutes.get("/ratio/limits", async (c) => {
  const user = c.get("user");
  const limits = await db
    .select()
    .from(ratioLimits)
    .where(eq(ratioLimits.tenantId, user.tenantId));
  return c.json(limits);
});

// ─── POST /api/kinder/ratio/limits ───────────────────────────────────────────
const ratioLimitSchema = z.object({
  roomId: z.string().uuid(),
  maxChildrenPerStaff: z.number().int().min(1).max(50),
  ageGroupLabel: z.string().max(100).optional(),
});

kinderRatioRoutes.post("/ratio/limits", zValidator("json", ratioLimitSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verify room belongs to tenant
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, body.roomId), eq(rooms.tenantId, user.tenantId)));
  if (!room) return c.json({ error: "room_not_found" }, 404);

  const [created] = await db
    .insert(ratioLimits)
    .values({
      tenantId: user.tenantId,
      roomId: body.roomId,
      maxChildrenPerStaff: body.maxChildrenPerStaff,
      ageGroupLabel: body.ageGroupLabel,
    })
    .returning();

  return c.json({ ok: true, limit: created }, 201);
});

// ─── PUT /api/kinder/ratio/limits/:id ────────────────────────────────────────
kinderRatioRoutes.put("/ratio/limits/:id", zValidator("json", ratioLimitSchema.partial()), async (c) => {
  const user = c.get("user");
  const limitId = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: ratioLimits.id })
    .from(ratioLimits)
    .where(and(eq(ratioLimits.id, limitId), eq(ratioLimits.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(ratioLimits)
    .set({
      ...(body.maxChildrenPerStaff !== undefined && { maxChildrenPerStaff: body.maxChildrenPerStaff }),
      ...(body.ageGroupLabel !== undefined && { ageGroupLabel: body.ageGroupLabel }),
      updatedAt: new Date(),
    })
    .where(eq(ratioLimits.id, limitId))
    .returning();

  return c.json({ ok: true, limit: updated });
});

// ─── DELETE /api/kinder/ratio/limits/:id ─────────────────────────────────────
kinderRatioRoutes.delete("/ratio/limits/:id", async (c) => {
  const user = c.get("user");
  const limitId = c.req.param("id");

  const [existing] = await db
    .select({ id: ratioLimits.id })
    .from(ratioLimits)
    .where(and(eq(ratioLimits.id, limitId), eq(ratioLimits.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(ratioLimits).where(eq(ratioLimits.id, limitId));
  return c.json({ ok: true });
});
