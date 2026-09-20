/**
 * CRM — NORMELE de activitate: „fiecare agent sună 60 de firme pe săptămână".
 *
 * De ce o tabelă și nu o setare în profilul omului: norma e o decizie de management care se
 * schimbă (trimestrul ăsta 60 de apeluri, la vară 40), se pune pe indicatori diferiți și poate fi
 * generală („toată echipa") sau personală. Rapoartele măsurau deja apeluri, întâlniri, oferte și
 * contracte — dar fără o țintă, un manager de call-center nu putea afla luni dimineața ce caută
 * de fapt: „43 din 60, adică 72%".
 *
 * `user_id` NULL = norma IMPLICITĂ a workspace-ului, valabilă pentru oricine n-are una proprie.
 * Cele două indexuri unice parțiale există fiindcă în Postgres două rânduri cu `user_id` NULL nu
 * se ciocnesc într-un index unic obișnuit — deci norma generală s-ar fi putut dubla în tăcere.
 *
 * Migrare: drizzle/0180_crm_kpi_targets.sql (+ heal în server/db/ensure/crmParity.ts).
 */
import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Indicatorii pe care se poate pune normă. Sunt EXACT cheile din `SalesKpis`
 * (`server/lib/crm/reports.ts`) — o normă pe un indicator care nu se măsoară ar fi o promisiune
 * goală, iar potrivirea pe nume face ca gradul de realizare să se calculeze fără traducere.
 */
export const KPI_TARGET_METRICS = [
  "callsMade",
  "successfulContacts",
  "meetings",
  "offersSent",
  "contractsSigned",
  "salesValueCents",
  "tasksDone",
] as const;

export type KpiTargetMetric = (typeof KPI_TARGET_METRICS)[number];

export const KPI_TARGET_PERIODS = ["week", "month"] as const;
export type KpiTargetPeriod = (typeof KPI_TARGET_PERIODS)[number];

export const crmKpiTargets = pgTable(
  "crm_kpi_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** `null` = norma implicită a workspace-ului. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 16 }).notNull().default("week"),
    metric: varchar("metric", { length: 40 }).notNull(),
    /** Ținta pe perioadă. Pentru `salesValueCents` e în CENȚI, ca și indicatorul măsurat. */
    target: integer("target").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_kpi_targets_tenant_idx").on(t.tenantId),
    uniqueIndex("crm_kpi_targets_user_uniq")
      .on(t.tenantId, t.userId, t.period, t.metric)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex("crm_kpi_targets_default_uniq")
      .on(t.tenantId, t.period, t.metric)
      .where(sql`${t.userId} IS NULL`),
  ]
);

export type CrmKpiTarget = typeof crmKpiTargets.$inferSelect;
export type NewCrmKpiTarget = typeof crmKpiTargets.$inferInsert;
