/**
 * PAR-EFP: e-Factura primită de la prestator (direcția INTRARE).
 *
 * PAR-ul se achită, iar prestatorul — dacă e persoană juridică — trebuie să emită e-Factura în
 * SIA „e-Factura" (SFS). Tabela ține, per cerere, răspunsul la o singură întrebare: „a emis-o sau
 * nu?", plus dovada (seria/numărul găsit) și urma reminderelor trimise solicitantului.
 *
 * De ce tabelă separată și nu coloane pe `par_payments`:
 *   - starea se recalculează periodic (scanare), are propriul jurnal (ultima scanare, mesaj,
 *     sursă) și propriul contor de remindere; nu e un atribut al plății, ci un proces care începe
 *     DUPĂ plată;
 *   - un PAR fără prestator juridic nu are rând deloc (sau are `not_applicable`), deci coada de
 *     urmărire rămâne mică.
 *
 * REUSE: credențialele SFS sunt cele din `fin_sfs_settings` (EINV-001) — un singur cont SFS per
 * workspace. Nu se creează un al doilea sistem de credențiale.
 *
 * Migrare: drizzle/0146_par_einvoices.sql (+ heal în server/db/sync-schema.ts, pentru că prod-ul
 * nu aplică fiabil migrările — vezi CLAUDE.md §3.5.1ter).
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { parRequests } from "./par";

/**
 * Starea urmăririi e-Facturii pentru o cerere plătită:
 *   not_applicable  — beneficiarul e persoană fizică (nu emite e-Factura) sau PAR-ul nu e de tip plată
 *   expected        — o așteptăm; dacă `last_scan_at` e setat, înseamnă „am căutat și NU am găsit-o"
 *   found           — găsită în SFS (seria + numărul sunt completate)
 *   received_manual — marcată manual ca primită (factură pe hârtie / PDF în afara SFS)
 */
export const parEinvoiceStatusEnum = pgEnum("par_einvoice_status", [
  "not_applicable",
  "expected",
  "found",
  "received_manual",
]);

export const parEinvoices = pgTable(
  "par_einvoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Cererea urmărită. Un singur rând per cerere. */
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" })
      .unique(),

    status: parEinvoiceStatusEnum("status").notNull().default("expected"),

    /** Codul fiscal (IDNO) al prestatorului după care s-a căutat — normalizat, doar cifre. */
    supplierIdno: varchar("supplier_idno", { length: 50 }),

    /** Seria + numărul facturii găsite în SFS. Null cât timp nu s-a găsit nimic. */
    sfsSeria: varchar("sfs_seria", { length: 20 }),
    sfsNumber: varchar("sfs_number", { length: 50 }),
    /** InvoiceStatus brut din SFS (7 = Trimis la Cumpărător, 3 = Acceptat …). */
    sfsInvoiceStatus: integer("sfs_invoice_status"),
    /** Data facturii (DeliveryDate din XML-ul SFS). */
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    /** Totalul facturii în unități minore, când a putut fi citit din XML. */
    invoiceTotalCents: integer("invoice_total_cents"),

    /** Ultima scanare: când, pe ce sursă și cu ce rezultat (text pentru om). */
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    /** "sfs" = interogare reală; "mock" = SFS neconfigurat, răspunsuri simulate. */
    lastScanSource: varchar("last_scan_source", { length: 10 }),
    lastScanMessage: text("last_scan_message"),

    /** Remindere trimise solicitantului („cere-i prestatorului factura"). */
    reminderCount: integer("reminder_count").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    lastReminderToEmail: varchar("last_reminder_to_email", { length: 255 }),

    /** Cine a marcat manual factura ca primită (dacă e cazul) + nota lui. */
    markedByUserId: uuid("marked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    markedNote: text("marked_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("par_einvoices_par_unique").on(t.parId),
    index("par_einvoices_tenant_status_idx").on(t.tenantId, t.status),
    index("par_einvoices_par_idx").on(t.parId),
  ]
);

export type ParEinvoice = typeof parEinvoices.$inferSelect;
export type InsertParEinvoice = typeof parEinvoices.$inferInsert;
