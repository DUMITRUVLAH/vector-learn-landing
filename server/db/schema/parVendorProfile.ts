/**
 * PAR-VENDOR360 — fișa furnizorului: categorii, evaluări, note interne, oferte, documente.
 *
 * De ce separat de `par.ts`: registrul de beneficiari (`par_vendors`) rămâne stratul de rechizite
 * (nume, IDNO, IBAN) folosit la fiecare plată. Tot ce ține de RELAȚIA cu furnizorul — cât de bine a
 * prestat, în ce domeniu lucrează, ce oferte a dat, ce contract avem cu el — trăiește aici, ca să nu
 * umflăm tabela care intră pe calea critică a fiecărei cereri.
 *
 * Regula de audit: evaluările și notele NU se șterg la ștergerea cererii (`set null` pe `par_id`) —
 * o părere despre un furnizor rămâne validă chiar dacă cererea care a generat-o dispare.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { parVendors, parRequests } from "./par";

/** Domeniile în care lucrează furnizorii: mâncare, birotică, servicii juridice, transport… */
export const parVendorCategories = pgTable(
  "par_vendor_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Normalizat (lowercase, fără diacritice) — cheia de unicitate per tenant. */
    slug: varchar("slug", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendor_categories_tenant_idx").on(t.tenantId),
    slugUniq: uniqueIndex("par_vendor_categories_tenant_slug_uniq").on(t.tenantId, t.slug),
  })
);

/** Un furnizor poate ține de mai multe domenii (catering ȘI transport). */
export const parVendorCategoryLinks = pgTable(
  "par_vendor_category_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => parVendors.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => parVendorCategories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("par_vendor_category_links_vendor_idx").on(t.vendorId),
    categoryIdx: index("par_vendor_category_links_category_idx").on(t.categoryId),
    pairUniq: uniqueIndex("par_vendor_category_links_pair_uniq").on(t.vendorId, t.categoryId),
  })
);

/**
 * Evaluarea prestației, de regulă cerută printr-un popup după ce cererea ajunge `paid`.
 *
 * `stars` e nota generală (1–5) și e singura obligatorie; criteriile sunt opționale, ca să nu
 * transformăm un gest de 3 secunde într-un formular. `par_id` null = evaluare de sine stătătoare
 * (cineva vrea să noteze o colaborare care n-a trecut printr-o cerere).
 */
export const parVendorRatings = pgTable(
  "par_vendor_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => parVendors.id, { onDelete: "cascade" }),
    parId: uuid("par_id").references(() => parRequests.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 1–5, obligatoriu. */
    stars: integer("stars").notNull(),
    /** Criterii opționale, tot 1–5. */
    qualityStars: integer("quality_stars"),
    timelinessStars: integer("timeliness_stars"),
    priceStars: integer("price_stars"),
    communicationStars: integer("communication_stars"),
    comment: text("comment"),
    /** „L-ai mai chema?" — semnalul cel mai citit dintr-o listă de furnizori. */
    wouldUseAgain: boolean("would_use_again"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendor_ratings_tenant_idx").on(t.tenantId),
    vendorIdx: index("par_vendor_ratings_vendor_idx").on(t.vendorId),
    parIdx: index("par_vendor_ratings_par_idx").on(t.parId),
    // O singură evaluare per om per cerere. NULL-urile sunt distincte în Postgres, deci
    // evaluările de sine stătătoare (par_id null) nu se lovesc de această constrângere.
    parAuthorUniq: uniqueIndex("par_vendor_ratings_par_author_uniq").on(t.parId, t.authorUserId),
  })
);

/** Note interne despre furnizor, fără notă — „a livrat cu 2 zile întârziere, dar a anunțat". */
export const parVendorNotes = pgTable(
  "par_vendor_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => parVendors.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Notă fixată sus pe fișă — atenționări de tipul „cere avans 50%". */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendor_notes_tenant_idx").on(t.tenantId),
    vendorIdx: index("par_vendor_notes_vendor_idx").on(t.vendorId),
  })
);

/**
 * Ofertele primite de la furnizor — inclusiv cele din trecut, adăugate manual pentru analiză.
 *
 * Ofertele colectate pe o cerere de tip „obținere oferte" trăiesc deja în `par_quotes`; fișa
 * furnizorului le afișează pe amândouă în același tab (vezi server/routes/parVendorProfile.ts).
 * Aici intră ce nu are cerere în spate: istoricul de prețuri pe care vrei să-l compari.
 */
export const parVendorOffers = pgTable(
  "par_vendor_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => parVendors.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    categoryId: uuid("category_id").references(() => parVendorCategories.id, {
      onDelete: "set null",
    }),
    /** Totalul ofertei în unități minore. */
    amountCents: integer("amount_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    /** Preț pe unitate + eticheta unității („top hârtie", „persoană", „oră") — baza comparației. */
    unitLabel: varchar("unit_label", { length: 50 }),
    unitPriceCents: integer("unit_price_cents"),
    offeredAt: timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    /** received | accepted | rejected | expired */
    status: varchar("status", { length: 20 }).notNull().default("received"),
    parId: uuid("par_id").references(() => parRequests.id, { onDelete: "set null" }),
    fileUrl: text("file_url"),
    fileName: varchar("file_name", { length: 300 }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendor_offers_tenant_idx").on(t.tenantId),
    vendorIdx: index("par_vendor_offers_vendor_idx").on(t.vendorId),
  })
);

/**
 * Contracte, certificate, licențe, polițe — cu data până la care sunt valabile.
 * Fișa avertizează când expiră; asta e diferența dintre un dosar și un raft cu hârtii.
 */
export const parVendorDocuments = pgTable(
  "par_vendor_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => parVendors.id, { onDelete: "cascade" }),
    /** contract | certificat | licenta | polita | alt */
    kind: varchar("kind", { length: 40 }).notNull().default("contract"),
    title: varchar("title", { length: 300 }).notNull(),
    number: varchar("number", { length: 100 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    fileUrl: text("file_url"),
    fileName: varchar("file_name", { length: 300 }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendor_documents_tenant_idx").on(t.tenantId),
    vendorIdx: index("par_vendor_documents_vendor_idx").on(t.vendorId),
  })
);

export type ParVendorCategory = typeof parVendorCategories.$inferSelect;
export type ParVendorRating = typeof parVendorRatings.$inferSelect;
export type ParVendorNote = typeof parVendorNotes.$inferSelect;
export type ParVendorOffer = typeof parVendorOffers.$inferSelect;
export type ParVendorDocument = typeof parVendorDocuments.$inferSelect;
