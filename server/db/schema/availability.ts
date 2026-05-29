/**
 * HR-403: Teacher availability — weekly grid with hour slots.
 */
import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { teachers } from "./teachers";

export const teacherAvailability = pgTable(
  "teacher_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    /** 0=Monday, 1=Tuesday, …, 6=Sunday */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Hour slot 0–23 */
    startHour: integer("start_hour").notNull(),
    endHour: integer("end_hour").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ta_tenant_idx").on(t.tenantId),
    teacherIdx: index("ta_teacher_idx").on(t.teacherId),
    slotIdx: index("ta_slot_idx").on(t.teacherId, t.dayOfWeek, t.startHour),
  })
);

export type TeacherAvailability = typeof teacherAvailability.$inferSelect;
export type NewTeacherAvailability = typeof teacherAvailability.$inferInsert;
