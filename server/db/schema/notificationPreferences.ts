/**
 * SET-802: Notification preferences — per-user opt-in/out per category.
 */
import {
  pgTable,
  uuid,
  pgEnum,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/** Categories a user can toggle. "system" is forced-on and cannot be disabled. */
export const notificationCategoryEnum = pgEnum("notification_category", [
  "system",
  "marketing",
  "alerts",
  "lessons",
]);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("np_tenant_idx").on(t.tenantId),
    userIdx: index("np_user_idx").on(t.userId),
    uniqUserCategory: unique("np_user_category_uq").on(t.userId, t.category),
  })
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

/** The 4 categories as plain JS object for iteration */
export const NOTIFICATION_CATEGORIES = ["system", "marketing", "alerts", "lessons"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
