import { pgTable, uuid, varchar, timestamp, boolean, jsonb, index, pgEnum } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

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
