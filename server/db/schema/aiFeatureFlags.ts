/**
 * AI-A04 — AI Feature Flags table
 * One row per (tenant, feature). Controls which AI features are enabled.
 * Features: lesson_summary | churn_prediction | lead_qualification | reply_suggestion
 */
import { pgTable, uuid, varchar, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const AI_FEATURES = [
  "lesson_summary",
  "churn_prediction",
  "lead_qualification",
  "reply_suggestion",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export const aiFeatureFlags = pgTable(
  "ai_feature_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    feature: varchar("feature", { length: 50 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantFeatureUniq: unique("ai_ff_tenant_feature_uniq").on(t.tenantId, t.feature),
    tenantIdx: index("ai_ff_tenant_idx").on(t.tenantId),
  })
);

export type AiFeatureFlagRow = typeof aiFeatureFlags.$inferSelect;
export type NewAiFeatureFlagRow = typeof aiFeatureFlags.$inferInsert;
