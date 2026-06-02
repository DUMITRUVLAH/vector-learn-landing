import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    address: varchar("address", { length: 500 }),
    /** Optional: the user who manages this branch */
    managerUserId: uuid("manager_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Exactly one branch per tenant can be default (set programmatically) */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("branches_tenant_idx").on(t.tenantId),
    defaultIdx: index("branches_default_idx").on(t.tenantId, t.isDefault),
  })
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
