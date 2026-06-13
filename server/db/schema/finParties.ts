/**
 * PARTY-001: FinDesk partner (client/supplier/both) schema
 * Tables: fin_parties, fin_party_contacts
 * Migration: drizzle/0115_fin_parties.sql
 *
 * Design decisions:
 * - fin_parties: tenantId scoped; kind enum client/supplier/both
 * - idno: IDNO (Moldova, 13 numeric chars) or CIF (Romania) — nullable, varchar(13)
 * - iban: nullable, validated at API layer (PARTY-002)
 * - fin_party_contacts: FK → fin_parties with cascade delete
 * - isActive: soft-delete pattern (no hard deletes for audit trail)
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  char,
  text,
  boolean,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Classification of a business partner */
export const finPartyKindEnum = pgEnum("fin_party_kind", [
  "client",
  "supplier",
  "both",
]);

// ─── fin_parties ──────────────────────────────────────────────────────────────

/**
 * Business partners: clients (we issue invoices to them), suppliers (we receive invoices),
 * or both. tenantId scopes the data per academy/company.
 */
export const finParties = pgTable(
  "fin_parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Academy/company that owns this record */
    tenantId: uuid("tenant_id").notNull(),
    /** client = we issue invoices to them; supplier = we receive invoices; both = both */
    kind: finPartyKindEnum("kind").notNull(),
    /** Legal name of the partner */
    name: text("name").notNull(),
    /** ISO 3166-1 alpha-2: "MD", "RO" */
    country: char("country", { length: 2 }).notNull(),
    /** IDNO (Moldova, 13 numeric) or CIF (Romania, up to 10 chars) */
    idno: varchar("idno", { length: 13 }),
    /** VAT registration code (e.g. TVA code in RO, distinct from IDNO in MD) */
    vatCode: varchar("vat_code", { length: 20 }),
    /** International Bank Account Number */
    iban: varchar("iban", { length: 34 }),
    /** Street address */
    address: text("address"),
    city: varchar("city", { length: 100 }),
    postalCode: varchar("postal_code", { length: 20 }),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 30 }),
    /** Soft delete: false = archived but retained for audit */
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /** Fast lookup by tenant */
    tenantIdx: index("fin_parties_tenant_idx").on(t.tenantId),
    /** Filter by tenant + kind (most common query: "list all clients for this tenant") */
    kindIdx: index("fin_parties_kind_idx").on(t.tenantId, t.kind),
  })
);

// ─── fin_party_contacts ───────────────────────────────────────────────────────

/**
 * Individual contacts at a partner company.
 * Cascade-deleted when the parent party is hard-deleted (rare; normally soft-delete via isActive).
 */
export const finPartyContacts = pgTable("fin_party_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** References fin_parties.id */
  partyId: uuid("party_id")
    .notNull()
    .references(() => finParties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** E.g. "Contabil", "Director", "Gestionar" */
  role: varchar("role", { length: 100 }),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 30 }),
  /** True = this is the primary/main contact for the partner */
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const finPartiesRelations = relations(finParties, ({ many }) => ({
  contacts: many(finPartyContacts),
}));

export const finPartyContactsRelations = relations(finPartyContacts, ({ one }) => ({
  party: one(finParties, {
    fields: [finPartyContacts.partyId],
    references: [finParties.id],
  }),
}));
