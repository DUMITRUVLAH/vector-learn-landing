import { pgTable, uuid, varchar, integer, timestamp, index, text, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/** Clientul salvat într-un șablon — aceleași câmpuri ca pe cont, toate opționale. */
export interface PaymentAccountTemplateBuyer {
  buyerName?: string | null;
  buyerIdno?: string | null;
  buyerVatCode?: string | null;
  buyerAddress?: string | null;
  buyerCity?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyerIban?: string | null;
  buyerBankName?: string | null;
  buyerContact?: string | null;
  crmCompanyId?: string | null;
}

export interface PaymentAccountTemplateItem {
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  productId?: string | null;
}

/**
 * CONTPLATA-faza-1 (0196): șabloanele contului de plată, ca la PAR — „aceeași factură lunară către
 * același client" se pornește dintr-un click, cu număr nou. Clientul e opțional: un șablon poate fi
 * doar un set de servicii („Pachet curs + manual") trimis la clienți diferiți.
 */
export const paymentAccountTemplates = pgTable(
  "payment_account_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    buyer: jsonb("buyer").$type<PaymentAccountTemplateBuyer | null>(),
    items: jsonb("items").$type<PaymentAccountTemplateItem[]>().notNull().default([]),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    notes: text("notes"),
    dueDays: integer("due_days"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("payment_account_templates_tenant_idx").on(t.tenantId),
  })
);

export type PaymentAccountTemplate = typeof paymentAccountTemplates.$inferSelect;
