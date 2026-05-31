import { pgTable, uuid, varchar, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/** CRM-119: Saved filter views — reusable filter combinations per tenant */
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** JSONB: { source?, assignedTo?, searchQuery?, filterNoTask?, filterOverdue? } */
    filters: jsonb("filters").$type<SavedViewFilters>().notNull(),
    /** If true, visible to all users in the tenant; if false, only the creator */
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("sv_tenant_idx").on(t.tenantId),
    userIdx: index("sv_user_idx").on(t.userId),
  })
);

export interface SavedViewFilters {
  source?: string;
  assignedTo?: string;
  searchQuery?: string;
  filterNoTask?: boolean;
  filterOverdue?: boolean;
}

export type SavedView = typeof savedViews.$inferSelect;
export type NewSavedView = typeof savedViews.$inferInsert;
