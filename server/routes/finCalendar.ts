/**
 * CALENDAR-002 + CALENDAR-003: FinDesk Calendar Fiscal — API routes
 *
 * Routes:
 *   POST   /api/fin/calendar/generate         — generează obligații pentru o lună (CALENDAR-002)
 *   GET    /api/fin/calendar                  — listează obligații + perioade blocate (CALENDAR-002)
 *   PATCH  /api/fin/calendar/:id/mark-paid    — marchează obligație ca plătită (CALENDAR-002)
 *   POST   /api/fin/calendar/lock-period      — blochează o perioadă contabilă (CALENDAR-003)
 *   DELETE /api/fin/calendar/lock-period/:year/:month — deblochează (CALENDAR-003)
 *
 * All routes require authentication. Tenant isolation enforced on every query.
 * FIN-CORE regula #8: perioadele blocate sunt imutabile — refuze write-uri (423 Locked).
 * Portabilitate DB: zero raw `.execute().rows` — usăm db.query.X.findMany().
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finObligations, finPeriodLocks } from "../db/schema/finCalendar";
import { inAppNotifications, type InAppNotificationPayload } from "../db/schema/inAppNotifications";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { generateObligations, daysUntilDue } from "../lib/fin/obligationGenerator";

export const finCalendarRoutes = new Hono<{ Variables: AuthVariables }>();

finCalendarRoutes.use("*", requireAuth);

// ─── Helper: verifică dacă o perioadă este blocată ───────────────────────────

async function isPeriodLocked(
  tenantId: string,
  year: number,
  month: number
): Promise<{ locked: boolean; lock?: typeof finPeriodLocks.$inferSelect }> {
  const lock = await db.query.finPeriodLocks.findFirst({
    where: and(
      eq(finPeriodLocks.tenantId, tenantId),
      eq(finPeriodLocks.periodYear, year),
      eq(finPeriodLocks.periodMonth, month)
    ),
  });
  return { locked: !!lock, lock };
}

// ─── Helper: creare notificări in-app pentru toți adminii tenantului ─────────

async function notifyAdmins(
  tenantId: string,
  payload: InAppNotificationPayload,
  kind = "fiscal_reminder"
): Promise<void> {
  // Găsim toți userii admin/accountant ai tenantului
  const adminUsers = await db.query.users.findMany({
    where: and(
      eq(users.tenantId, tenantId),
      sql`${users.role} IN ('admin', 'accountant')`
    ),
    columns: { id: true },
  });

  if (adminUsers.length === 0) return;

  // Creare notificări (ignorăm erorile individuale, nu blocăm fluxul principal)
  for (const u of adminUsers) {
    try {
      await db.insert(inAppNotifications).values({
        tenantId,
        recipientUserId: u.id,
        payload,
        kind,
      });
    } catch {
      // Non-blocking — nu eșuăm generarea dacă notificarea pică
    }
  }
}

// ─── POST /api/fin/calendar/generate ─────────────────────────────────────────

const generateSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
  /** Brut payroll total în cenți (opțional — 0 dacă nu se cunoaște) */
  grossPayrollCents: z.number().int().min(0).optional().default(0),
  /** TVA de plată în cenți (din FISC sau manual — 0 dacă necalculat) */
  vatDueCents: z.number().int().min(0).optional().default(0),
  /** Moneda obligațiilor (default MDL) */
  currency: z.enum(["MDL", "RON", "EUR", "USD"]).optional().default("MDL"),
});

finCalendarRoutes.post(
  "/generate",
  zValidator("json", generateSchema),
  async (c) => {
    const { year, month, grossPayrollCents, vatDueCents, currency } = c.req.valid("json");
    const tenantId = c.get("user").tenantId;

    // Verificare: perioada nu e blocată
    const { locked } = await isPeriodLocked(tenantId, year, month);
    if (locked) {
      return c.json(
        { error: "Perioadă blocată — nu se pot genera obligații retroactiv", year, month },
        423
      );
    }

    // Generare obligații (determinist)
    const generated = generateObligations({
      year,
      month,
      grossPayrollCents,
      vatDueCents,
      currency,
    });

    let created = 0;
    let updated = 0;
    const resultIds: string[] = [];

    for (const obl of generated) {
      // UPSERT: verificăm dacă obligația (tip+perioadă) există deja
      const existing = await db.query.finObligations.findFirst({
        where: and(
          eq(finObligations.tenantId, tenantId),
          eq(finObligations.obligationType, obl.obligationType),
          eq(finObligations.periodYear, obl.periodYear),
          eq(finObligations.periodMonth, obl.periodMonth)
        ),
      });

      if (existing) {
        // Actualizăm amount și dueDate (nu statusul — poate fi deja paid)
        const [updated_row] = await db
          .update(finObligations)
          .set({
            amountCents: obl.amountCents,
            dueDate: obl.dueDate,
            description: obl.description,
            updatedAt: new Date(),
          })
          .where(eq(finObligations.id, existing.id))
          .returning({ id: finObligations.id });
        if (updated_row) resultIds.push(updated_row.id);
        updated++;
      } else {
        // Inserăm nouă obligație
        const [inserted] = await db
          .insert(finObligations)
          .values({
            tenantId,
            obligationType: obl.obligationType,
            description: obl.description,
            periodYear: obl.periodYear,
            periodMonth: obl.periodMonth,
            dueDate: obl.dueDate,
            amountCents: obl.amountCents,
            currency: obl.currency,
            status: "pending",
          })
          .returning({ id: finObligations.id });
        if (inserted) resultIds.push(inserted.id);
        created++;
      }
    }

    // Remindere in-app: dacă vreun termen e în ≤7 zile
    const today = new Date();
    for (const obl of generated) {
      const days = daysUntilDue(obl.dueDate, today);
      if (days <= 7 && days >= 0) {
        await notifyAdmins(
          tenantId,
          {
            body: `Termen fiscal în ${days} ${days === 1 ? "zi" : "zile"}: ${obl.description} — ${obl.amountCents / 100} ${obl.currency}`,
          },
          "fiscal_reminder"
        );
      }
    }

    // Returnăm obligațiile generate (pentru UI)
    const obligations = await db.query.finObligations.findMany({
      where: and(
        eq(finObligations.tenantId, tenantId),
        eq(finObligations.periodYear, year),
        eq(finObligations.periodMonth, month)
      ),
    });

    return c.json({ created, updated, obligations });
  }
);

// ─── GET /api/fin/calendar ────────────────────────────────────────────────────

finCalendarRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const yearStr = c.req.query("year");
  const monthStr = c.req.query("month");
  const status = c.req.query("status");
  const type = c.req.query("type");

  // Build conditions
  const conditions = [eq(finObligations.tenantId, tenantId)];

  if (yearStr) {
    const y = parseInt(yearStr, 10);
    if (!isNaN(y)) conditions.push(eq(finObligations.periodYear, y));
  }
  if (monthStr) {
    const m = parseInt(monthStr, 10);
    if (!isNaN(m) && m >= 1 && m <= 12) conditions.push(eq(finObligations.periodMonth, m));
  }
  if (status && ["pending", "paid", "overdue"].includes(status)) {
    conditions.push(eq(finObligations.status, status));
  }
  if (type) {
    conditions.push(eq(finObligations.obligationType, type));
  }

  const obligations = await db.query.finObligations.findMany({
    where: and(...conditions),
    orderBy: (t) => [t.dueDate],
  });

  // Perioadele blocate (pentru luna dată dacă filtrăm, altfel toate)
  const lockConditions = [eq(finPeriodLocks.tenantId, tenantId)];
  if (yearStr) {
    const y = parseInt(yearStr, 10);
    if (!isNaN(y)) lockConditions.push(eq(finPeriodLocks.periodYear, y));
  }
  if (monthStr) {
    const m = parseInt(monthStr, 10);
    if (!isNaN(m)) lockConditions.push(eq(finPeriodLocks.periodMonth, m));
  }

  const locked_periods = await db.query.finPeriodLocks.findMany({
    where: and(...lockConditions),
    orderBy: (t) => [t.periodYear, t.periodMonth],
  });

  return c.json({ obligations, locked_periods });
});

// ─── PATCH /api/fin/calendar/:id/mark-paid ───────────────────────────────────

finCalendarRoutes.patch("/:id/mark-paid", async (c) => {
  const { id } = c.req.param();
  const tenantId = c.get("user").tenantId;

  // Găsim obligația
  const obligation = await db.query.finObligations.findFirst({
    where: and(eq(finObligations.id, id), eq(finObligations.tenantId, tenantId)),
  });

  if (!obligation) {
    return c.json({ error: "Obligație negăsită" }, 404);
  }

  // Verificare: perioada nu e blocată
  const { locked, lock } = await isPeriodLocked(
    tenantId,
    obligation.periodYear,
    obligation.periodMonth
  );
  if (locked) {
    return c.json(
      {
        error: "Perioadă blocată — nu se pot modifica date",
        locked_by: lock?.lockedBy,
        locked_at: lock?.lockedAt,
      },
      423
    );
  }

  const [updated] = await db
    .update(finObligations)
    .set({
      status: "paid",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(finObligations.id, id), eq(finObligations.tenantId, tenantId)))
    .returning();

  return c.json({ obligation: updated });
});

// ─── POST /api/fin/calendar/lock-period (CALENDAR-003) ───────────────────────

const lockPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  month: z.number().int().min(1).max(12),
  notes: z.string().max(1000).optional(),
});

finCalendarRoutes.post(
  "/lock-period",
  zValidator("json", lockPeriodSchema),
  async (c) => {
    const { year, month, notes } = c.req.valid("json");
    const user = c.get("user");
    const tenantId = user.tenantId;

    // Verificare rol: doar admin sau accountant pot bloca
    if (!["admin", "accountant"].includes(user.role)) {
      return c.json({ error: "Acces interzis — rol insuficient" }, 403);
    }

    // Verificare dacă perioada e deja blocată
    const existing = await db.query.finPeriodLocks.findFirst({
      where: and(
        eq(finPeriodLocks.tenantId, tenantId),
        eq(finPeriodLocks.periodYear, year),
        eq(finPeriodLocks.periodMonth, month)
      ),
    });

    if (existing) {
      return c.json({ error: "Perioadă deja blocată", lock: existing }, 409);
    }

    const [lock] = await db
      .insert(finPeriodLocks)
      .values({
        tenantId,
        periodYear: year,
        periodMonth: month,
        lockedBy: user.id,
        notes,
      })
      .returning();

    // Notificări in-app pentru toți adminii
    const monthNames = [
      "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
      "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
    ];
    const monthName = monthNames[month - 1] ?? `Luna ${month}`;
    await notifyAdmins(
      tenantId,
      { body: `Perioada ${monthName} ${year} a fost blocată de ${user.name ?? user.email}` },
      "period_lock"
    );

    return c.json({ lock });
  }
);

// ─── DELETE /api/fin/calendar/lock-period/:year/:month (CALENDAR-003) ────────

finCalendarRoutes.delete("/lock-period/:year/:month", async (c) => {
  const yearParam = c.req.param("year");
  const monthParam = c.req.param("month");
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Doar admin poate debloca
  if (user.role !== "admin") {
    return c.json({ error: "Acces interzis — doar administratorii pot debloca o perioadă" }, 403);
  }

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return c.json({ error: "An sau lună invalidă" }, 400);
  }

  const existing = await db.query.finPeriodLocks.findFirst({
    where: and(
      eq(finPeriodLocks.tenantId, tenantId),
      eq(finPeriodLocks.periodYear, year),
      eq(finPeriodLocks.periodMonth, month)
    ),
  });

  if (!existing) {
    return c.json({ error: "Perioadă nu este blocată" }, 404);
  }

  await db
    .delete(finPeriodLocks)
    .where(and(
      eq(finPeriodLocks.id, existing.id),
      eq(finPeriodLocks.tenantId, tenantId)
    ));

  // Notificări in-app
  const monthNames = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
  ];
  const monthName = monthNames[month - 1] ?? `Luna ${month}`;
  await notifyAdmins(
    tenantId,
    { body: `Perioada ${monthName} ${year} a fost deblocată de ${user.name ?? user.email}` },
    "period_unlock"
  );

  return c.json({ ok: true, year, month });
});
