import { pgTable, uuid, varchar, timestamp, pgEnum, boolean, integer, jsonb } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "growth", "pro", "enterprise"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  /** COMM-205: Tenant timezone for quiet hours (IANA, e.g. "Europe/Bucharest") */
  timezone: varchar("timezone", { length: 60 }).notNull().default("Europe/Bucharest"),
  /** CRM-135: Round-robin auto-assign — enable/disable */
  rrEnabled: boolean("rr_enabled").notNull().default(false),
  /** CRM-135: Ordered list of user IDs in the round-robin rotation */
  rrUserIds: jsonb("rr_user_ids").$type<string[]>().notNull().default([]),
  /** CRM-135: Pointer to next user in rotation (incrementing counter) */
  rrIndex: integer("rr_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
