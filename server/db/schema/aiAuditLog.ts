/**
 * AI-A01 — AI audit log table
 * Records every AI LLM call: model, tokens, cost, pseudonymization flag.
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const aiAuditLog = pgTable(
  "ai_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Who triggered the AI call (null = system) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** What feature triggered this: lesson_summary | churn_prediction | lead_qualification | reply_suggestion | system */
    action: varchar("action", { length: 64 }).notNull().default("system"),
    /** LLM model used, e.g. "claude-3-haiku-20240307" or "stub" */
    model: varchar("model", { length: 100 }).notNull().default("stub"),
    /** Number of input tokens consumed (0 for stub) */
    promptTokens: integer("prompt_tokens").notNull().default(0),
    /** Number of output tokens consumed (0 for stub) */
    completionTokens: integer("completion_tokens").notNull().default(0),
    /** Estimated cost in micro-USD (e.g. 1500 = $0.0015). 0 for stub. */
    costUsdMicro: integer("cost_usd_micro").notNull().default(0),
    /** Whether personal names were pseudonymized before sending to LLM */
    pseudonymized: boolean("pseudonymized").notNull().default(true),
    /** Optional: the entity this call relates to (e.g. lesson id, lead id) */
    entityType: varchar("entity_type", { length: 64 }),
    entityId: uuid("entity_id"),
    /** Status: completed | error | budget_exceeded | feature_disabled */
    status: varchar("status", { length: 32 }).notNull().default("completed"),
    /** Short description / error message */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ai_al_tenant_idx").on(t.tenantId),
    userIdx: index("ai_al_user_idx").on(t.userId),
    actionIdx: index("ai_al_action_idx").on(t.tenantId, t.action),
    createdIdx: index("ai_al_created_idx").on(t.tenantId, t.createdAt),
  })
);

export type AiAuditLogEntry = typeof aiAuditLog.$inferSelect;
export type NewAiAuditLogEntry = typeof aiAuditLog.$inferInsert;
