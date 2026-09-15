/**
 * CRM — catalogul de produse/servicii (Faza 1).
 *
 * De ce o tabelă separată și nu un câmp text pe lead: până acum „produsul" unei
 * oportunități era text liber, iar două scrieri diferite ale aceluiași produs
 * rupeau raportarea în două. Cu un catalog, rezultatele comerciale se pot
 * aduna pe un id stabil, iar prețul are o singură sursă de adevăr.
 *
 * Multi-tenant ca tot restul aplicației: fiecare rând aparține unui `tenant_id`
 * și NU există RLS — fiecare query din rute trebuie să filtreze explicit.
 *
 * Migrare: drizzle/0149_crm_products.sql
 */
import { pgTable, uuid, varchar, text, integer, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const crmProducts = pgTable(
  "crm_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Cod intern opțional; unicitatea per tenant e impusă în rută, nu în DB,
     *  fiindcă SKU-ul poate lipsi la produsele create rapid. */
    sku: varchar("sku", { length: 60 }),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 120 }),
    description: text("description"),
    unit: varchar("unit", { length: 30 }).notNull().default("buc"),
    /** Preț de listă în bani (cenți/bani), ca peste tot în aplicație. */
    listPriceCents: integer("list_price_cents").notNull().default(0),
    currency: varchar("currency", { length: 8 }).notNull().default("MDL"),
    vatPercent: numeric("vat_percent").notNull().default("0"),
    /** Dezactivarea ascunde produsul din ofertare fără să rupă istoricul care
     *  îl referențiază — de aceea nu ștergem niciodată definitiv. */
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Legătura opțională cu articolul de inventar din FinDesk (`fin_inventory_items`).
     * Acolo stau cantitatea, costul mediu ponderat și jurnalul de mișcări — CRM-ul NU ține
     * o a doua cantitate proprie, ca stocul din ofertare și cel din contabilitate să nu
     * poată diverge. NULL = produs fără stoc (serviciu, abonament, consultanță).
     * Migrare: drizzle/0177_crm_product_stock.sql
     */
    inventoryItemId: uuid("inventory_item_id"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_products_tenant_idx").on(t.tenantId),
    index("crm_products_active_idx").on(t.tenantId, t.isActive),
    index("crm_products_inventory_idx").on(t.tenantId, t.inventoryItemId),
  ]
);

export type CrmProduct = typeof crmProducts.$inferSelect;
export type NewCrmProduct = typeof crmProducts.$inferInsert;
