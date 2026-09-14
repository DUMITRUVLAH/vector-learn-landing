/**
 * CRM — vizualizări salvate: un set de filtre cu nume („Leadurile mele restante", „B2B peste
 * 50.000").
 *
 * Portare din crm-vector (`src/lib/crm/savedViews.ts`), cu o diferență impusă de produs: acolo
 * baza era single-tenant, cu un singur utilizator, deci orice vizualizare era globală
 * (`is_public: true` mereu). Aici un workspace are echipă, iar „leadurile mele restante" e o
 * frază care înseamnă altceva pentru fiecare om. Deci vizualizarea e PERSONALĂ implicit, iar
 * `is_shared` o ridică explicit la nivelul echipei.
 *
 * Migrare: drizzle/0167_crm_saved_views.sql
 */
import { pgTable, uuid, varchar, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/** Filtrele salvate — aceleași chei pe care le folosește bara de filtre din pipeline. */
export interface CrmSavedViewFilters {
  search?: string;
  source?: string;
  stage?: string;
  assignedTo?: string | null;
  onlyMine?: boolean;
  pipelineId?: string | null;
  view?: "kanban" | "list";
  sort?: string;
  dir?: "asc" | "desc";
}

export const crmSavedViews = pgTable(
  "crm_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    filters: jsonb("filters").$type<CrmSavedViewFilters>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** `false` = doar autorul o vede; `true` = toată echipa workspace-ului. */
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_saved_views_tenant_idx").on(t.tenantId),
    index("crm_saved_views_owner_idx").on(t.tenantId, t.createdByUserId),
  ]
);

export type CrmSavedView = typeof crmSavedViews.$inferSelect;
export type NewCrmSavedView = typeof crmSavedViews.$inferInsert;
