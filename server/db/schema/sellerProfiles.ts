import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * CONT-PLATA: the issuer's own company details ("beneficiar" on a cont de plată).
 * One row per tenant — holds the legal identity + bank coordinates that get
 * snapshotted onto every payment account at issue time.
 */
export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    idno: varchar("idno", { length: 32 }),
    legalForm: varchar("legal_form", { length: 255 }),
    vatCode: varchar("vat_code", { length: 32 }),
    address: varchar("address", { length: 500 }),
    city: varchar("city", { length: 255 }),
    iban: varchar("iban", { length: 34 }),
    bankName: varchar("bank_name", { length: 255 }),
    bankCode: varchar("bank_code", { length: 32 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 64 }),
    /** Default document series prefix, e.g. "CP" */
    defaultSeries: varchar("default_series", { length: 20 }).notNull().default("CP"),
    /** Default VAT rate as a whole percent, e.g. 20 */
    defaultVatRate: integer("default_vat_rate").notNull().default(20),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("seller_profiles_tenant_idx").on(t.tenantId),
  })
);

export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type NewSellerProfile = typeof sellerProfiles.$inferInsert;
