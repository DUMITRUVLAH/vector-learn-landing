/**
 * KINDER-001 — Kindergarten / Daycare: digital check-in/sign-out
 *
 * authorized_pickups: persons authorized to pick up a child, with optional PIN
 * checkin_log: daily check-in/check-out records with signature
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  text,
  date,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

/**
 * Persons authorized to pick up a specific student.
 * One student can have multiple authorized pickups.
 */
export const authorizedPickups = pgTable(
  "authorized_pickups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    relation: varchar("relation", { length: 100 }), // e.g. "mama", "tata", "bunica"
    phone: varchar("phone", { length: 32 }),
    /** SHA-256 hash of the PIN (4-6 digits). Null if no PIN set. */
    pinHash: varchar("pin_hash", { length: 64 }),
    /** Default person (shown first in pickup list) */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("authorized_pickups_tenant_idx").on(t.tenantId),
    studentIdx: index("authorized_pickups_student_idx").on(t.studentId),
  })
);

/**
 * Daily check-in / check-out log per student.
 * One row per student per day. Updated in-place for check-out.
 */
export const checkinLog = pgTable(
  "checkin_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Date of the record (local date, YYYY-MM-DD) */
    logDate: date("log_date").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    /** Name of the person who picked up the child */
    pickupPersonName: varchar("pickup_person_name", { length: 200 }),
    /** Base64 data URL of the e-signature canvas (can be large) */
    signatureDataUrl: text("signature_data_url"),
    /** Staff member who recorded the check-in */
    staffUserId: uuid("staff_user_id").references(() => users.id, { onDelete: "set null" }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("checkin_log_tenant_idx").on(t.tenantId),
    studentDateIdx: index("checkin_log_student_date_idx").on(t.studentId, t.logDate),
    tenantDateIdx: index("checkin_log_tenant_date_idx").on(t.tenantId, t.logDate),
  })
);

export type AuthorizedPickup = typeof authorizedPickups.$inferSelect;
export type NewAuthorizedPickup = typeof authorizedPickups.$inferInsert;
export type CheckinLog = typeof checkinLog.$inferSelect;
export type NewCheckinLog = typeof checkinLog.$inferInsert;
