/**
 * CRM-134: In-app notifications — lightweight table for @mention notifications
 * and other in-app alerts sent to internal users (not leads/students).
 * Kept separate from notification_queue (which targets leads/students via external channels).
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export interface InAppNotificationPayload {
  body: string;
  lead_id?: string;
  interaction_id?: string;
  actor_name?: string;
}

export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The user who will see this notification */
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Structured payload — body, lead_id, interaction_id, actor_name */
    payload: jsonb("payload").$type<InAppNotificationPayload>().notNull(),
    /** Kind for future filtering: "mention" | "system" */
    kind: varchar("kind", { length: 32 }).notNull().default("mention"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ian_tenant_idx").on(t.tenantId),
    recipientIdx: index("ian_recipient_idx").on(t.recipientUserId),
    unreadIdx: index("ian_unread_idx").on(t.recipientUserId, t.readAt),
  })
);

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type NewInAppNotification = typeof inAppNotifications.$inferInsert;
