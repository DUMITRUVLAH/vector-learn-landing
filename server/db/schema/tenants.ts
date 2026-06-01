import { pgTable, uuid, varchar, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "growth", "pro", "enterprise"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  /** COMM-205: Tenant timezone for quiet hours (IANA, e.g. "Europe/Bucharest") */
  timezone: varchar("timezone", { length: 60 }).notNull().default("Europe/Bucharest"),
  /** CRM-124: SLA — minutes until first response for hot leads (default 15) */
  slaHotMinutes: integer("sla_hot_minutes").notNull().default(15),
  /** CRM-124: SLA — hours until first response for default leads (default 24) */
  slaDefaultHours: integer("sla_default_hours").notNull().default(24),
  /** CRM-124: Lead-rot — days without contact before "neglected" (default 7) */
  rotDays: integer("rot_days").notNull().default(7),
  /** SET-803: Tenant logo stored as base64 data URL or external URL */
  logoUrl: varchar("logo_url", { length: 500 }),
  /** SET-803: Branding JSON — { primaryColor, accentColor } (valid hex strings) */
  brandingJson: jsonb("branding_json").$type<{ primaryColor?: string; accentColor?: string }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
