import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { paymentAccounts } from "./paymentAccounts";

/**
 * CONT-PLATA: a single line on a payment account (product/service row).
 * `quantity` is a decimal (e.g. 2.5 hours); `unitPriceCents` and the line totals
 * are integers in minor units (bani). Line totals are computed server-side so the
 * stored document always foots.
 */
export const paymentAccountItems = pgTable(
  "payment_account_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => paymentAccounts.id, { onDelete: "cascade" }),
    /** Display order on the document (0-based). */
    position: integer("position").notNull().default(0),
    description: varchar("description", { length: 500 }).notNull(),
    /** Unit of measure, e.g. "buc", "oră", "lună". */
    unit: varchar("unit", { length: 32 }).notNull().default("buc"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    /** VAT rate as a whole percent for this line, e.g. 20. */
    vatRate: integer("vat_rate").notNull().default(20),
    lineSubtotalCents: integer("line_subtotal_cents").notNull().default(0),
    lineVatCents: integer("line_vat_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountIdx: index("payment_account_items_account_idx").on(t.accountId),
  })
);

export type PaymentAccountItem = typeof paymentAccountItems.$inferSelect;
export type NewPaymentAccountItem = typeof paymentAccountItems.$inferInsert;
