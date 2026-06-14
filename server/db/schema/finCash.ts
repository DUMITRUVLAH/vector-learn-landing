/**
 * CASH-001: FinDesk — Încasări și reconciliere bancară
 *
 * Tables:
 *   fin_bank_transactions  — tranzacții importate din extras bancar
 *   fin_payments           — plăți primite de la parteneri
 *   fin_payment_allocations — legătura plată ↔ factură (alocare)
 *
 * Migration: drizzle/0120_fin_cash.sql
 *
 * Design decisions:
 * - FIN-CORE §1.9: CASH module — plăți + reconciliere bancară.
 * - fin_bank_transactions: rânduri importate din CSV/MT940. O tranzacție poate
 *   fi: unmatched (nou importat), matched (legat la o plată/factură), duplicate,
 *   sau ignored (mișcare internă / fals pozitiv).
 * - fin_payments: plata primită efectiv de la un partener (party_id → fin_parties).
 *   `allocated_cents` este suma totală alocată la facturi; creditul nealocat =
 *   amount_cents − allocated_cents (calculat, nu stocat).
 * - fin_payment_allocations: legătura M:N plată ↔ factură cu valoare parțială.
 *   Un plată poate acoperi mai multe facturi, o factură poate fi acoperită parțial
 *   de mai multe plăți.
 * - Banii: ÎNTOTDEAUNA în cenți (integer) + currency text. (FIN-CORE regula #10.)
 * - FK-urile externe (fin_parties, fin_invoices) sunt declarate ca UUID simple
 *   (fără Drizzle .references()) pe această ramură, deoarece acele tabele sunt pe
 *   ramuri nemergate. FK real în migration SQL.
 * - Tenant isolation: TOATE interogările filtrează explicit după tenant_id.
 * - Portabilitate PGlite↔Postgres: folosiți db.query.X.findMany() (nu raw execute).
 *
 * Reuse:
 * - `tenants` table FK (cascadă delete).
 * - Pattern multi-tenant de la server/routes/invoices.ts.
 * - Nu recrează tabele existente (payments, paymentAccounts — context B2C/CRM).
 *   Acestea sunt FIN-specific: fin_bank_transactions, fin_payments, fin_payment_allocations.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Direcția tranzacției bancare: intrare (credit) sau ieșire (debit). */
export const finTxDirectionEnum = pgEnum("fin_tx_direction", ["in", "out"]);

/** Statusul reconcilierii unei tranzacții bancare. */
export const finTxMatchStatusEnum = pgEnum("fin_tx_match_status", [
  "unmatched",  // importat, nicio potrivire
  "matched",    // potrivit cu o plată/factură
  "duplicate",  // tranzacție duplicat (aceeași tripletă date+sumă+ref)
  "ignored",    // ignorat manual (mișcare internă, etc.)
]);

// ─── fin_bank_transactions ────────────────────────────────────────────────────

/**
 * Tranzacții importate din extrase bancare (CSV sau MT940).
 *
 * Fiecare import creează un `import_batch_id` comun (UUID generat la import).
 * Duplicate detection: combinația (tenant_id, account_label, tx_date, amount_cents, reference)
 * nu trebuie să fie unică la nivel DB (bank-ul poate re-exporta aceeași perioadă),
 * dar CASH-002 marchează duplicatele în `match_status`.
 */
export const finBankTransactions = pgTable(
  "fin_bank_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține tranzacția. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Eticheta contului bancar (ex. "MAIB MDL", "Mobiasbanca EUR"). */
    accountLabel: varchar("account_label", { length: 200 }).notNull(),

    /** Data valută a tranzacției. */
    txDate: date("tx_date").notNull(),

    /** Suma tranzacției în cenți (pozitivă indiferent de direcție). */
    amountCents: integer("amount_cents").notNull(),

    /** Valuta tranzacției (ISO 4217: MDL, EUR, USD). */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /**
     * Referința tranzacției (ex. nr. factură, ordin de plată).
     * Folosit în motorul de reconciliere pentru potrivire substring.
     */
    reference: varchar("reference", { length: 500 }),

    /** Contrapartea tranzacției (ex. "Lidl SRL", "MAIB"). */
    counterparty: varchar("counterparty", { length: 500 }),

    /** Direcția: `in` = credit (bani primiți), `out` = debit (bani trimiși). */
    direction: finTxDirectionEnum("direction").notNull(),

    /**
     * UUID generat la import — leagă toate tranzacțiile dintr-un același upload.
     * Permite undo per batch (delete by import_batch_id).
     */
    importBatchId: uuid("import_batch_id").notNull(),

    /** Statusul reconcilierii cu plățile/facturile din sistem. */
    matchStatus: finTxMatchStatusEnum("match_status").notNull().default("unmatched"),

    /**
     * Scorul de potrivire calculat de motorul de reconciliere [0..1].
     * 1.0 = potrivire exactă (sumă + dată + referință).
     * 0 = fără potrivire.
     * Stocat ca integer în basis points (10000 = 1.0) pentru compatibilitate PGlite.
     */
    matchScoreBp: integer("match_score_bp").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_bank_tx_tenant_idx").on(t.tenantId),
    index("fin_bank_tx_tenant_status_idx").on(t.tenantId, t.matchStatus),
    index("fin_bank_tx_batch_idx").on(t.importBatchId),
    index("fin_bank_tx_date_idx").on(t.tenantId, t.txDate),
  ]
);

// ─── fin_payments ─────────────────────────────────────────────────────────────

/**
 * Plăți primite de la parteneri (AR — accounts receivable).
 *
 * Credit nealocat = amount_cents − allocated_cents (derivat, nu stocat).
 * Când allocated_cents == amount_cents → plata e complet alocată.
 *
 * FK → fin_parties.id: nullable UUID (fără Drizzle .references() — tabelul e
 * pe ramura nemergatë feat/FIN-party). FK real în 0120_fin_cash.sql.
 */
export const finPayments = pgTable(
  "fin_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține plata. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Partenerul care a plătit (fin_parties.id).
     * Nullable: plată neidentificată până la alocare manuală.
     */
    partyId: uuid("party_id"),

    /** Data la care plata a fost primită (data valutei). */
    receivedDate: date("received_date").notNull(),

    /** Suma plătii în cenți. */
    amountCents: integer("amount_cents").notNull(),

    /** Valuta plătii (ISO 4217). */
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),

    /** Contul bancar pe care a fost primită plata. */
    accountLabel: varchar("account_label", { length: 200 }),

    /**
     * Suma deja alocată la facturi (Σ fin_payment_allocations.amount_cents).
     * Actualizat la fiecare alocare. Credit nealocat = amountCents − allocatedCents.
     */
    allocatedCents: integer("allocated_cents").notNull().default(0),

    /**
     * Tranzacția bancară de origine (fin_bank_transactions.id).
     * Nullable: plata poate fi înregistrată manual fără import bancar.
     */
    bankTxId: uuid("bank_tx_id"),

    /** Note opționale (ex. referința plătitorului). */
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_payments_tenant_idx").on(t.tenantId),
    index("fin_payments_party_idx").on(t.tenantId, t.partyId),
    index("fin_payments_date_idx").on(t.tenantId, t.receivedDate),
    index("fin_payments_bank_tx_idx").on(t.bankTxId),
  ]
);

// ─── fin_payment_allocations ──────────────────────────────────────────────────

/**
 * Alocarea parțială a unei plăți la una sau mai multe facturi.
 *
 * Structură M:N: o plată → mai multe facturi; o factură → mai multe plăți.
 * Suma totală alocată ≤ plată.amount_cents (nu poate aloca mai mult decât plata).
 * Suma alocată pe factură ≤ factură.total_cents (nu poate aloca mai mult decât factura).
 *
 * FK → fin_invoices.id: nullable UUID (fără Drizzle .references() — tabelul e
 * pe ramura nemergatë feat/FIN-bill). FK real în 0120_fin_cash.sql.
 */
export const finPaymentAllocations = pgTable(
  "fin_payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant care deține alocarea (siguranță tenant isolation). */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * Plata sursă (fin_payments.id).
     * FK declarat cu .references() local deoarece fin_payments e pe ACELAȘI branch.
     */
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => finPayments.id, { onDelete: "cascade" }),

    /**
     * Factura alocată (fin_invoices.id).
     * UUID simplu fără Drizzle ref — fin_invoices e pe ramura nemergatë.
     */
    invoiceId: uuid("invoice_id").notNull(),

    /** Suma alocată din această plată la această factură (cenți). */
    amountCents: integer("amount_cents").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_pay_alloc_tenant_idx").on(t.tenantId),
    index("fin_pay_alloc_payment_idx").on(t.paymentId),
    index("fin_pay_alloc_invoice_idx").on(t.invoiceId),
  ]
);

// ─── TypeScript inference types ───────────────────────────────────────────────

export type FinBankTransaction = typeof finBankTransactions.$inferSelect;
export type InsertFinBankTransaction = typeof finBankTransactions.$inferInsert;
export type FinTxDirection = typeof finTxDirectionEnum.enumValues[number];
export type FinTxMatchStatus = typeof finTxMatchStatusEnum.enumValues[number];

export type FinPayment = typeof finPayments.$inferSelect;
export type InsertFinPayment = typeof finPayments.$inferInsert;

export type FinPaymentAllocation = typeof finPaymentAllocations.$inferSelect;
export type InsertFinPaymentAllocation = typeof finPaymentAllocations.$inferInsert;

// ─── Match status labels (Romanian) ──────────────────────────────────────────

export const FIN_TX_MATCH_STATUS_LABELS: Record<FinTxMatchStatus, string> = {
  unmatched: "Nereconsiliat",
  matched: "Reconsiliat",
  duplicate: "Duplicat",
  ignored: "Ignorat",
};
