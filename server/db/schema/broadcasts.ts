/**
 * COMM-204: Broadcasts — mass message campaigns with segmentation
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  integer,
  text,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { messageTemplates } from "./templates";
import { messageChannelEnum } from "./messages";

export const broadcastStatusEnum = pgEnum("broadcast_status", [
  "draft",
  "sending",
  "done",
  "failed",
]);

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    channel: messageChannelEnum("channel").notNull(),
    /** Segment definition: { type: "leads"|"students", status_filter?, course_filter?, tag_filter? } */
    segmentFilter: jsonb("segment_filter").notNull(),
    templateId: uuid("template_id").references(() => messageTemplates.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    subject: varchar("subject", { length: 500 }),
    status: broadcastStatusEnum("status").notNull().default("draft"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    consentSkipped: integer("consent_skipped").notNull().default(0),
    queued: integer("queued").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("bc_tenant_idx").on(t.tenantId),
    statusIdx: index("bc_status_idx").on(t.tenantId, t.status),
  })
);

export type Broadcast = typeof broadcasts.$inferSelect;
export type NewBroadcast = typeof broadcasts.$inferInsert;

export interface SegmentFilter {
  type: "leads" | "students";
  status_filter?: string;
  course_filter?: string;
  tag_filter?: string;
}
