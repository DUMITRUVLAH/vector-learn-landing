/**
 * BRANCH-701 — Multi-branch / franchise support
 *
 * branches: one row per physical location/branch in a tenant's network.
 * is_default: exactly one branch per tenant is default (the original location).
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * A branch (physical location / sub-unit) of a tenant's educational center network.
 * Tenants with a single location implicitly have one "default" branch.
 */
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    address: text("address"),
    /** User who manages this branch (manager role). Nullable = no assigned manager. */
    managerUserId: uuid("manager_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Exactly one branch per tenant should be the default (the original location). */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("branches_tenant_idx").on(t.tenantId),
    tenantDefaultIdx: index("branches_tenant_default_idx").on(t.tenantId, t.isDefault),
  })
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
