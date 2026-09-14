/**
 * CRM Faza 9 — cadențe (secvențe de urmărire) și reactivarea clienților pierduți.
 *
 * Portare din crm-vector (`cadences.ts` + `reengagement.ts`). O cadență e o listă de pași cu
 * nume: „ziua 0 — sună", „ziua 3 — trimite oferta", „ziua 7 — reamintește". Un lead se înscrie,
 * iar un cron zilnic aplică pasul scadent și îl reprogramează pe următorul.
 *
 * Reactivarea are nevoie de un declanșator PE TIMP („au trecut 6 luni de la pierdere"), care nu
 * există în motorul de automatizări (acela are doar `lead.created` și `lead.stage_changed`) —
 * de-aici tabelele separate. Livrarea pentru acțiunea „înscrie în cadență" refolosește însă
 * cadențele: motorul lor de pași e deja scris și testat.
 *
 * Migrare: drizzle/0169_crm_cadences.sql
 */
import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

/** Ce face un pas de cadență: creează un task sau scrie o notă pe lead. */
export type CrmCadenceStepAction = "task" | "note";

export interface CrmCadenceStep {
  /** Zile după înscriere (primul pas) sau după pasul precedent. */
  dayOffset: number;
  action: CrmCadenceStepAction;
  title: string;
}

export const crmCadences = pgTable(
  "crm_cadences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** Etapa care înscrie automat leadul (opțional). `null` = doar înscriere manuală. */
    triggerStage: varchar("trigger_stage", { length: 64 }),
    enabled: boolean("enabled").notNull().default(true),
    steps: jsonb("steps").$type<CrmCadenceStep[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_cadences_tenant_idx").on(t.tenantId)]
);

export const crmCadenceEnrollments = pgTable(
  "crm_cadence_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    cadenceId: uuid("cadence_id")
      .notNull()
      .references(() => crmCadences.id, { onDelete: "cascade" }),
    /** active | done | cancelled */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    currentStep: integer("current_step").notNull().default(0),
    /** Când trebuie aplicat pasul curent. `null` = nimic de făcut (done/cancelled). */
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_enrollments_lead_idx").on(t.leadId),
    // Cronul caută exact „active + scadent": indexul e pe ce se filtrează, nu pe ce se afișează.
    index("crm_enrollments_due_idx").on(t.tenantId, t.status, t.nextFireAt),
  ]
);

/** Ce face o regulă de reactivare când un lead pierdut a „stat" destul. */
export type CrmReengagementAction = "create_task" | "enroll_cadence" | "add_tag";

export const crmReengagementRules = pgTable(
  "crm_reengagement_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    afterMonths: integer("after_months").notNull().default(6),
    /** `[]` = orice motiv de pierdere. */
    lostReasons: jsonb("lost_reasons").$type<string[]>().notNull().default([]),
    /** `[]` = orice etapă marcată „pierdut". */
    stageKeys: jsonb("stage_keys").$type<string[]>().notNull().default([]),
    action: varchar("action", { length: 30 }).notNull().default("create_task"),
    cadenceId: uuid("cadence_id").references(() => crmCadences.id, { onDelete: "set null" }),
    /** Titlul taskului (create_task) sau eticheta (add_tag) — un singur câmp, refolosit. */
    taskTitle: varchar("task_title", { length: 300 }),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_reeng_rules_tenant_idx").on(t.tenantId, t.orderIndex)]
);

export const crmReengagementRuns = pgTable(
  "crm_reengagement_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => crmReengagementRules.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    /** ok | failed */
    result: varchar("result", { length: 20 }).notNull().default("ok"),
  },
  (t) => [
    // Unicitatea e regula de business, nu o optimizare: o regulă nu are voie să trezească același
    // lead de două ori, oricât de des ar rula cronul.
    unique("crm_reeng_runs_rule_lead_uniq").on(t.ruleId, t.leadId),
    index("crm_reeng_runs_tenant_idx").on(t.tenantId, t.ranAt),
  ]
);

export type CrmCadence = typeof crmCadences.$inferSelect;
export type NewCrmCadence = typeof crmCadences.$inferInsert;
export type CrmCadenceEnrollment = typeof crmCadenceEnrollments.$inferSelect;
export type NewCrmCadenceEnrollment = typeof crmCadenceEnrollments.$inferInsert;
export type CrmReengagementRule = typeof crmReengagementRules.$inferSelect;
export type NewCrmReengagementRule = typeof crmReengagementRules.$inferInsert;
export type CrmReengagementRun = typeof crmReengagementRuns.$inferSelect;
