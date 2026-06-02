/**
 * PAY-008: Accounting mappings — per-tenant config for transaction → account code mapping.
 * Used when generating SAGA/1C CSV exports.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const accountingTransactionTypeEnum = pgEnum("accounting_transaction_type", [
  "payment",
  "refund",
  "payout",
]);

export const accountingMappings = pgTable(
  "accounting_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Transaction type: payment (client pays), refund (money back), payout (salary/expense) */
    transactionType: accountingTransactionTypeEnum("transaction_type").notNull(),
    /** SAGA/1C account code, e.g. "704", "462", "421" */
    accountCode: varchar("account_code", { length: 30 }).notNull(),
    /**
     * Description template — can contain {description}, {partner}, {document} placeholders.
     * e.g. "Taxă curs — {description}"
     */
    descriptionTemplate: text("description_template").notNull().default("{description}"),
    /** Whether this mapping is the default for new tenants */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("accounting_mappings_tenant_idx").on(t.tenantId),
    typeIdx: index("accounting_mappings_type_idx").on(t.tenantId, t.transactionType),
  })
);

export type AccountingMapping = typeof accountingMappings.$inferSelect;
export type NewAccountingMapping = typeof accountingMappings.$inferInsert;
