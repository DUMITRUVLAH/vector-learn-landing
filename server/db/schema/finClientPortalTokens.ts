/**
 * CLIENTPORTAL-001: Client financial portal — magic-link token access for B2B clients.
 * An admin generates a UUID token for a companyClient or a direct contact (student).
 * The client accesses /portal/client?token=<uuid> without creating an account.
 * Pattern reused from studentPortalTokens (GAP-010).
 */
import {
  pgTable,
  uuid,
  timestamp,
  boolean,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { companyClients } from "./companyClients";
import { students } from "./students";
import { users } from "./users";

export const finClientPortalTokens = pgTable(
  "fin_client_portal_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** B2B company client — one of contactId or companyId must be set */
    companyId: uuid("company_id").references(() => companyClients.id, {
      onDelete: "cascade",
    }),
    /** Direct contact via student record (B2C) */
    contactId: uuid("contact_id").references(() => students.id, {
      onDelete: "cascade",
    }),
    /** The magic-link token — a UUID used as a secure URL param */
    token: uuid("token").defaultRandom().notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    /** Admin user who created this token */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fcpt_tenant_idx").on(t.tenantId),
    tokenIdx: index("fcpt_token_idx").on(t.token),
    companyIdx: index("fcpt_company_idx").on(t.tenantId, t.companyId),
    contactIdx: index("fcpt_contact_idx").on(t.tenantId, t.contactId),
    /** Ensure at least one of companyId or contactId is set */
    atLeastOneParty: check(
      "fcpt_at_least_one_party",
      sql`contact_id IS NOT NULL OR company_id IS NOT NULL`
    ),
  })
);

export type FinClientPortalToken = typeof finClientPortalTokens.$inferSelect;
export type NewFinClientPortalToken = typeof finClientPortalTokens.$inferInsert;
