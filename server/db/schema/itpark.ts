/**
 * ITPARK — Moldova IT Park Audit Toolkit
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 * Migration: drizzle/0115_itpark_core.sql
 *
 * Tables:
 *   itpark_engagements      — dosarul de verificare (per rezident × an)
 *   itpark_revenue_lines    — liniile Anexei 3 (facturi/clienți)
 *   itpark_caem_codes       — nomenclator coduri CAEM (eligibile vs ne-eligibile)
 *   itpark_monthly          — Anexa 4 lunară (derivat + override)
 *   itpark_packet_documents — piesele pachetului generat (Anexa 2/3/4 + scrisori)
 *   itpark_settings         — setări per tenant (prag 70%, toleranță, auditor)
 *   itpark_audit            — jurnal de acțiuni
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  bigint,
  boolean,
  text,
  date,
  timestamp,
  numeric,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const itparkEngagementStatusEnum = pgEnum("itpark_engagement_status", [
  "draft",
  "in_progress",
  "ready",
  "exported",
]);

export const itparkPacketKindEnum = pgEnum("itpark_packet_kind", [
  "anexa2",
  "anexa3",
  "anexa4",
  "letter_solvency",
  "letter_address",
  "letter_no_subdivisions",
  "letter_activity",
  "letter_no_adjustments",
  "decl_self_responsibility",
]);

export const itparkDocStatusEnum = pgEnum("itpark_doc_status", [
  "draft",
  "ready",
  "exported",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * itpark_engagements — dosarul de verificare (un rezident × un an calendaristic)
 * Rădăcina întregului modul. Echivalent cu antetul Anexei 2.
 */
export const itparkEngagements = pgTable(
  "itpark_engagements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Denumirea firmei rezidente */
    residentName: varchar("resident_name", { length: 255 }).notNull(),
    /** IDNO (cod fiscal unic) — 13 cifre */
    idno: varchar("idno", { length: 20 }).notNull(),
    /** Nr. contract MITP (ex. „2368") */
    mitpContractNo: varchar("mitp_contract_no", { length: 50 }),
    /** Data contractului MITP */
    mitpContractDate: date("mitp_contract_date"),
    /** Adresa juridică completă */
    legalAddress: text("legal_address"),
    /** Adresele subdiviziunilor (Anexa 2 rând 4) — text liber, null = fără subdiviziuni */
    subdivisionAddresses: text("subdivision_addresses"),
    /** Plătitor TVA */
    vatPayer: boolean("vat_payer").notNull().default(false),
    /** Perioada de raportare — start (de obicei 01.01.YYYY) */
    periodStart: date("period_start").notNull(),
    /** Perioada de raportare — end (de obicei 31.12.YYYY) */
    periodEnd: date("period_end").notNull(),
    /** Anul de raportare (extras din periodEnd pentru filtrare rapidă) */
    reportingYear: integer("reporting_year").notNull(),
    /** Firma de audit (Anexa 2 rând 11) */
    auditFirmName: varchar("audit_firm_name", { length: 255 }),
    /** Status dosar */
    status: itparkEngagementStatusEnum("status").notNull().default("draft"),
    /**
     * Costul subcontractorilor străini în cents MDL (Anexa 2 rând 6).
     * Introdus manual de contabil — nu derivă din facturi.
     */
    subcontractorCostsCents: bigint("subcontractor_costs_cents", { mode: "number" }).notNull().default(0),
    /** Ponderea costurilor subcontractori în costul vânzărilor (%) — Anexa 2 rând 6 */
    subcontractorCostsPct: numeric("subcontractor_costs_pct", { precision: 5, scale: 2 }),
    /**
     * Total vânzări override (cents MDL).
     * Dacă setat, suprascrie Σ revenue_lines (pentru venituri în afara Anexei 3).
     */
    totalSalesCents: bigint("total_sales_cents", { mode: "number" }),
    /** Venituri ajustate (Anexa 2 rând 9) — cents MDL */
    adjustedRevenueCents: bigint("adjusted_revenue_cents", { mode: "number" }).notNull().default(0),
    /** Procedura de informare a angajaților (Anexa 2 rând 10) — text liber */
    employeeInfoProcedure: text("employee_info_procedure"),
    /**
     * SPLIT-201: link to fin_parties for shared PARTY identity across Business Suite.
     * A resident/company in ITPark is the same partner as in FinDesk.
     * Nullable — existing engagements without a FinDesk partner link remain valid.
     * Migration: drizzle/0146_split_party_bridge.sql
     */
    finPartyId: uuid("fin_party_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_eng_tenant_idx").on(t.tenantId),
    yearIdx: index("itpark_eng_year_idx").on(t.tenantId, t.reportingYear),
    idnoIdx: index("itpark_eng_idno_idx").on(t.tenantId, t.idno),
  })
);

/**
 * itpark_revenue_lines — liniile Anexei 3 (facturi/clienți per dosar)
 * Una sau mai multe facturi grupate pe client + obiect serviciu + cod CAEM.
 */
export const itparkRevenueLines = pgTable(
  "itpark_revenue_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => itparkEngagements.id, { onDelete: "cascade" }),
    /** Nr. rând în Anexa 3 (ordonare) */
    rowNo: integer("row_no").notNull().default(0),
    /** Clientul (denumire sau „Persoane Fizice" agregat) */
    clientName: varchar("client_name", { length: 255 }).notNull(),
    /**
     * Referințe documente: numere + date facturi (text liber, ex.
     * „Factura EBC000276766 din 27.10.25, Factura EBC000276800 din 15.11.25")
     */
    documentRefs: text("document_refs"),
    /** Descrierea serviciului (Anexa 3 col. 3) */
    serviceDescription: text("service_description").notNull().default(""),
    /** Codul CAEM (ex. „85.59", „62.02") */
    caemCode: varchar("caem_code", { length: 20 }).notNull(),
    /** Suma în cents MDL */
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /**
     * Eligibilitate: derivat din caem_codes.eligible pentru codul liniei.
     * Override manual permis (auditat în itpark_audit).
     */
    isEligible: boolean("is_eligible").notNull().default(false),
    /**
     * Luna (1–12) pentru atribuire la Anexa 4.
     * Null = linia acoperă mai multe luni (contribuie la total an, nu la lunar).
     */
    month: integer("month"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_rl_tenant_idx").on(t.tenantId),
    engagementIdx: index("itpark_rl_engagement_idx").on(t.engagementId),
    caemIdx: index("itpark_rl_caem_idx").on(t.caemCode),
    monthIdx: index("itpark_rl_month_idx").on(t.engagementId, t.month),
  })
);

/**
 * itpark_caem_codes — nomenclator coduri CAEM versionat
 * Sursă unică pentru eligibilitate. NICIODATĂ hardcodat în .tsx.
 * Seed: lista oficială MITP (CORE §4).
 */
export const itparkCaemCodes = pgTable(
  "itpark_caem_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Codul CAEM (ex. „85.59", „62.02") */
    code: varchar("code", { length: 20 }).notNull(),
    /** Denumire în română */
    label: varchar("label", { length: 500 }).notNull(),
    /** Eligibil pentru regimul IT Park */
    eligible: boolean("eligible").notNull().default(false),
    /** Data de la care e valabil (versionare) */
    effectiveFrom: date("effective_from").notNull(),
    /** Țara (implicit „MD") */
    country: varchar("country", { length: 5 }).notNull().default("MD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: index("itpark_caem_code_idx").on(t.code),
    eligibleIdx: index("itpark_caem_eligible_idx").on(t.eligible),
    effectiveIdx: index("itpark_caem_effective_idx").on(t.effectiveFrom),
  })
);

/**
 * itpark_monthly — Anexa 4 lunară (derivat din revenue_lines, persistat pt. override/lock)
 * Recalculat din revenue_lines când month e setat pe linii; altfel introdus manual per lună.
 */
export const itparkMonthly = pgTable(
  "itpark_monthly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => itparkEngagements.id, { onDelete: "cascade" }),
    /** Luna calendaristică (1 = ianuarie, 12 = decembrie) */
    month: integer("month").notNull(),
    /** Venituri eligibile luna curentă (cents MDL) */
    eligibleCents: bigint("eligible_cents", { mode: "number" }).notNull().default(0),
    /** Total venituri luna curentă (cents MDL) */
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    /** Venituri eligibile cumulative (cents MDL, ian → luna curentă) */
    cumulativeEligibleCents: bigint("cumulative_eligible_cents", { mode: "number" }).notNull().default(0),
    /** Total venituri cumulative (cents MDL) */
    cumulativeTotalCents: bigint("cumulative_total_cents", { mode: "number" }).notNull().default(0),
    /** Ponderea lunară cumulativă (%) — 2 zecimale */
    monthlySharePct: numeric("monthly_share_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_monthly_tenant_idx").on(t.tenantId),
    engagementIdx: index("itpark_monthly_engagement_idx").on(t.engagementId),
    monthIdx: index("itpark_monthly_month_idx").on(t.engagementId, t.month),
  })
);

/**
 * itpark_packet_documents — piesele pachetului generat
 * Fiecare piesă (Anexă, scrisoare, declarație) are status + snapshot de date.
 */
export const itparkPacketDocuments = pgTable(
  "itpark_packet_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => itparkEngagements.id, { onDelete: "cascade" }),
    /** Tipul documentului */
    kind: itparkPacketKindEnum("kind").notNull(),
    /** Status document */
    status: itparkDocStatusEnum("status").notNull().default("draft"),
    /**
     * Snapshot JSON al câmpurilor la momentul generării.
     * Permite regenerare fidelă fără re-calcul.
     */
    dataJson: jsonb("data_json"),
    /** Timestamp generare (null = negenerată încă) */
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_pd_tenant_idx").on(t.tenantId),
    engagementIdx: index("itpark_pd_engagement_idx").on(t.engagementId),
    kindIdx: index("itpark_pd_kind_idx").on(t.engagementId, t.kind),
  })
);

/**
 * itpark_settings — setări per tenant
 * Pragul de eligibilitate, toleranța, auditorul desemnat.
 * Unul per tenant (upsert la creare/modificare).
 */
export const itparkSettings = pgTable(
  "itpark_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Pragul de eligibilitate (%, default 70.00) */
    eligibilityThresholdPct: numeric("eligibility_threshold_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("70.00"),
    /** Numărul de luni consecutive sub prag admise (default 2) */
    toleranceMonths: integer("tolerance_months").notNull().default(2),
    /** Moneda implicită (MDL) */
    defaultCurrency: varchar("default_currency", { length: 10 }).notNull().default("MDL"),
    /** Firma de audit implicită */
    defaultAuditFirm: varchar("default_audit_firm", { length: 255 }),
    /**
     * Userul desemnat ca auditor (nullable).
     * Admin/manager → acces contabil (poate edita dosare).
     * Auditorul (acest user) → read-only + poate marca „verificat".
     * Oricine alt user autentificat în tenant → viewer (read-only total).
     */
    auditorUserId: uuid("auditor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_settings_tenant_idx").on(t.tenantId),
  })
);

/**
 * itpark_audit — jurnal de acțiuni pe dosare
 * Refolosește pattern auditLog.ts. Acțiuni: creare/edit/export/import/override-cod.
 */
export const itparkAudit = pgTable(
  "itpark_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id").references(() => itparkEngagements.id, { onDelete: "cascade" }),
    /** Userul care a efectuat acțiunea */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Tipul acțiunii (ex. „create_engagement", „import_lines", „override_caem", „export_pdf") */
    action: varchar("action", { length: 100 }).notNull(),
    /** Entitatea afectată (ex. „engagement", „revenue_line", „packet_document") */
    entityType: varchar("entity_type", { length: 100 }),
    /** ID-ul entității afectate */
    entityId: uuid("entity_id"),
    /** Detalii suplimentare (JSON) */
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("itpark_audit_tenant_idx").on(t.tenantId),
    engagementIdx: index("itpark_audit_engagement_idx").on(t.engagementId),
    userIdx: index("itpark_audit_user_idx").on(t.userId),
  })
);
