import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * INT-901: API Keys for external integrations (Zapier, Make, webhooks).
 * The actual key is returned only once (on creation) and stored as a bcrypt hash.
 * The prefix (first 8 chars) is stored in clear for listing/identification.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Human-readable name for this key (e.g. "Zapier integration") */
    name: varchar("name", { length: 200 }).notNull(),
    /** First 8 chars of the key, stored in clear for identification */
    prefix: varchar("prefix", { length: 8 }).notNull(),
    /** bcrypt hash of the full key — never stored in clear */
    keyHash: varchar("key_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Updated on each authenticated use */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Non-null when key is revoked */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    tenantIdx: index("api_keys_tenant_idx").on(t.tenantId),
    prefixIdx: index("api_keys_prefix_idx").on(t.prefix),
  })
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

/** INT-902: Outbound webhook endpoints configured per tenant */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 2048 }).notNull(),
    secret: varchar("secret", { length: 255 }).notNull(),
    events: jsonb("events"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("webhook_endpoints_tenant_idx").on(t.tenantId),
  })
);

/** INT-902: Delivery record for each outbound webhook attempt */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    endpointIdx: index("webhook_deliveries_endpoint_idx").on(t.endpointId),
    tenantIdx: index("webhook_deliveries_tenant_idx").on(t.tenantId),
    eventTypeIdx: index("webhook_deliveries_event_type_idx").on(t.eventType),
  })
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
