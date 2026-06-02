import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
  text,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { companyClients } from "./companyClients";

export const paymentAccountStatusEnum = pgEnum("payment_account_status", [
  "draft",
  "issued",
  "paid",
  "cancelled",
]);

/**
 * CONT-PLATA: a standardized "cont de plată" (B2B payment account / invoice).
 * Seller (issuer) and buyer (payer) identities are snapshotted onto the row so
 * the issued document is immutable even if the linked client/profile later changes.
 * Monetary values are stored in minor units (bani) as integers.
 */
export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => companyClients.id, {
      onDelete: "set null",
    }),

    series: varchar("series", { length: 20 }).notNull().default("CP"),
    /** Sequential number within tenant+series (1, 2, 3, …). Null while draft. */
    number: integer("number"),
    /** Full human-readable number, e.g. "CP-2026-0001". Null while draft. */
    documentNumber: varchar("document_number", { length: 40 }),

    status: paymentAccountStatusEnum("status").notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp("due_date", { withTimezone: true }),

    // --- Seller (beneficiar) snapshot ---
    sellerName: varchar("seller_name", { length: 255 }).notNull(),
    sellerIdno: varchar("seller_idno", { length: 32 }),
    sellerVatCode: varchar("seller_vat_code", { length: 32 }),
    sellerAddress: varchar("seller_address", { length: 500 }),
    sellerIban: varchar("seller_iban", { length: 34 }),
    sellerBankName: varchar("seller_bank_name", { length: 255 }),
    sellerBankCode: varchar("seller_bank_code", { length: 32 }),

    // --- Buyer (plătitor) snapshot ---
    buyerName: varchar("buyer_name", { length: 500 }).notNull(),
    buyerIdno: varchar("buyer_idno", { length: 32 }),
    buyerAddress: varchar("buyer_address", { length: 500 }),
    buyerCity: varchar("buyer_city", { length: 255 }),

    // --- Totals (minor units / bani) ---
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    notes: text("notes"),
    pdfKey: varchar("pdf_key", { length: 500 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("payment_accounts_tenant_idx").on(t.tenantId),
    statusIdx: index("payment_accounts_status_idx").on(t.tenantId, t.status),
    numberIdx: index("payment_accounts_number_idx").on(t.tenantId, t.series, t.number),
    clientIdx: index("payment_accounts_client_idx").on(t.clientId),
  })
);

export type PaymentAccount = typeof paymentAccounts.$inferSelect;
export type NewPaymentAccount = typeof paymentAccounts.$inferInsert;
