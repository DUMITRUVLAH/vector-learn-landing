/**
 * COMM-201: Messages table — persists every outbound/inbound message across channels.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  text,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { students } from "./students";
import { messageTemplates } from "./templates";

export const messageChannelEnum = pgEnum("message_channel", [
  "email",
  "sms",
  "whatsapp",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "outbound",
  "inbound",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Nullable — message can relate to a lead OR a student (or neither for broadcasts) */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    direction: messageDirectionEnum("direction").notNull().default("outbound"),
    channel: messageChannelEnum("channel").notNull(),
    /** Recipient address: email address, phone number, or WhatsApp number */
    toAddress: varchar("to_address", { length: 255 }).notNull(),
    body: text("body").notNull(),
    /** Email subject line (null for SMS/WhatsApp) */
    subject: varchar("subject", { length: 500 }),
    /** FK to template used — nullable (may send without template) */
    templateId: uuid("template_id").references(() => messageTemplates.id, {
      onDelete: "set null",
    }),
    status: messageStatusEnum("status").notNull().default("queued"),
    /** Provider-assigned message ID (stub uses crypto.randomUUID()) */
    providerMessageId: varchar("provider_message_id", { length: 200 }),
    /** Error message when status = failed */
    errorMessage: varchar("error_message", { length: 1000 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("msg_tenant_idx").on(t.tenantId),
    leadIdx: index("msg_lead_idx").on(t.leadId),
    studentIdx: index("msg_student_idx").on(t.studentId),
    statusIdx: index("msg_status_idx").on(t.tenantId, t.status),
    createdIdx: index("msg_created_idx").on(t.tenantId, t.createdAt),
  })
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
