/**
 * HR-404: Audit log — records critical HR actions (rate changes, status changes, etc.)
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actionType: varchar("action_type", { length: 64 }).notNull(),
    /** "teacher" | "payroll" | "user" | etc. */
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: uuid("target_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    ipAddress: varchar("ip_address", { length: 64 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("al_tenant_idx").on(t.tenantId),
    actorIdx: index("al_actor_idx").on(t.actorId),
    actionIdx: index("al_action_idx").on(t.tenantId, t.actionType),
    occurredIdx: index("al_occurred_idx").on(t.tenantId, t.occurredAt),
  })
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
