/**
 * HR-401: Payroll API — calculate monthly salary for teachers
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/client";
import { payrollEntries, teachers, lessons, users } from "../db/schema";
import type { PayrollBreakdownItem } from "../db/schema/payroll";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const payrollRoutes = new Hono<{ Variables: AuthVariables }>();

payrollRoutes.use("/*", requireAuth);

// ─── GET /api/hr/payroll ──────────────────────────────────────────────────────

payrollRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const month = c.req.query("month");

  const conditions = [eq(payrollEntries.tenantId, tenantId)];
  if (month) conditions.push(eq(payrollEntries.month, month));

  const items = await db
    .select({
      id: payrollEntries.id,
      teacherId: payrollEntries.teacherId,
      month: payrollEntries.month,
      totalHours: payrollEntries.totalHours,
      totalCents: payrollEntries.totalCents,
      commissionCents: payrollEntries.commissionCents,
      bonusCents: payrollEntries.bonusCents,
      status: payrollEntries.status,
      createdAt: payrollEntries.createdAt,
      teacherName: users.name,
    })
    .from(payrollEntries)
    .innerJoin(teachers, eq(payrollEntries.teacherId, teachers.id))
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(payrollEntries.month), users.name);

  return c.json({ items });
});

// ─── POST /api/hr/payroll/calculate ──────────────────────────────────────────

const calculateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
});

payrollRoutes.post(
  "/calculate",
  zValidator("json", calculateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { month } = c.req.valid("json");

    // Parse month boundaries
    const [year, mon] = month.split("-").map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);

    // Get all teachers for this tenant
    const teacherRows = await db
      .select({
        id: teachers.id,
        hourlyRateCents: teachers.hourlyRateCents,
        commissionPct: teachers.commissionPct,
        teacherName: users.name,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(eq(teachers.tenantId, tenantId));

    const entries: (typeof payrollEntries.$inferSelect)[] = [];

    for (const teacher of teacherRows) {
      // Get completed lessons in the month for this teacher
      const completedLessons = await db
        .select({
          id: lessons.id,
          scheduledAt: lessons.scheduledAt,
          durationMinutes: lessons.durationMinutes,
        })
        .from(lessons)
        .where(
          and(
            eq(lessons.tenantId, tenantId),
            eq(lessons.teacherId, teacher.id),
            eq(lessons.status, "completed"),
            gte(lessons.scheduledAt, monthStart),
            lt(lessons.scheduledAt, monthEnd)
          )
        );

      // Calculate totals
      let totalMinutes = 0;
      const breakdown: PayrollBreakdownItem[] = completedLessons.map((l) => {
        const hours = l.durationMinutes / 60;
        const subtotalCents = Math.round(hours * teacher.hourlyRateCents);
        totalMinutes += l.durationMinutes;
        return {
          lessonId: l.id,
          scheduledAt: l.scheduledAt.toISOString(),
          durationMinutes: l.durationMinutes,
          rateCents: teacher.hourlyRateCents,
          subtotalCents,
        };
      });

      const totalHours = totalMinutes / 60;
      const baseCents = Math.round(totalHours * teacher.hourlyRateCents);
      const commissionCents = Math.round(baseCents * (teacher.commissionPct / 100));
      const totalCents = baseCents + commissionCents;

      // Upsert payroll entry
      const existing = await db.query.payrollEntries.findFirst({
        where: and(
          eq(payrollEntries.tenantId, tenantId),
          eq(payrollEntries.teacherId, teacher.id),
          eq(payrollEntries.month, month)
        ),
      });

      let entry: typeof payrollEntries.$inferSelect;

      if (existing) {
        const [updated] = await db
          .update(payrollEntries)
          .set({
            totalHours: String(totalHours.toFixed(2)),
            totalCents,
            commissionCents,
            breakdown,
            updatedAt: new Date(),
          })
          .where(eq(payrollEntries.id, existing.id))
          .returning();
        entry = updated;
      } else {
        const [created] = await db
          .insert(payrollEntries)
          .values({
            tenantId,
            teacherId: teacher.id,
            month,
            totalHours: String(totalHours.toFixed(2)),
            totalCents,
            commissionCents,
            breakdown,
          })
          .returning();
        entry = created;
      }

      entries.push(entry);
    }

    const totalCents = entries.reduce((sum, e) => sum + e.totalCents, 0);
    return c.json({ entries, totalCents });
  }
);

// ─── PATCH /api/hr/payroll/:id ────────────────────────────────────────────────

const updatePayrollSchema = z.object({
  status: z.enum(["draft", "approved", "paid"]),
});

payrollRoutes.patch(
  "/:id",
  zValidator("json", updatePayrollSchema),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const { status } = c.req.valid("json");

    const [updated] = await db
      .update(payrollEntries)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(payrollEntries.id, id), eq(payrollEntries.tenantId, tenantId)))
      .returning();

    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  }
);
