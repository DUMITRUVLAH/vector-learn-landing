/**
 * CRM-127 — CRM Audit log table
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const crmAuditLog = pgTable(
  "crm_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Who performed the action (null = system/automation) */
    actorId: uuid("actor_id")
      .references(() => users.id, { onDelete: "set null" }),
    /** Entity type, e.g. "lead" */
    entityType: varchar("entity_type", { length: 64 }).notNull().default("lead"),
    /** UUID of the entity (e.g. lead.id) */
    entityId: uuid("entity_id").notNull(),
    /** Action key, e.g. lead.created | lead.updated | lead.stage_changed | lead.deleted | bulk.stage_changed | bulk.deleted */
    action: varchar("action", { length: 64 }).notNull(),
    /** Snapshot before change (null for create actions) */
    beforeSnapshot: jsonb("before_snapshot"),
    /** Snapshot after change (null for delete actions) */
    afterSnapshot: jsonb("after_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIdx: index("cal_tenant_time_idx").on(t.tenantId, t.createdAt),
    entityIdx: index("cal_entity_idx").on(t.entityId, t.createdAt),
    actorIdx: index("cal_actor_idx").on(t.tenantId, t.actorId),
  })
);

export type CrmAuditEntry = typeof crmAuditLog.$inferSelect;
export type NewCrmAuditEntry = typeof crmAuditLog.$inferInsert;
