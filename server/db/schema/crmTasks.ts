/**
 * CRM — taskuri pe lead, etichete și motive de pierdere configurabile.
 *
 * Portate din crm-vector (`src/lib/crm/{tasks,tags,lostReasons}.ts`). Diferența
 * față de sursă: acolo baza e single-tenant, aici fiecare rând aparține unui
 * workspace și FIECARE query trebuie filtrat — nu există RLS care să prindă o
 * scăpare.
 *
 * `lead_tags` și `lead_contacts` există deja în `leads.ts` (rămase din CRM-ul
 * vechi al repo-ului); nu le redefinim aici, ca să nu avem două surse de adevăr.
 *
 * Migrare: drizzle/0163_crm_tasks.sql
 */
import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { users } from "./users";

export const crmLeadTasks = pgTable(
  "crm_lead_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** open | done | snoozed — varchar, nu enum: stările pot crește fără migrare. */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_tasks_tenant_idx").on(t.tenantId),
    index("crm_tasks_lead_idx").on(t.leadId),
    // Lista „de azi" caută taskuri deschise, scadente — indexul o servește direct.
    index("crm_tasks_due_idx").on(t.tenantId, t.status, t.dueAt),
  ]
);

export type CrmLeadTask = typeof crmLeadTasks.$inferSelect;
export type NewCrmLeadTask = typeof crmLeadTasks.$inferInsert;

/**
 * Motivele de pierdere, configurabile per workspace. În crm-vector sunt o tabelă
 * separată tocmai ca raportarea „de ce pierdem" să grupeze pe valori stabile, nu
 * pe text liber scris diferit de fiecare agent.
 */
export const crmLostReasons = pgTable(
  "crm_lost_reasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 200 }).notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_lost_reasons_tenant_idx").on(t.tenantId, t.orderIndex)]
);

export type CrmLostReason = typeof crmLostReasons.$inferSelect;
