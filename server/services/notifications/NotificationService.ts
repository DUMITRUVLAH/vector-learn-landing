/**
 * COMM-205 — NotificationService
 *
 * Queues notifications respecting:
 *   1. Quiet hours (22:00–08:00 local tenant time) — defer to 08:00
 *   2. Anti-spam cap — max 3 messages per recipient per 7 days
 *   3. GDPR consent — leads with consent_revoked_at are skipped
 *
 * flushQueue() processes due items: sends via MessagingService.
 */
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { notificationQueue, messages, leads, students, tenants } from "../../db/schema";
import type { NotificationPayload } from "../../db/schema/notifications";
import { MessagingService, ConsentRevokedError } from "../messaging";

/** Quiet hours: 22:00–08:00 local time */
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;
/** Max messages per recipient per rolling 7-day window */
const SPAM_CAP = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecipientType = "lead" | "student";
export type NotificationType =
  | "lesson_rescheduled"
  | "absence_recovery"
  | "payment_overdue";

export interface QueueNotificationParams {
  tenantId: string;
  recipientType: RecipientType;
  recipientId: string;
  channel: "email" | "sms" | "whatsapp";
  payload: NotificationPayload;
}

export interface FlushResult {
  processed: number;
  skipped: number;
  errors: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationService {
  private messagingService: MessagingService;

  constructor(private readonly db: DB) {
    this.messagingService = new MessagingService(db);
  }

  /**
   * Queue a notification, applying:
   *  - Quiet hours → schedule for 08:00 local tomorrow if needed
   *  - Anti-spam cap → skip if recipient already has ≥ 3 messages in last 7 days
   */
  async queueNotification(params: QueueNotificationParams): Promise<void> {
    const {
      tenantId,
      recipientType,
      recipientId,
      channel,
      payload,
    } = params;

    // ── Get tenant timezone ──
    const tenant = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { timezone: true },
    });
    const timezone = tenant?.timezone ?? "Europe/Bucharest";

    // ── Anti-spam check: count messages in last 7 days ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count from messages table
    const [msgCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, tenantId),
          recipientType === "lead"
            ? eq(messages.leadId, recipientId)
            : eq(messages.studentId, recipientId),
          gte(messages.createdAt, sevenDaysAgo)
        )
      );

    // Count from notification_queue (already sent)
    const [nqCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.recipientId, recipientId),
          isNull(notificationQueue.skippedReason),
          gte(notificationQueue.createdAt, sevenDaysAgo)
        )
      );

    const totalRecent = (msgCount?.count ?? 0) + (nqCount?.count ?? 0);

    if (totalRecent >= SPAM_CAP) {
      // Insert with skipped reason
      await this.db.insert(notificationQueue).values({
        tenantId,
        recipientType,
        recipientId,
        channel,
        payload,
        scheduledFor: new Date(),
        skippedReason: "spam_cap",
      });
      return;
    }

    // ── Quiet hours: compute scheduledFor ──
    const scheduledFor = this.computeScheduledFor(timezone);

    // ── Insert into queue ──
    await this.db.insert(notificationQueue).values({
      tenantId,
      recipientType,
      recipientId,
      channel,
      payload,
      scheduledFor,
    });
  }

  /**
   * Compute when to schedule the notification.
   * If current local time is in quiet hours (22:00–08:00) → schedule for 08:00 today or tomorrow.
   */
  private computeScheduledFor(timezone: string): Date {
    const now = new Date();

    try {
      // Get current hour in tenant timezone
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      });
      const currentHour = Number(formatter.format(now));

      const isQuietHour =
        currentHour >= QUIET_START_HOUR || currentHour < QUIET_END_HOUR;

      if (!isQuietHour) return now;

      // Schedule for 08:00 local time
      const localFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const localDate = localFormatter.format(now);
      const target = new Date(`${localDate}T08:00:00`);

      // If 08:00 today has already passed (e.g. it's 21:00), schedule for tomorrow 08:00
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }

      return target;
    } catch {
      // Fallback: send now if timezone parsing fails
      return now;
    }
  }

  /**
   * Process all due notification_queue items.
   * Called from the /api/notifications/flush endpoint.
   */
  async flushQueue(tenantId: string): Promise<FlushResult> {
    const now = new Date();
    const result: FlushResult = { processed: 0, skipped: 0, errors: [] };

    // Get all due items for this tenant
    const due = await this.db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          isNull(notificationQueue.sentAt),
          isNull(notificationQueue.skippedReason),
          lte(notificationQueue.scheduledFor, now)
        )
      )
      .limit(100);

    for (const item of due) {
      const payload = item.payload as NotificationPayload;

      try {
        // Get recipient address
        let toAddress = "";
        let leadId: string | undefined;
        let studentId: string | undefined;

        if (item.recipientType === "lead") {
          const lead = await this.db.query.leads.findFirst({
            where: and(eq(leads.id, item.recipientId), eq(leads.tenantId, tenantId)),
            columns: { phone: true, email: true, consentRevokedAt: true },
          });
          if (!lead) {
            await this.markSkipped(item.id, "recipient_not_found");
            result.skipped++;
            continue;
          }
          if (lead.consentRevokedAt) {
            await this.markSkipped(item.id, "consent_revoked");
            result.skipped++;
            continue;
          }
          toAddress =
            item.channel === "email"
              ? (lead.email ?? "")
              : (lead.phone ?? "");
          leadId = item.recipientId;
        } else {
          const student = await this.db.query.students.findFirst({
            where: and(eq(students.id, item.recipientId), eq(students.tenantId, tenantId)),
            columns: { phone: true, email: true, parentPhone: true, parentEmail: true },
          });
          if (!student) {
            await this.markSkipped(item.id, "recipient_not_found");
            result.skipped++;
            continue;
          }
          toAddress =
            item.channel === "email"
              ? (student.parentEmail ?? student.email ?? "")
              : (student.parentPhone ?? student.phone ?? "");
          studentId = item.recipientId;
        }

        if (!toAddress) {
          await this.markSkipped(item.id, "no_address");
          result.skipped++;
          continue;
        }

        // Send via MessagingService
        await this.messagingService.sendMessage(tenantId, {
          channel: item.channel,
          toAddress,
          body: payload.body,
          subject: payload.subject,
          templateId: payload.template_id,
          leadId,
          studentId,
        });

        // Mark as sent
        await this.db
          .update(notificationQueue)
          .set({ sentAt: new Date() })
          .where(eq(notificationQueue.id, item.id));

        result.processed++;
      } catch (err) {
        if (err instanceof ConsentRevokedError) {
          await this.markSkipped(item.id, "consent_revoked");
          result.skipped++;
        } else {
          const msg = err instanceof Error ? err.message : "unknown";
          result.errors.push(`${item.id}: ${msg}`);
          await this.markSkipped(item.id, `error: ${msg.slice(0, 100)}`);
        }
      }
    }

    return result;
  }

  private async markSkipped(id: string, reason: string): Promise<void> {
    await this.db
      .update(notificationQueue)
      .set({ skippedReason: reason.slice(0, 200), sentAt: new Date() })
      .where(eq(notificationQueue.id, id));
  }
}
