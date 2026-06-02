import { pgTable, uuid, varchar, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// COURSE-201: course status enum for soft-delete
export const courseStatusEnum = pgEnum("course_status", ["active", "archived"]);

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
    // COURSE-201: soft-delete support
    status: courseStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("courses_tenant_idx").on(t.tenantId),
    statusIdx: index("courses_status_idx").on(t.status),
  })
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
