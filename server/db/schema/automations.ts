/**
 * CRM-110 — Automation engine tables
 */
import { pgTable, uuid, varchar, timestamp, boolean, jsonb, pgEnum, index, text } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

export const automationRunStatusEnum = pgEnum("automation_run_status", ["ok", "failed", "skipped"]);

/**
 * Trigger: what event fires the automation
 * - lead.created: a new lead was created
 * - lead.stage_changed: a lead moved to a different stage
 * - time.no_contact: cron runs daily; fires for leads with no interaction in N days
 */
export type AutomationTrigger =
  | { event: "lead.created"; params?: Record<string, unknown> }
  | { event: "lead.stage_changed"; params?: { toStage?: string } }
  | { event: "time.no_contact"; params?: { days: number } };

/**
 * Condition: field op value check. Evaluated against the lead.
 * ops: eq, neq, contains, gte, lte, exists, not_exists
 */
export interface AutomationCondition {
  field: string;   // lead field: source, stage, assigned_to, etc.
  op: "eq" | "neq" | "contains" | "gte" | "lte" | "exists" | "not_exists";
  value?: string | number | boolean;
}

/**
 * Action: what to do when trigger fires and conditions pass
 * - send_template: send email/whatsapp/sms using a template
 * - create_task: create a task on the lead
 * - assign: assign lead to a user
 * - move_stage: move lead to a stage
 */
export type AutomationAction =
  | { type: "send_template"; params: { templateId: string; channel: "email" | "whatsapp" | "sms" } }
  | { type: "create_task"; params: { title: string; dueDays?: number } }
  | { type: "assign"; params: { userId: string } }
  | { type: "move_stage"; params: { stage: string } };

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** JSONB: AutomationTrigger */
    trigger: jsonb("trigger").notNull(),
    /** JSONB array: AutomationCondition[] */
    conditions: jsonb("conditions").notNull().default("[]"),
    /** JSONB array: AutomationAction[] */
    actions: jsonb("actions").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("auto_tenant_idx").on(t.tenantId),
    enabledIdx: index("auto_enabled_idx").on(t.tenantId, t.enabled),
  })
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .references(() => leads.id, { onDelete: "set null" }),
    status: automationRunStatusEnum("status").notNull(),
    /** Execution detail: actions results, skip reason, errors */
    detail: text("detail"),
    /** If true, this was a dry-run (test mode) — no real effects */
    dryRun: boolean("dry_run").notNull().default(false),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ar_tenant_idx").on(t.tenantId),
    autoIdx: index("ar_auto_idx").on(t.automationId, t.ranAt),
    leadIdx: index("ar_lead_idx").on(t.leadId),
  })
);

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;
