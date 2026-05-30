/**
 * CRM-126 — Follow-up cadence tables
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

// ─── Step action types (stored inside cadence.steps JSONB) ───────────────────

export interface CadenceStep {
  delay_days: number;
  action: "send_template" | "create_task";
  /** Required when action = "send_template" */
  template_id?: string;
  /** Required when action = "create_task" */
  task_title?: string;
}

// ─── Cadence definition ───────────────────────────────────────────────────────

export const cadences = pgTable(
  "cadences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** Pipeline stage key that triggers auto-enrollment, e.g. "new", "contacted" */
    triggerStage: varchar("trigger_stage", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** JSONB: CadenceStep[] */
    steps: jsonb("steps").notNull().$type<CadenceStep[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("cad_tenant_idx").on(t.tenantId),
    enabledIdx: index("cad_enabled_idx").on(t.tenantId, t.enabled),
  })
);

export type Cadence = typeof cadences.$inferSelect;
export type NewCadence = typeof cadences.$inferInsert;

// ─── Enrollment status ────────────────────────────────────────────────────────

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "cancelled",
]);

// ─── Lead enrollment in a cadence ─────────────────────────────────────────────

export const leadCadenceEnrollments = pgTable(
  "lead_cadence_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    cadenceId: uuid("cadence_id")
      .notNull()
      .references(() => cadences.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    currentStep: integer("current_step").notNull().default(0),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    /** When the next step should fire */
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("lce_tenant_idx").on(t.tenantId),
    leadIdx: index("lce_lead_idx").on(t.leadId, t.status),
    fireIdx: index("lce_fire_idx").on(t.status, t.nextFireAt),
    cadenceIdx: index("lce_cadence_idx").on(t.cadenceId),
  })
);

export type LeadCadenceEnrollment = typeof leadCadenceEnrollments.$inferSelect;
export type NewLeadCadenceEnrollment = typeof leadCadenceEnrollments.$inferInsert;
