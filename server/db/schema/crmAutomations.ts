/**
 * CRM — automatizări și distribuirea lead-urilor.
 *
 * Portat din crm-vector (`automations.ts` + `assignment.ts`), cu o schimbare de
 * fond: acolo exista o tabelă separată de „membri de vânzări", fiindcă
 * `assigned_to` era text liber. Aici oamenii EXISTĂ deja — sunt `users` ai
 * workspace-ului. Un al doilea registru de persoane ar fi însemnat două liste
 * care se desincronizează: cineva pleacă din firmă, dispare din `users`, dar
 * rămâne în roster și continuă să primească lead-uri.
 *
 * Deci `crm_sales_settings` NU e un roster: e un rând de SETĂRI atașat unui user
 * existent (câte lead-uri pe zi duce, ce greutate are la împărțire, ce regiuni
 * acoperă). Fără rând = setările implicite. Cu userul șters = setările dispar
 * odată cu el (cascade).
 *
 * Migrare: drizzle/0165_crm_automations.sql
 */
import { pgTable, uuid, varchar, boolean, integer, jsonb, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { leads } from "./leads";

/** Ce declanșează o automatizare. `toStage` doar pentru „lead.stage_changed". */
// Formele trăiesc în motorul pur; schema doar le refolosește, ca să nu existe două definiții.
import type { AutomationTrigger, AutomationCondition, AutomationAction } from "../../lib/crm/automations";
export type { AutomationTrigger, AutomationCondition, AutomationAction };

export const crmAutomations = pgTable(
  "crm_automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    trigger: jsonb("trigger").$type<AutomationTrigger>().notNull(),
    /** Toate trebuie să treacă (ȘI). Listă goală = se aplică întotdeauna. */
    conditions: jsonb("conditions").$type<AutomationCondition[]>().notNull().default([]),
    actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
    orderIndex: integer("order_index").notNull().default(0),
    /**
     * Din ce scenariu gata făcut a pornit regula (CRM-A02). Așa pagina știe că scenariul „Sună
     * lead-ul nou" e deja pornit și nu-l mai propune a doua oară. Gol = regulă scrisă de mână.
     * Migrare: drizzle/0191_crm_automation_templates.sql
     */
    templateKey: varchar("template_key", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_automations_tenant_idx").on(t.tenantId, t.orderIndex)]
);

export type CrmAutomation = typeof crmAutomations.$inferSelect;

/**
 * Ce a făcut fiecare automatizare, pe ce lead. Fără jurnal, o regulă greșită e
 * imposibil de explicat: lead-urile se mișcă singure și nimeni nu știe de ce.
 */
export const crmAutomationRuns = pgTable(
  "crm_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").references(() => crmAutomations.id, { onDelete: "set null" }),
    automationName: varchar("automation_name", { length: 200 }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    triggerKind: varchar("trigger_kind", { length: 40 }).notNull(),
    /** Ce s-a executat efectiv, în ordine, cu rezultatul fiecărei acțiuni. */
    actions: jsonb("actions").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("ok"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_automation_runs_tenant_idx").on(t.tenantId, t.createdAt),
    index("crm_automation_runs_lead_idx").on(t.leadId),
  ]
);

export type CrmAutomationRun = typeof crmAutomationRuns.$inferSelect;

// ─── Distribuirea lead-urilor ────────────────────────────────────────────────

export const crmAssignmentRules = pgTable(
  "crm_assignment_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** round_robin | territory | capacity | weighted | fixed */
    strategy: varchar("strategy", { length: 20 }).notNull().default("round_robin"),
    /** Aceeași formă ca la automatizări — reutilizăm evaluatorul de condiții. */
    conditions: jsonb("conditions").$type<AutomationCondition[]>().notNull().default([]),
    /** Cine intră în tragere. Listă goală = toți agenții activi ai workspace-ului. */
    userIds: jsonb("user_ids").$type<string[]>().notNull().default([]),
    orderIndex: integer("order_index").notNull().default(0),
    /** Scenariul gata făcut din care a pornit regula — vezi `crmAutomations.templateKey`. */
    templateKey: varchar("template_key", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_assignment_rules_tenant_idx").on(t.tenantId, t.orderIndex)]
);

export type CrmAssignmentRule = typeof crmAssignmentRules.$inferSelect;

/**
 * Setările de vânzări ale unui om. NU un roster paralel — vezi antetul
 * fișierului. Lipsa rândului înseamnă „setările implicite", nu „nu există".
 */
export const crmSalesSettings = pgTable(
  "crm_sales_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Scos din tragere fără a-i lua contul — pleacă în concediu, revine. */
    isActive: boolean("is_active").notNull().default(true),
    dailyCapacity: integer("daily_capacity").notNull().default(20),
    weight: integer("weight").notNull().default(1),
    regions: jsonb("regions").$type<string[]>().notNull().default([]),
    industries: jsonb("industries").$type<string[]>().notNull().default([]),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_sales_settings_tenant_idx").on(t.tenantId, t.orderIndex),
    // Un om are un singur rând de setări per workspace.
    uniqueIndex("crm_sales_settings_user_uniq").on(t.tenantId, t.userId),
  ]
);

export type CrmSalesSettings = typeof crmSalesSettings.$inferSelect;

/**
 * Cine a primit ce și DE CE. Rândul ăsta e singurul răspuns la „de ce mi-a venit
 * mie lead-ul ăsta" — întrebare care apare în orice echipă de vânzări în prima
 * săptămână de la pornirea distribuirii automate.
 */
export const crmAssignmentLog = pgTable(
  "crm_assignment_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    ruleId: uuid("rule_id").references(() => crmAssignmentRules.id, { onDelete: "set null" }),
    strategy: varchar("strategy", { length: 20 }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_assignment_log_tenant_idx").on(t.tenantId, t.createdAt),
    index("crm_assignment_log_lead_idx").on(t.leadId),
  ]
);

export type CrmAssignmentLogEntry = typeof crmAssignmentLog.$inferSelect;
