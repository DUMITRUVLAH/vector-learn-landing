/**
 * CRM-105: Pipeline stages — custom stages per tenant.
 * Default stages are seeded on tenant creation: new/contacted/trial/paid/lost.
 */
import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),      // unique per tenant, used in leads.stage
    label: varchar("label", { length: 100 }).notNull(),
    color: varchar("color", { length: 50 }).notNull().default("pastel-sky"),  // design token
    orderIndex: integer("order_index").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),   // converting stage
    isLost: boolean("is_lost").notNull().default(false), // lost stage → requires lostReason
    isDefault: boolean("is_default").notNull().default(false), // system default (cannot delete)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ps_tenant_idx").on(t.tenantId),
    keyIdx: index("ps_key_idx").on(t.tenantId, t.key),
  })
);

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;

/** Default stages to seed for new tenants (or migration) */
export const DEFAULT_PIPELINE_STAGES: Omit<NewPipelineStage, "id" | "tenantId" | "createdAt" | "updatedAt">[] = [
  { key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true },
  { key: "contacted", label: "Contactat", color: "pastel-lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true },
  { key: "trial", label: "Trial / Demo", color: "pastel-peach", orderIndex: 2, isWon: false, isLost: false, isDefault: true },
  { key: "paid", label: "Client", color: "pastel-mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true },
  { key: "lost", label: "Pierdut", color: "pastel-rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true },
];
