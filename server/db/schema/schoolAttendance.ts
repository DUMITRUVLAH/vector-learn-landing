/**
 * SCHOOL-003 — Schema catalog de prezență zilnică pentru clasele de școală
 *
 * attendance_sessions — o sesiune per clasă per zi
 * attendance_records  — câte un rând per elev per sesiune
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { teachers } from "./teachers";
import { students } from "./students";
import { schoolClasses } from "./school";
// Refolosim enum-ul deja definit în lessons.ts (attendance_status cu same valorile)
import { attendanceStatusEnum } from "./lessons";

// ─── attendance_sessions ──────────────────────────────────────────────────────

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => schoolClasses.id, { onDelete: "cascade" }),
    /** Profesorul care a completat catalogul în ziua respectivă */
    teacherId: uuid("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** O singură sesiune per clasă per zi */
    uniqueClassDate: unique("attendance_sessions_class_date_unique").on(t.classId, t.date),
    tenantClassDateIdx: index("attendance_sessions_tenant_class_date_idx").on(
      t.tenantId,
      t.classId,
      t.date
    ),
    tenantDateIdx: index("attendance_sessions_tenant_date_idx").on(t.tenantId, t.date),
  })
);

export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type NewAttendanceSession = typeof attendanceSessions.$inferInsert;

// ─── attendance_records ───────────────────────────────────────────────────────

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull().default("present"),
    /** Motiv absență / întârziere (opțional) */
    reason: varchar("reason", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Un singur rând per elev per sesiune */
    uniqueSessionStudent: unique("attendance_records_session_student_unique").on(
      t.sessionId,
      t.studentId
    ),
    tenantStudentIdx: index("attendance_records_tenant_student_idx").on(t.tenantId, t.studentId),
    sessionIdx: index("attendance_records_session_idx").on(t.sessionId),
  })
);

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
