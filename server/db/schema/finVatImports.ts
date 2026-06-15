/**
 * Team Docs — VAT-on-imports watchlist.
 *
 * The accountant maintains a list of companies for which import VAT must be paid
 * when they make imports. During "Synchronize", documents/transactions tied to a
 * listed company are flagged as imports and the app computes the import VAT owed
 * (rate × import value) to surface a total to declare.
 *
 * Migration: drizzle/0150_fin_vat_import_companies.sql
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const finVatImportCompanies = pgTable(
  "fin_vat_import_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține lista. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Denumirea companiei pentru care se datorează TVA la import. */
    name: varchar("name", { length: 255 }).notNull(),

    /** Codul fiscal / IDNO (folosit la potrivirea cu furnizorul din document). */
    idno: varchar("idno", { length: 20 }),

    /** Cota TVA la import în basis points (2000 = 20%). Default 20%. */
    vatRateBp: integer("vat_rate_bp").notNull().default(2000),

    /** Activ în watchlist (soft-disable fără ștergere). */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_vat_import_tenant_idx").on(t.tenantId),
    index("fin_vat_import_tenant_active_idx").on(t.tenantId, t.isActive),
  ],
);

export type FinVatImportCompany = typeof finVatImportCompanies.$inferSelect;
export type InsertFinVatImportCompany = typeof finVatImportCompanies.$inferInsert;
