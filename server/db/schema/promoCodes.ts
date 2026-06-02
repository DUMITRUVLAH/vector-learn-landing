import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// COURSE-203: discount type
export const discountTypeEnum = pgEnum("discount_type", ["percent", "fixed"]);

// COURSE-203: promo code status (computed, but stored for quick queries)
export const promoStatusEnum = pgEnum("promo_status", [
  "active",
  "expired",
  "exhausted",
  "disabled",
]);

/**
 * COURSE-203: Promotional discount codes.
 * code is unique per tenant.
 * discount_type "percent" = 1-100%; "fixed" = positive integer cents.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: integer("discount_value").notNull(), // percent: 1-100; fixed: cents > 0
    maxUses: integer("max_uses"), // null = unlimited
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = no expiry
    status: promoStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("pc_tenant_idx").on(t.tenantId),
    // Unique code per tenant
    tenantCodeIdx: index("pc_tenant_code_idx").on(t.tenantId, t.code),
  })
);

export type PromoCode = typeof promoCodes.$inferSelect;
export type NewPromoCode = typeof promoCodes.$inferInsert;
