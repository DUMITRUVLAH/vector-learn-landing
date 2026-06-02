import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * CONT-PLATA: counterparties (clients/payers) saved by a tenant, typically
 * pulled from the contafirm.md public registry by IDNO or name. Stored so the
 * user can reuse a client across multiple payment accounts without re-searching.
 */
export const companyClients = pgTable(
  "company_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Fiscal code (IDNO). Nullable — some registry rows have none. */
    idno: varchar("idno", { length: 32 }),
    name: varchar("name", { length: 500 }).notNull(),
    legalForm: varchar("legal_form", { length: 255 }),
    status: varchar("status", { length: 64 }),
    address: varchar("address", { length: 500 }),
    city: varchar("city", { length: 255 }),
    cuatmCode: varchar("cuatm_code", { length: 32 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    /** Raw registry payload at the time of import, for traceability. */
    registrySnapshot: jsonb("registry_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("company_clients_tenant_idx").on(t.tenantId),
    tenantIdnoIdx: index("company_clients_tenant_idno_idx").on(t.tenantId, t.idno),
  })
);

export type CompanyClient = typeof companyClients.$inferSelect;
export type NewCompanyClient = typeof companyClients.$inferInsert;
