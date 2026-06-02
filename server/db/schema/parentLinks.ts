/**
 * MOB-104: Parent-student link table
 * Associates a parent user account with a student record.
 * One parent can have multiple children; one child can have multiple guardians.
 */
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const parentStudentLinks = pgTable("parent_student_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull(),
  parentUserId: uuid("parent_user_id").notNull(),
  studentId: uuid("student_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
