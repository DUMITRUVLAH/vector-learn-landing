/**
 * CRM-104: Webhook event log for idempotency
 * Prevents duplicate lead creation from repeated Meta/Google webhook deliveries.
 */
import { pgTable, uuid, varchar, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const webhookProviderEnum = pgEnum("webhook_provider", [
  "facebook_lead_ads",
  "google_ads",
]);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: webhookProviderEnum("provider").notNull(),
    externalId: varchar("external_id", { length: 200 }).notNull(),  // leadgen_id, gclid, etc.
    payload: varchar("payload", { length: 8000 }),                   // raw JSON for audit
    leadId: uuid("lead_id"),                                          // created lead (nullable: if duplicate, null)
    isDuplicate: varchar("is_duplicate", { length: 5 }).notNull().default("false"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("we_tenant_idx").on(t.tenantId),
    externalIdx: index("we_external_idx").on(t.tenantId, t.provider, t.externalId),
  })
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
