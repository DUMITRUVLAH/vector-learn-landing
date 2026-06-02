/**
 * MOB-104: Direct messages between parents and teachers
 * Supports quiet-hours gating: messages sent outside quiet hours are delivered immediately,
 * within quiet hours they are stored but a notif is not dispatched until morning.
 */
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const directMessages = pgTable("direct_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  fromUserId: uuid("from_user_id").notNull(),
  toUserId: uuid("to_user_id").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  readAt: timestamp("read_at", { withTimezone: true }),
  /** True when quiet hours are active and delivery is deferred */
  queued: boolean("queued").notNull().default(false),
});
