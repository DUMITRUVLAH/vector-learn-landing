import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const teachers = pgTable(
  "teachers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
    commissionPct: integer("commission_pct").notNull().default(45),
    /** BRANCH-701: Branch this teacher belongs to (nullable = all branches) */
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("teachers_tenant_idx").on(t.tenantId),
    userIdx: index("teachers_user_idx").on(t.userId),
  })
);

export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
