/**
 * KINDER-003 — Staff-to-child ratio monitoring
 *
 * ratio_limits: per-room licensing limits (max children per staff member)
 * Used to compute live ratio status from checkin_log data
 */
import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { rooms } from "./rooms";

export const ratioLimits = pgTable(
  "ratio_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** References existing rooms table (SCHED-501) */
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    /** e.g. "0-2 ani", "2-4 ani" — for display only */
    ageGroupLabel: varchar("age_group_label", { length: 100 }),
    /** Maximum number of children allowed per staff member */
    maxChildrenPerStaff: integer("max_children_per_staff").notNull().default(8),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ratio_limits_tenant_idx").on(t.tenantId),
    roomIdx: index("ratio_limits_room_idx").on(t.roomId),
  })
);

export type RatioLimit = typeof ratioLimits.$inferSelect;
export type NewRatioLimit = typeof ratioLimits.$inferInsert;
