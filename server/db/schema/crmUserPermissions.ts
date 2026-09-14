/**
 * CRM — drepturi pe OM, peste cele ale rolului (cerința 60 din caietul de sarcini: „drepturi de
 * acces diferențiate, configurabile per rol/utilizator").
 *
 * Matricea pe roluri (`server/lib/crm/permissions.ts`) rămâne temelia și rămâne COD: e ce
 * garantează că un rol nou nu primește din greșeală drepturi. Tabela asta e excepția, ca DATE:
 * „Maria e agent, dar ea administrează produsele", fără să faci pe toți agenții administratori.
 *
 * Două feluri de excepție, nu unul: `granted` adaugă un drept, `revoked` îl scoate. Fără al
 * doilea, singurul mod de a lua un drept cuiva ar fi să-i schimbi rolul — adică să-i iei și
 * restul.
 *
 * Migrare: drizzle/0174_crm_user_permissions.sql
 */
import { pgTable, uuid, varchar, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const crmUserPermissions = pgTable(
  "crm_user_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Cheia din `CrmPermission` (ex. „products.manage"). */
    permission: varchar("permission", { length: 64 }).notNull(),
    /** `true` = acordat peste rol; `false` = retras, chiar dacă rolul îl are. */
    granted: boolean("granted").notNull().default(true),
    /** Cine a hotărât — un drept dat „de cineva, cândva" nu se poate pune la îndoială. */
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_user_perms_tenant_idx").on(t.tenantId, t.userId),
    // Un singur verdict per (om, drept): altfel „acordat" și „retras" ar coexista, iar ordinea
    // citirii ar decide cine ce poate.
    unique("crm_user_perms_uniq").on(t.userId, t.permission),
  ]
);

export type CrmUserPermission = typeof crmUserPermissions.$inferSelect;
export type NewCrmUserPermission = typeof crmUserPermissions.$inferInsert;
