/**
 * CRM-111 — Families table
 * Educational model: payer (parent/guardian) ↔ students (children)
 * One family can have multiple students
 */
import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const families = pgTable(
  "families",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    payerName: varchar("payer_name", { length: 200 }).notNull(),
    payerPhone: varchar("payer_phone", { length: 32 }),
    payerEmail: varchar("payer_email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("families_tenant_idx").on(t.tenantId),
  })
);

export type Family = typeof families.$inferSelect;
export type NewFamily = typeof families.$inferInsert;
