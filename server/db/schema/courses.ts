import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    level: varchar("level", { length: 32 }),
    defaultPriceCents: integer("default_price_cents").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    /** BRANCH-701: Branch offering this course (nullable = global catalog) */
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("courses_tenant_idx").on(t.tenantId),
  })
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
