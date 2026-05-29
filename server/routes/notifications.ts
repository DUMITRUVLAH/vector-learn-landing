/**
 * COMM-205: Notifications API — flush queue + payment reminders
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { payments, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { NotificationService } from "../services/notifications";

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();

notificationRoutes.use("/*", requireAuth);

const notificationService = new NotificationService(db);

// ─── POST /api/notifications/flush ────────────────────────────────────────────

notificationRoutes.post("/flush", async (c) => {
  const tenantId = c.get("user").tenantId;
  const result = await notificationService.flushQueue(tenantId);
  return c.json(result);
});

// ─── POST /api/payments/reminders ─────────────────────────────────────────────
// Queues reminder notifications for overdue payments.

const remindersSchema = z.object({
  days_overdue: z.number().int().min(1).max(90).default(7),
});

notificationRoutes.post(
  "/payment-reminders",
  zValidator("json", remindersSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { days_overdue } = c.req.valid("json");

    const cutoff = new Date(Date.now() - days_overdue * 24 * 60 * 60 * 1000);

    // Find overdue payments (status=overdue or pending past dueDate)
    const overduePayments = await db
      .select({
        id: payments.id,
        studentId: payments.studentId,
        amountCents: payments.amountCents,
        currency: payments.currency,
        dueDate: payments.dueDate,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "overdue"),
          lt(payments.dueDate, cutoff)
        )
      )
      .limit(200);

    let queued = 0;
    const skippedConsent = 0;

    for (const payment of overduePayments) {
      const student = await db.query.students.findFirst({
        where: and(eq(students.id, payment.studentId), eq(students.tenantId, tenantId)),
        columns: { phone: true, email: true, parentPhone: true, parentEmail: true, fullName: true },
      });

      if (!student) continue;

      const hasPhone = student.parentPhone ?? student.phone;
      if (!hasPhone) continue; // no contact for SMS

      const amountStr = new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: payment.currency,
        maximumFractionDigits: 0,
      }).format((payment.amountCents ?? 0) / 100);

      await notificationService.queueNotification({
        tenantId,
        recipientType: "student",
        recipientId: payment.studentId,
        channel: "sms",
        payload: {
          body: `Bună ziua! Plata de ${amountStr} pentru ${student.fullName} este restantă de ${days_overdue} de zile. Vă rugăm să o efectuați la Vector Learn.`,
        },
      });
      queued++;
    }

    return c.json({ queued, skipped_consent: skippedConsent });
  }
);
