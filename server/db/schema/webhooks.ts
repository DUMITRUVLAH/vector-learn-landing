import { pgTable, uuid, varchar, timestamp, jsonb, boolean, integer, text, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * INT-902: Outbound webhook endpoints registered by tenants.
 * When events occur (lead.created, student.enrolled, payment.received),
 * the dispatcher sends POST requests to all active endpoints.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The external URL that receives webhook deliveries */
    url: varchar("url", { length: 2048 }).notNull(),
    /** HMAC secret for signature verification — stored in clear (tenant-owned) */
    secret: varchar("secret", { length: 255 }).notNull(),
    /** Subscribed event types (null = all events) */
    events: jsonb("events").$type<string[]>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("webhook_endpoints_tenant_idx").on(t.tenantId),
  })
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

/**
 * INT-902: Delivery records for webhook events.
 * Tracks the result of each delivery attempt (status code, response body, errors).
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
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

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
