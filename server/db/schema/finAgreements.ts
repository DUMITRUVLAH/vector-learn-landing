/**
 * AGREEMENT-001: FinDesk — Contracte comerciale
 * Tables: fin_agreements, fin_agreement_services
 * Migration: drizzle/0116_fin_agreements.sql
 *
 * Design decisions:
 * - fin_agreements: tenant-scoped; partyId FK to fin_parties (nullable: set null on delete)
 * - fin_agreement_services: line items per contract; billing_type distinguishes recurring vs one_time
 * - next_bill_date: the date billing engine will generate the next invoice for a recurring service
 * - unit_price_cents: integer in smallest currency unit (avoid float rounding)
 * - vat_pct: integer percentage (e.g. 20 = 20% VAT), computed on invoice generation
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  char,
  text,
  boolean,
  integer,
  index,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Lifecycle status of a contract */
export const finAgreementStatusEnum = pgEnum("fin_agreement_status", [
  "draft",
  "active",
  "paused",
  "cancelled",
]);

/** Whether a service line is billed on a schedule or once */
export const finBillingTypeEnum = pgEnum("fin_billing_type", [
  "recurring",
  "one_time",
]);

/** Recurrence period for recurring services */
export const finRecurrencePeriodEnum = pgEnum("fin_recurrence_period", [
  "monthly",
  "quarterly",
  "yearly",
]);

// ─── fin_agreements ───────────────────────────────────────────────────────────

/**
 * A commercial agreement (contract) between the tenant and a business partner.
 * Acts as the billing master: invoices (fin_invoices) are generated from active agreements.
 */
export const finAgreements = pgTable(
  "fin_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Academy/company that owns this contract */
    tenantId: uuid("tenant_id").notNull(),
    /**
     * The partner this contract is with (fin_parties.id).
     * Nullable + set null on delete: contracts survive partner archival.
     */
    partyId: uuid("party_id"),
    /** Human-readable contract title / reference number */
    title: text("title").notNull(),
    /** Contract lifecycle state */
    status: finAgreementStatusEnum("status").notNull().default("draft"),
    /** Date the contract becomes / became effective */
    startDate: date("start_date"),
    /** Date the contract expires (null = indefinite) */
    endDate: date("end_date"),
    /** ISO 4217 currency code for all services in this contract (e.g. MDL, RON, EUR) */
    currency: char("currency", { length: 3 }).notNull().default("MDL"),
    notes: text("notes"),
    /**
     * AUTOBILL: when true, the daily recurring-billing cron auto-generates the invoice for due
     * services on this contract, submits it to SFS e-Factura, AND emails the PDF to the client —
     * with zero manual clicks. Requires the linked party to have an IDNO (e-Factura buyer) and an
     * email (PDF delivery); the cron skips-with-reason when either is missing. Default off so
     * nothing bills automatically until the owner opts a contract in.
     */
    autoBilling: boolean("auto_billing").notNull().default(false),
    /** AUTOBILL: last time the cron processed this contract (for the UI + audit). */
    autoBilledAt: timestamp("auto_billed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fin_agreements_tenant_idx").on(t.tenantId),
    partyIdx: index("fin_agreements_party_idx").on(t.tenantId, t.partyId),
  })
);

// ─── fin_agreement_services ───────────────────────────────────────────────────

/**
 * A service line within a contract. Each line can be billed independently:
 * - recurring: billed periodically (monthly/quarterly/yearly); next_bill_date drives the schedule
 * - one_time:  billed once (e.g. setup fee); last_billed_at prevents double-billing
 */
export const finAgreementServices = pgTable(
  "fin_agreement_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** References fin_agreements.id; cascade-delete when agreement is removed */
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => finAgreements.id, { onDelete: "cascade" }),
    /** Short name of the service / product */
    name: text("name").notNull(),
    /** Optional longer description */
    description: text("description"),
    /** Whether this line recurs or is billed once */
    billingType: finBillingTypeEnum("billing_type").notNull(),
    /** Unit price in smallest currency unit (cents / bani) */
    unitPriceCents: integer("unit_price_cents").notNull(),
    /** Number of units (default 1) */
    quantity: integer("quantity").notNull().default(1),
    /** VAT percentage as integer (e.g. 20 = 20%); 0 = VAT-exempt */
    vatPct: integer("vat_pct").notNull().default(0),
    /** Recurrence schedule; null when billing_type = 'one_time' */
    recurrencePeriod: finRecurrencePeriodEnum("recurrence_period"),
    /** Next date the billing engine should generate an invoice for this line */
    nextBillDate: date("next_bill_date"),
    /** When billing was last triggered for this line (idempotency guard) */
    lastBilledAt: timestamp("last_billed_at", { withTimezone: true }),
    /** Soft-disable a line without removing the contract */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agreementIdx: index("fin_agreement_services_agreement_idx").on(t.agreementId),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finAgreementsRelations = relations(finAgreements, ({ many }) => ({
  services: many(finAgreementServices),
}));

export const finAgreementServicesRelations = relations(finAgreementServices, ({ one }) => ({
  agreement: one(finAgreements, {
    fields: [finAgreementServices.agreementId],
    references: [finAgreements.id],
  }),
}));
