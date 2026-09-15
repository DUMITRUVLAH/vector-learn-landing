/**
 * Linkul public prin care clientul deschide un act — și semnalul „Vizualizat" pe care îl produce
 * (cerința 42 din caietul de sarcini: „Urmărire: transmisă, vizualizată, acceptată, respinsă").
 *
 * De ce NU un pixel de urmărire în e-mail, cum se face de obicei: pixelul e o imagine de 1×1 pe
 * care Gmail o rutează prin proxy-ul lui, Outlook o blochează implicit, iar jumătate din oameni
 * nu încarcă imaginile deloc. „Vizualizat" ar fi ieșit fals în ambele sensuri — un client care a
 * citit atent oferta apărea ca neinteresat, iar proxy-ul Gmail raporta o vizualizare care nu s-a
 * întâmplat. Un semnal în care nu poți avea încredere e mai rău decât niciun semnal.
 *
 * Aici, actul pleacă la client ca LINK. Când linkul e deschis, actul chiar a fost deschis: e o
 * pagină cerută anume, nu o imagine încărcată automat. În plus, clientul primește actul într-o
 * pagină care arată ca actul, nu un atașament pe care trebuie să-l descarce.
 *
 * Deciziile care se văd în schemă:
 * - **Tokenul e un UUID v4**, nu id-ul actului: 122 de biți de entropie, deci linkul nu se
 *   ghicește și nu se poate număra de la un act la altul.
 * - **Se poate revoca și poate expira.** O ofertă trimisă greșit se închide fără să atingi actul.
 * - **Se numără toate deschiderile, dar prima are coloana ei.** „Când a văzut-o prima oară" e
 *   întrebarea comercială; restul sunt context.
 * - **Nu se rețin IP-uri sau agenți de browser.** Pentru „a văzut / n-a văzut" nu sunt necesare,
 *   iar datele pe care nu le strângi nu se pot scurge.
 *
 * Migrare: drizzle/0176_doc_share_links.sql
 */
import { pgTable, uuid, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { docDocuments } from "./docs";

export const docShareLinks = pgTable(
  "doc_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => docDocuments.id, { onDelete: "cascade" }),
    /** Partea secretă a adresei. Unic global — după el se caută, fără să se știe tenantul. */
    token: uuid("token").notNull().defaultRandom().unique(),
    /** Null = nu expiră. O ofertă are termen de valabilitate; linkul poate să-l urmeze. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Nenul = linkul e închis, indiferent de expirare. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Momentul comercial: când a deschis clientul actul, prima oară. */
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("doc_share_links_tenant_idx").on(t.tenantId),
    // Un act are un singur link activ: două linkuri ar însemna două răspunsuri la „a văzut-o?".
    uniqueIndex("doc_share_links_document_uniq").on(t.documentId),
    index("doc_share_links_token_idx").on(t.token),
  ]
);

export type DocShareLink = typeof docShareLinks.$inferSelect;
export type NewDocShareLink = typeof docShareLinks.$inferInsert;
