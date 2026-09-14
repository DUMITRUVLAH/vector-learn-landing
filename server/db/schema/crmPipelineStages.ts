/**
 * CRM — etapele pâlniei, configurabile PER WORKSPACE.
 *
 * De ce o tabelă și nu un enum: etapele sunt procesul comercial al fiecărei
 * firme, nu o constantă a produsului. Un centru educațional are „Trial", un
 * instalator de panouri are „Vizită tehnică". Cât timp `leads.stage` a fost un
 * `pgEnum`, singurul mod de a adăuga o etapă era o migrare — adică o livrare de
 * cod pentru o schimbare de proces. De aceea `leads.stage` devine `varchar` în
 * migrarea 0162, exact ca în CRM-ul de referință.
 *
 * `is_won` / `is_lost` sunt flaguri, nu chei fixe: rapoartele nu au voie să
 * caute literalul „paid", pentru că fiecare workspace își numește etapele cum
 * vrea. `is_default` marchează etapele seed, ca interfața să nu lase pe cineva
 * să-și golească pâlnia din greșeală.
 *
 * Migrare: drizzle/0162_crm_pipeline_stages.sql
 */
import { pgTable, uuid, varchar, integer, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const crmPipelineStages = pgTable(
  "crm_pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Cheia scrisă în `leads.stage`. Stabilă — eticheta se poate redenumi fără
     *  să atingă lead-urile existente. */
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    /** Token pastel din design system (sky/lavender/peach/mint/rose). */
    color: varchar("color", { length: 40 }).notNull().default("sky"),
    orderIndex: integer("order_index").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    /** Probabilitatea implicită de câștig, folosită la forecast. */
    probabilityPct: integer("probability_pct").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_stages_tenant_idx").on(t.tenantId, t.orderIndex),
    unique("crm_stages_tenant_key_uniq").on(t.tenantId, t.key),
  ]
);

export type CrmPipelineStage = typeof crmPipelineStages.$inferSelect;
export type NewCrmPipelineStage = typeof crmPipelineStages.$inferInsert;
