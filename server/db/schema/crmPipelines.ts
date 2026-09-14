/**
 * CRM — pâlnii MULTIPLE per workspace (ex. „Vânzări" + „B2B"), fiecare cu propriile etape.
 *
 * De ce: până acum un workspace avea UN singur set de etape. O firmă cu două linii de business
 * (retail și corporate) le ținea pe amândouă în aceeași pâlnie, cu etape care nu se potrivesc
 * niciuneia. Etapele se mută sub o pâlnie, iar leadul poartă `pipeline_id` — așa fiecare linie
 * își are procesul ei, fără ca vreun lead să-și piardă coloana.
 *
 * Pâlnia implicită (`is_default`) e ancora: nu se poate șterge, iar un lead fără `pipeline_id`
 * (rândurile de dinainte de migrare) e citit ca fiind în ea. Așa migrarea nu trebuie să atingă
 * fiecare lead ca produsul să rămână corect.
 *
 * Migrare: drizzle/0166_crm_pipelines.sql
 */
import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const crmPipelines = pgTable(
  "crm_pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    /** Pâlnia în care aterizează leadurile fără pâlnie explicită. Exact una per tenant. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_pipelines_tenant_idx").on(t.tenantId, t.orderIndex)]
);

export type CrmPipeline = typeof crmPipelines.$inferSelect;
export type NewCrmPipeline = typeof crmPipelines.$inferInsert;
