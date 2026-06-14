/**
 * EINV-001: FinDesk — e-Factura Moldova (SFS) schema for B2B invoices
 *
 * Tables:
 *   fin_sfs_settings  — per-tenant SFS credentials (AES-256-GCM) + environment
 *   fin_einvoices     — tracking row per fin_invoices submission to SFS
 *
 * Migration: drizzle/0118_fin_einvoices.sql
 *
 * Design decisions:
 * - fin_sfs_settings is separate from tenant_settings to keep FIN module
 *   self-contained and avoid touching the shared tenants/settings tables.
 * - Credentials stored encrypted (server/lib/crypto.ts AES-256-GCM);
 *   never base64 raw (CLAUDE.md §3.5.1).
 * - fin_einvoices links to fin_invoices (once that PR is merged). Until merge,
 *   FK is declared as plain UUID (no Drizzle .references()) — same pattern as
 *   fin_invoices uses for finParties/finAgreements references.
 * - environment: mock = no real HTTP calls; test/prod = real SFS endpoint.
 * - FIN-CORE §1.6: "e-Factura opțional, activabil per tenant, credențiale criptate".
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

// ─── Enums ────────────────────────────────────────────────────────────────────

/** SFS submission environment for fin_sfs_settings. */
export const finSfsEnvEnum = pgEnum("fin_sfs_env", ["mock", "test", "prod"]);

/** Lifecycle status for a SFS e-Factura submission. */
export const finEinvoiceStatusEnum = pgEnum("fin_einvoice_status", [
  "pending",
  "sent",
  "accepted",
  "rejected",
  "cancelled",
]);

// ─── fin_sfs_settings ─────────────────────────────────────────────────────────

/**
 * Per-tenant SFS (SIA e-Factura Moldova) configuration.
 * One row per tenant (unique on tenantId).
 */
export const finSfsSettings = pgTable(
  "fin_sfs_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant that owns these settings. */
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * IDNO-ul companiei furnizor (academia) — 13 numeric chars (Moldova).
     * Used as SupplierInfo/SupplierIdno in the SFS XML.
     */
    idno: varchar("idno", { length: 13 }).notNull(),

    /**
     * Bank account of the supplier (academy).
     * Alphanumeric, up to 34 chars (IBAN or local account).
     */
    bankAccount: varchar("bank_account", { length: 34 }).notNull(),

    /**
     * Which SFS environment to use:
     * - mock: no real HTTP; deterministic mock responses (for local dev / test)
     * - test: https://api-test.fisc.md/Service.svc (SFS sandbox)
     * - prod: https://api.fisc.md/Service.svc (SFS production)
     */
    environment: finSfsEnvEnum("environment").notNull().default("mock"),

    /**
     * SFS API username — encrypted with AES-256-GCM (server/lib/crypto.ts).
     * Format: "iv:tag:ciphertext" (all hex).
     * null = not configured yet.
     */
    usernameEncrypted: text("username_encrypted"),

    /**
     * SFS API password — encrypted with AES-256-GCM (server/lib/crypto.ts).
     * null = not configured yet.
     */
    passwordEncrypted: text("password_encrypted"),

    /**
     * Timestamp of the last successful connectivity test (GET taxpayer info).
     * null = never tested.
     */
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fin_sfs_settings_tenant_idx").on(t.tenantId),
  ]
);

// ─── fin_einvoices ────────────────────────────────────────────────────────────

/**
 * Tracks the SFS submission state for each B2B invoice (fin_invoices).
 * One row per invoice (unique on finInvoiceId).
 *
 * FK to fin_invoices is declared as plain UUID (no Drizzle .references())
 * because fin_invoices lives on feat/FIN-bill (unmerged). The SQL migration
 * declares the FK constraint that will be enforced once both branches merge.
 */
export const finEinvoices = pgTable(
  "fin_einvoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Tenant scope. */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /**
     * The B2B invoice this row tracks.
     * FK → fin_invoices.id (declared in SQL; enforced post-merge).
     */
    finInvoiceId: uuid("fin_invoice_id").notNull(),

    /** Current SFS submission state. */
    sfsStatus: finEinvoiceStatusEnum("sfs_status").notNull().default("pending"),

    /**
     * Serial number assigned by SFS (returned in PostInvoices response).
     * null until first successful submission.
     */
    sfsSerialNumber: varchar("sfs_serial_number", { length: 50 }),

    /**
     * Internal SFS invoice ID (returned in GetInvoiceStatus response).
     * Used for CancelInvoice and GetInvoiceStatus calls.
     */
    sfsInvoiceId: varchar("sfs_invoice_id", { length: 100 }),

    /**
     * Raw Status field from the SFS SOAP response (integer code).
     * See EFACTURA_MD_REQUEST_STATUS: 1=ACCEPTED, 2=SUCCESS, 3=ERROR.
     */
    sfsRequestStatus: integer("sfs_request_status"),

    /** Error message from SFS if the submission failed. */
    sfsErrorMessage: text("sfs_error_message"),

    /** When the invoice was first submitted to SFS. null = not yet submitted. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    /** When the status was last synced from SFS. null = never synced. */
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("fin_einvoices_invoice_unique").on(t.finInvoiceId),
    index("fin_einvoices_tenant_status_idx").on(t.tenantId, t.sfsStatus),
    index("fin_einvoices_invoice_idx").on(t.finInvoiceId),
  ]
);

// ─── TypeScript inference helpers ─────────────────────────────────────────────

export type FinSfsSettings = typeof finSfsSettings.$inferSelect;
export type InsertFinSfsSettings = typeof finSfsSettings.$inferInsert;
export type FinEinvoice = typeof finEinvoices.$inferSelect;
export type InsertFinEinvoice = typeof finEinvoices.$inferInsert;
