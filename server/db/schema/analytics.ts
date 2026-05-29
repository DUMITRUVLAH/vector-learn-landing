/**
 * CRM-112 — Ad campaign budget tracking for ROAS
 */
import { pgTable, uuid, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const adCampaignBudgets = pgTable(
  "ad_campaign_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** utm_campaign value from leads */
    utmCampaign: varchar("utm_campaign", { length: 100 }).notNull(),
    /** Total spend in cents (e.g. 100000 = 1000 RON) */
    spendCents: integer("spend_cents").notNull().default(0),
    /** ISO YYYY-MM for the month this budget applies to */
    month: varchar("month", { length: 7 }).notNull(), // e.g. "2026-05"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("acb_tenant_idx").on(t.tenantId),
    campaignIdx: index("acb_campaign_idx").on(t.tenantId, t.utmCampaign),
  })
);

export type AdCampaignBudget = typeof adCampaignBudgets.$inferSelect;
export type NewAdCampaignBudget = typeof adCampaignBudgets.$inferInsert;
