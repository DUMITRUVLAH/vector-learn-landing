/**
 * CRM — setarea „întoarce în rezervă contactele neatinse".
 *
 * O tabelă de o linie per workspace, nu o coloană în `tenants`: regula e a modulului CRM, iar
 * `tenants` e atinsă de tot produsul. Lipsa rândului înseamnă OPRIT — o automatizare care mută
 * clienți de la un agent la altul nu se pornește singură, fără ca cineva să fi cerut-o.
 *
 * Migrare: drizzle/0182_crm_recall.sql (+ heal în server/db/ensure/crmParity.ts).
 */
import { pgTable, uuid, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const crmRecallSettings = pgTable(
  "crm_recall_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    /** După câte zile fără nicio activitate se întoarce contactul în rezervă. */
    days: integer("days").notNull().default(14),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crm_recall_settings_tenant_uniq").on(t.tenantId)]
);

export type CrmRecallSettings = typeof crmRecallSettings.$inferSelect;
