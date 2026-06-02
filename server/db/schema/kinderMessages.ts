/**
 * KINDER-005 — Parent app feed: kinder_messages
 *
 * kinder_messages: direct messaging channel between staff and parents
 * per student. Feed is assembled from checkin_log + daily_report_events + kinder_messages.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

export const kinderMessageDirectionEnum = pgEnum("kinder_message_direction", [
  "staff_to_parent",
  "parent_to_staff",
]);

/**
 * Messages exchanged between staff and parents about a specific student.
 * Aggregated with diary events into the parent feed.
 */
export const kinderMessages = pgTable(
  "kinder_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Staff member or parent who sent the message */
    senderUserId: uuid("sender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    direction: kinderMessageDirectionEnum("direction").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when the recipient reads the message */
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("kinder_messages_tenant_idx").on(t.tenantId),
    studentIdx: index("kinder_messages_student_idx").on(t.studentId),
    sentAtIdx: index("kinder_messages_sent_at_idx").on(t.sentAt),
  })
);

export type KinderMessage = typeof kinderMessages.$inferSelect;
export type NewKinderMessage = typeof kinderMessages.$inferInsert;
