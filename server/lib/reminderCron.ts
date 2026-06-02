/**
 * PAY-005: Automated debt reminder cron logic.
 *
 * Finds invoices overdue by 3, 7, or 14 days and sends reminders via email/WhatsApp.
 * Uses the UNIQUE(invoice_id, reminder_day) constraint for idempotency — a reminder
 * is only sent once per type per invoice.
 *
 * Usage:
 *   - From HTTP: POST /api/admin/run-reminders (for testing)
 *   - From cron: schedule with setInterval or node-cron at 09:00 daily
 */
import { and, eq, lt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, invoiceReminders, students, tenants } from "../db/schema";

export interface ReminderResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** Days-overdue thresholds for reminders */
const REMINDER_DAYS = [3, 7, 14] as const;

/**
 * Run the reminder cron for all tenants.
 * Returns a summary of what was processed.
 */
export async function runReminders(): Promise<ReminderResult> {
  const result: ReminderResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const days of REMINDER_DAYS) {
    // threshold date: invoices due before this are "days" overdue
    const thresholdDate = new Date(today);
    thresholdDate.setDate(thresholdDate.getDate() - days);

    // Find invoices: pending, dueDate <= threshold, no reminder of this type yet
    const overdueInvoices = await db
      .select({
        id: invoices.id,
        tenantId: invoices.tenantId,
        studentId: invoices.studentId,
        invoiceNumber: invoices.invoiceNumber,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
        studentName: students.fullName,
        studentEmail: students.email,
      })
      .from(invoices)
      .innerJoin(students, eq(invoices.studentId, students.id))
      .where(
        and(
          eq(invoices.status, "issued"),
          lt(invoices.dueDate, thresholdDate),
        )
      );

    for (const inv of overdueInvoices) {
      result.processed++;

      // Check if this reminder was already sent (idempotency)
      const existing = await db
        .select({ id: invoiceReminders.id })
        .from(invoiceReminders)
        .where(
          and(
            eq(invoiceReminders.invoiceId, inv.id),
            eq(invoiceReminders.reminderDay, days)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      // Compose the reminder message
      const daysOverdue = Math.floor(
        (today.getTime() - (inv.dueDate ? new Date(inv.dueDate).getTime() : today.getTime())) /
          (1000 * 60 * 60 * 24)
      );
      const amountFormatted = formatCurrency(inv.amountCents, inv.currency);
      const body = buildReminderBody({
        studentName: inv.studentName ?? "Student",
        invoiceNumber: inv.invoiceNumber,
        amountFormatted,
        daysOverdue,
        dueDate: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("ro-RO") : "-",
      });

      try {
        // Insert reminder record (UNIQUE constraint prevents duplicates)
        await db.insert(invoiceReminders).values({
          tenantId: inv.tenantId,
          invoiceId: inv.id,
          reminderDay: days,
          channel: "email",
          status: "sent",
          body,
        });

        // In production: actually send email/WhatsApp via COMM-201 provider
        // For now: log + stub (provider would be called here)
        console.log(
          `[PAY-005] Reminder sent: invoice=${inv.invoiceNumber} day=${days} student=${inv.studentName}`
        );

        result.sent++;
      } catch (err) {
        // UNIQUE violation = already sent (race condition protection)
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("unique") || errMsg.includes("duplicate")) {
          result.skipped++;
        } else {
          result.failed++;
          result.errors.push(`invoice=${inv.invoiceNumber} day=${days}: ${errMsg}`);
        }
      }
    }
  }

  return result;
}

function buildReminderBody(params: {
  studentName: string;
  invoiceNumber: string;
  amountFormatted: string;
  daysOverdue: number;
  dueDate: string;
}): string {
  return (
    `Bună ziua, ${params.studentName}!\n\n` +
    `Vă reamintim că factura ${params.invoiceNumber} în valoare de ${params.amountFormatted} ` +
    `este restantă de ${params.daysOverdue} zile (scadentă pe ${params.dueDate}).\n\n` +
    `Vă rugăm să efectuați plata cât mai curând.\n\n` +
    `Dacă ați efectuat deja plata, vă rugăm să ignorați acest mesaj.\n\n` +
    `Mulțumim!`
  );
}

function formatCurrency(cents: number, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
