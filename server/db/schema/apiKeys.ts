import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
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
