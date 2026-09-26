/**
 * CRM-G09 — cum își aranjează fiecare om ecranul de rapoarte.
 *
 * Ownerul: „să își poată personaliza dashboardul". Directorul vrea sus pâlnia și banii, agentul
 * vrea sus activitatea lui — același ecran, altă ordine. De aceea aranjamentul e PERSONAL
 * (un rând per om per workspace), nu setarea workspace-ului.
 *
 * `layout` e JSON, validat la intrare (`server/lib/crm/reportLayout.ts`): ordinea secțiunilor,
 * ce e ascuns, ce plăcuțe se văd și dimensiunea implicită a raportului pe segment. O coloană per
 * opțiune ar fi cerut o migrare la fiecare secțiune nouă a raportului.
 *
 * Migrare: drizzle/0192_crm_report_layouts.sql (+ heal în `server/db/sync-schema.ts`).
 */
import { pgTable, uuid, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export interface CrmReportLayoutJson {
  order?: string[];
  hidden?: string[];
  hiddenMetrics?: string[];
  segmentDimension?: string | null;
}

export const crmReportLayouts = pgTable(
  "crm_report_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    layout: jsonb("layout").$type<CrmReportLayoutJson>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_report_layouts_user_uniq").on(t.tenantId, t.userId)]
);

export type CrmReportLayout = typeof crmReportLayouts.$inferSelect;
