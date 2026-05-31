/**
 * HR-403: Teacher availability — weekly grid CRUD
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { teacherAvailability, teachers } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const availabilityRoutes = new Hono<{ Variables: AuthVariables }>();

availabilityRoutes.use("/*", requireAuth);

const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  isAvailable: z.boolean(),
});

const putSchema = z.object({
  slots: z.array(slotSchema),
});

// ─── GET /api/hr/teachers/:teacherId/availability ─────────────────────────────

availabilityRoutes.get("/:teacherId/availability", async (c) => {
  const teacherId = c.req.param("teacherId");
  const tenantId = c.get("user").tenantId;

  // Verify teacher belongs to tenant
  const teacher = await db.query.teachers.findFirst({
    where: and(eq(teachers.id, teacherId), eq(teachers.tenantId, tenantId)),
  });
  if (!teacher) return c.json({ error: "not_found" }, 404);

  const slots = await db
    .select()
    .from(teacherAvailability)
    .where(
      and(
        eq(teacherAvailability.tenantId, tenantId),
        eq(teacherAvailability.teacherId, teacherId)
      )
    )
    .orderBy(teacherAvailability.dayOfWeek, teacherAvailability.startHour);

  return c.json({ slots });
});

// ─── PUT /api/hr/teachers/:teacherId/availability ─────────────────────────────
// Replaces all slots for the teacher with the provided array.

availabilityRoutes.put(
  "/:teacherId/availability",
  zValidator("json", putSchema),
  async (c) => {
    const teacherId = c.req.param("teacherId");
    const tenantId = c.get("user").tenantId;
    const { slots } = c.req.valid("json");

    // Verify teacher belongs to tenant
    const teacher = await db.query.teachers.findFirst({
      where: and(eq(teachers.id, teacherId), eq(teachers.tenantId, tenantId)),
    });
    if (!teacher) return c.json({ error: "not_found" }, 404);

    // Delete existing slots
    await db
      .delete(teacherAvailability)
      .where(
        and(
          eq(teacherAvailability.tenantId, tenantId),
          eq(teacherAvailability.teacherId, teacherId)
        )
      );

    // Insert new slots
    if (slots.length > 0) {
      await db.insert(teacherAvailability).values(
        slots.map((slot) => ({
          tenantId,
          teacherId,
          dayOfWeek: slot.dayOfWeek,
          startHour: slot.startHour,
          endHour: slot.endHour,
          isAvailable: slot.isAvailable,
        }))
      );
    }

    // Fetch updated slots
    const updated = await db
      .select()
      .from(teacherAvailability)
      .where(
        and(
          eq(teacherAvailability.tenantId, tenantId),
          eq(teacherAvailability.teacherId, teacherId)
        )
      )
      .orderBy(teacherAvailability.dayOfWeek, teacherAvailability.startHour);

    return c.json({ slots: updated });
  }
);

/** Check if a teacher is available at a given datetime */
export async function checkTeacherAvailability(
  tenantId: string,
  teacherId: string,
  scheduledAt: Date
): Promise<boolean> {
  // 0=Sunday in JS, we convert to 0=Monday
  const jsDow = scheduledAt.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayOfWeek = jsDow === 0 ? 6 : jsDow - 1; // 0=Mon, 6=Sun
  const hour = scheduledAt.getHours();

  const slots = await db
    .select()
    .from(teacherAvailability)
    .where(
      and(
        eq(teacherAvailability.tenantId, tenantId),
        eq(teacherAvailability.teacherId, teacherId),
        eq(teacherAvailability.dayOfWeek, dayOfWeek),
        eq(teacherAvailability.isAvailable, false)
      )
    );

  // If any "unavailable" slot covers this hour → not available
  for (const slot of slots) {
    if (hour >= slot.startHour && hour < slot.endHour) {
      return false;
    }
  }
  return true; // default: available
}
