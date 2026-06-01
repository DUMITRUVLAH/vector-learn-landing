/**
 * SCHOOL-006 — Schema orar master (timetable)
 *
 * Entități:
 *   timetable_slots — sloturi de orar: clasă × materie × profesor × sală × zi × interval
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  index,
  time,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { schoolClasses } from "./school";
import { schoolSubjects } from "./schoolGrades";
import { teachers } from "./teachers";
import { rooms } from "./rooms";

// ─── timetable_slots ──────────────────────────────────────────────────────────

export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => schoolClasses.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => schoolSubjects.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    /**
     * Ziua săptămânii: 1=Luni, 2=Marți, 3=Miercuri, 4=Joi, 5=Vineri, 6=Sâmbătă
     */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Ora de start, ex. „08:00" */
    startTime: time("start_time").notNull(),
    /** Ora de final, ex. „09:00" */
    endTime: time("end_time").notNull(),
    notes: varchar("notes", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantClassIdx: index("timetable_slots_tenant_class_idx").on(t.tenantId, t.classId),
    tenantTeacherDayIdx: index("timetable_slots_tenant_teacher_day_idx").on(
      t.tenantId,
      t.teacherId,
      t.dayOfWeek
    ),
    tenantRoomDayIdx: index("timetable_slots_tenant_room_day_idx").on(
      t.tenantId,
      t.roomId,
      t.dayOfWeek
    ),
  })
);

export type TimetableSlot = typeof timetableSlots.$inferSelect;
export type NewTimetableSlot = typeof timetableSlots.$inferInsert;
