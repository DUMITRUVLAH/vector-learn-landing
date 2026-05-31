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
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
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

// ─── CRM-123: In-app notifications (per user, distinct from COMM-205 queue) ──────

/** CRM-123: Notification types */
export const notificationTypeEnum = pgEnum("notification_type", [
  "task_due",
  "lead_converted",
  "lead_created",
  "system",
]);

/** CRM-123: In-app notifications per user */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: varchar("body", { length: 500 }),
    /** Optional deep-link for navigation (e.g. #/app/leads/uuid) */
    link: varchar("link", { length: 500 }),
    isRead: boolean("is_read").notNull().default(false),
    /** Extra context data: lead_id, task_id, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("notif_tenant_idx").on(t.tenantId),
    userIdx: index("notif_user_idx").on(t.userId, t.isRead, t.createdAt),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
