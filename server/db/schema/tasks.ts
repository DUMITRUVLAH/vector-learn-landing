/**
 * CRM-107: Lead tasks and attachments
 */
import { pgTable, uuid, varchar, timestamp, pgEnum, index, integer } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { users } from "./users";

export const taskStatusEnum = pgEnum("task_status", ["open", "done", "snoozed"]);

export const leadTasks = pgTable(
  "lead_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: taskStatusEnum("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lt_tenant_idx").on(t.tenantId),
    leadIdx: index("lt_lead_idx").on(t.leadId),
    statusIdx: index("lt_status_idx").on(t.tenantId, t.status),
  })
);

export type LeadTask = typeof leadTasks.$inferSelect;
export type NewLeadTask = typeof leadTasks.$inferInsert;

export const leadAttachments = pgTable(
  "lead_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 300 }).notNull(),
    fileUrl: varchar("file_url", { length: 1000 }).notNull(),   // base64 data URL or S3 URL
    mime: varchar("mime", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("la_tenant_idx").on(t.tenantId),
    leadIdx: index("la_lead_idx").on(t.leadId),
  })
);

export type LeadAttachment = typeof leadAttachments.$inferSelect;
export type NewLeadAttachment = typeof leadAttachments.$inferInsert;
