/**
 * COMM-205: Notification queue — queued notifications with quiet hours + anti-spam.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { messageChannelEnum } from "./messages";

export const notificationRecipientTypeEnum = pgEnum("notification_recipient_type", [
  "lead",
  "student",
]);

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipientType: notificationRecipientTypeEnum("recipient_type").notNull(),
    /** UUID of the lead or student */
    recipientId: uuid("recipient_id").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    /** Payload: { body, subject?, template_id?, context } */
    payload: jsonb("payload").notNull(),
    /** When to send — may be deferred by quiet hours */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Reason the notification was skipped (spam_cap, consent_revoked, etc.) */
    skippedReason: varchar("skipped_reason", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("nq_tenant_idx").on(t.tenantId),
    recipientIdx: index("nq_recipient_idx").on(t.recipientId),
    scheduleIdx: index("nq_schedule_idx").on(t.tenantId, t.scheduledFor),
  })
);

export type NotificationQueueItem = typeof notificationQueue.$inferSelect;
export type NewNotificationQueueItem = typeof notificationQueue.$inferInsert;

export interface NotificationPayload {
  body: string;
  subject?: string;
  template_id?: string;
  context?: Record<string, string>;
}
