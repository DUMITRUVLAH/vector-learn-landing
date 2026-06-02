/**
 * STU-202: student_notes — internal timeline notes per student
 * (professors, managers, reception staff)
 */
import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { students } from "./students";
import { users } from "./users";

export const studentNotes = pgTable(
  "student_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalized at write time — survives user deletion */
    authorName: varchar("author_name", { length: 255 }).notNull(),
    body: text("body").notNull(),
    /** Soft enum: general | pedagogical | parent_comm */
    noteType: varchar("note_type", { length: 32 }).notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStudentIdx: index("sn_tenant_student_idx").on(t.tenantId, t.studentId),
    createdAtIdx: index("sn_created_at_idx").on(t.tenantId, t.studentId, t.createdAt),
  })
);

export type StudentNote = typeof studentNotes.$inferSelect;
export type NewStudentNote = typeof studentNotes.$inferInsert;
