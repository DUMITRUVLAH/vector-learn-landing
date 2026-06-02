import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * PAY-004: Stripe configuration per tenant.
 * Keys stored encrypted (AES-256 stub — masked base64 in this version).
 * One row per tenant (upsert on save).
 */
export const stripeSettings = pgTable(
  "stripe_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Stripe publishable key (pk_live_... or pk_test_...) — safe to expose to UI */
    publishableKey: varchar("publishable_key", { length: 255 }),
    /** Stripe secret key (sk_live_... or sk_test_...) — encrypted at rest */
    secretKeyEncrypted: varchar("secret_key_encrypted", { length: 512 }),
    /** Stripe webhook endpoint secret (whsec_...) — encrypted at rest */
    webhookSecretEncrypted: varchar("webhook_secret_encrypted", { length: 512 }),
    /** Whether Stripe integration is active for this tenant */
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("stripe_settings_tenant_idx").on(t.tenantId),
  })
);

export type StripeSettings = typeof stripeSettings.$inferSelect;
export type NewStripeSettings = typeof stripeSettings.$inferInsert;
