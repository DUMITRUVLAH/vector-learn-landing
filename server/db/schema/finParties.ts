/**
 * PARTY-001: FinDesk partner (client/supplier/both) schema
 * Copied from origin/feat/FIN-party for MASS-003 cross-module dependency.
 * Tables: fin_parties, fin_party_contacts
 * Migration: drizzle/0119_fin_parties.sql (renumbered from 0115 to avoid collision)
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

export const finParties = pgTable(
  "fin_parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    kind: finPartyKindEnum("kind").notNull(),
    name: text("name").notNull(),
    country: char("country", { length: 2 }).notNull(),
    idno: varchar("idno", { length: 13 }),
    vatCode: varchar("vat_code", { length: 20 }),
    iban: varchar("iban", { length: 34 }),
    address: text("address"),
    city: varchar("city", { length: 100 }),
    postalCode: varchar("postal_code", { length: 20 }),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 30 }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_parties_tenant_idx").on(t.tenantId),
    kindIdx: index("fin_parties_kind_idx").on(t.tenantId, t.kind),
  })
);

// ─── fin_party_contacts ───────────────────────────────────────────────────────

export const finPartyContacts = pgTable("fin_party_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .notNull()
    .references(() => finParties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: varchar("role", { length: 100 }),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 30 }),
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

// ─── TypeScript inference helpers ─────────────────────────────────────────────

export type FinParty = typeof finParties.$inferSelect;
export type InsertFinParty = typeof finParties.$inferInsert;
export type FinPartyContact = typeof finPartyContacts.$inferSelect;
export type InsertFinPartyContact = typeof finPartyContacts.$inferInsert;
