import { pgTable, uuid, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { branches } from "./branches";

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
    /** BRANCH-701: Optional branch assignment */
    branchId: uuid("branch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("teachers_tenant_idx").on(t.tenantId),
    userIdx: index("teachers_user_idx").on(t.userId),
    branchIdx: index("teachers_branch_idx").on(t.tenantId, t.branchId),
  })
);

export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
