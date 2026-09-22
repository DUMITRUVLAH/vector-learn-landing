/**
 * PAR-EFP: copia locală a facturilor primite în SIA „e-Factura" (SFS).
 *
 * De ce există tabela — problema pe care o rezolvă:
 *   Ecranul „Toate e-Facturile" cerea, la FIECARE deschidere, întreg istoricul de la SFS: patru
 *   liste + paginile de arhivă + XML/QR pe loturi de 20. Pe un cont cu 543 de facturi asta însemna
 *   ~40 de apeluri SOAP într-o singură cerere HTTP, tăiată de plafonul de timp al serverului — de
 *   unde mesajul „am citit detaliile doar pentru primele 200 din 543". Restul nu se citeau NICIODATĂ,
 *   pentru că runda următoare o lua tot de la capăt. O organizație cu zece mii de facturi în istoric
 *   nu putea fi citită deloc.
 *
 *   Acum citirea din SFS se face O SINGURĂ DATĂ per factură, în loturi mici, iar rezultatul se
 *   păstrează aici. Ecranul citește din baza locală (instant, sortabil, filtrabil pe perioadă și
 *   furnizor), iar sincronizarea aduce doar ce lipsește.
 *
 * Ce NU e tabela asta: nu e o a doua sursă de adevăr. SFS rămâne sursa; aici e o copie cu data
 * citirii lângă ea, ca să se vadă cât de proaspătă e.
 *
 * Migrare: drizzle/0186_par_sfs_invoice_cache.sql (+ heal în server/db/sync-schema.ts, pentru că
 * prod-ul nu aplică fiabil migrările — CLAUDE.md §3.5.1ter).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const parSfsInvoices = pgTable(
  "par_sfs_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Identitatea facturii în SFS. Seria + numărul sunt unice per organizație. */
    seria: varchar("seria", { length: 20 }).notNull(),
    number: varchar("number", { length: 50 }).notNull(),

    /** InvoiceStatus brut din SFS (3 = Acceptat, 6 = Arhivat, 7 = Trimis la Cumpărător…). */
    invoiceStatus: integer("invoice_status").notNull().default(0),

    /** Datele din conținutul facturii — completate abia după ce se citesc detaliile. */
    supplierIdno: varchar("supplier_idno", { length: 50 }),
    supplierName: varchar("supplier_name", { length: 300 }),
    buyerIdno: varchar("buyer_idno", { length: 50 }),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    totalCents: integer("total_cents"),
    /** Linkul din codul QR către portalul SFS (nu funcționează în afara sesiunii lor, dar e dovada). */
    portalUrl: text("portal_url"),

    /**
     * Când au fost citite detaliile (XML sau QR). NULL = știm doar că factura există (antetul din
     * listă), fără furnizor/dată/sumă — exact rândurile pe care sincronizarea le mai are de luat.
     */
    detailsFetchedAt: timestamp("details_fetched_at", { withTimezone: true }),
    /**
     * Câte încercări de citire a detaliilor au eșuat. SFS nu dă conținut pentru orice factură
     * (drepturi, documente vechi); fără plafon, sincronizarea ar relua la nesfârșit aceleași
     * facturi și n-ar ajunge niciodată la restul.
     */
    detailAttempts: integer("detail_attempts").notNull().default(0),

    /** Prima/ultima dată când factura a apărut într-o listă SFS. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("par_sfs_invoices_tenant_key_uniq").on(t.tenantId, t.seria, t.number),
    index("par_sfs_invoices_tenant_date_idx").on(t.tenantId, t.invoiceDate),
    index("par_sfs_invoices_tenant_supplier_idx").on(t.tenantId, t.supplierIdno),
    // Coada de detalii de citit: „ce mai am de luat pentru workspace-ul ăsta".
    index("par_sfs_invoices_pending_idx").on(t.tenantId, t.detailsFetchedAt),
  ]
);

/**
 * Unde a ajuns sincronizarea, per organizație.
 *
 * Fără cursor, fiecare rulare ar relua arhiva de la zero — adică exact risipa pe care tabela de mai
 * sus o elimină. `archiveCursorTo` merge înapoi în timp, fereastră cu fereastră, până la
 * `archiveDoneAt`; după aceea se cer doar facturile recente.
 */
export const parSfsSyncState = pgTable("par_sfs_sync_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),

  /** Ultima citire a listelor „vii" (de semnat / acceptate / respinse). */
  headsSyncedAt: timestamp("heads_synced_at", { withTimezone: true }),
  /** Capătul ferestrei de arhivă care urmează să fie citită (se deplasează spre trecut). */
  archiveCursorTo: timestamp("archive_cursor_to", { withTimezone: true }),
  /** Când s-a terminat parcurgerea întregului istoric. NULL = încă se recuperează trecutul. */
  archiveDoneAt: timestamp("archive_done_at", { withTimezone: true }),

  /** Ultimul lot: când a rulat, ce a făcut și ce a eșuat (text pentru om). */
  lastBatchAt: timestamp("last_batch_at", { withTimezone: true }),
  lastMessage: text("last_message"),
  lastError: text("last_error"),
  /**
   * Zăvor simplu: cât timp e setat (și recent), un al doilea tab deschis nu mai pornește o
   * sincronizare paralelă. SFS-ul real răspunde cu 500 la rafale de cereri — două taburi care trag
   * simultan ar bloca contul pentru minute întregi.
   */
  runningSince: timestamp("running_since", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ParSfsInvoice = typeof parSfsInvoices.$inferSelect;
export type InsertParSfsInvoice = typeof parSfsInvoices.$inferInsert;
export type ParSfsSyncState = typeof parSfsSyncState.$inferSelect;
