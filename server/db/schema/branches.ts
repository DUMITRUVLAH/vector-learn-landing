import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const branchStatusEnum = pgEnum("branch_status", ["active", "archived"]);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    address: varchar("address", { length: 500 }),
    /** Optional: the user managing this branch */
    managerUserId: uuid("manager_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: branchStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("branches_tenant_idx").on(t.tenantId),
    statusIdx: index("branches_status_idx").on(t.tenantId, t.status),
  })
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
