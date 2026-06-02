import { pgTable, uuid, varchar, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "growth", "pro", "enterprise"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  /** COMM-205: Tenant timezone for quiet hours (IANA, e.g. "Europe/Bucharest") */
  timezone: varchar("timezone", { length: 60 }).notNull().default("Europe/Bucharest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
