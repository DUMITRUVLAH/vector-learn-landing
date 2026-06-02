/**
 * MOB-103: Web Push subscriptions schema
 * Stores browser PushSubscription objects for Web Push (VAPID).
 * Each user can have multiple subscriptions (different devices/browsers).
 */
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The subscription endpoint URL from the browser's PushSubscription object */
    endpoint: text("endpoint").notNull(),
    /** Base64-encoded p256dh key from PushSubscription.getKey('p256dh') */
    keysP256dh: text("keys_p256dh").notNull(),
    /** Base64-encoded auth key from PushSubscription.getKey('auth') */
    keysAuth: text("keys_auth").notNull(),
    /**
     * Which notification categories this device is subscribed to.
     * Default: all categories enabled.
     */
    categories: jsonb("categories")
      .notNull()
      .default(["homework", "schedule_change", "grades", "payment", "system"]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("push_sub_tenant_idx").on(t.tenantId),
    userIdx: index("push_sub_user_idx").on(t.userId),
  })
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
