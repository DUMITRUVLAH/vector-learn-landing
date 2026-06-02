import { pgTable, uuid, varchar, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { branches } from "./branches";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const COURSE_STATUSES = ["active", "archived"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

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
    /** CEFR level: A1, A2, B1, B2, C1, C2 — for language courses */
    cefrLevel: varchar("cefr_level", { length: 4 }),
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
