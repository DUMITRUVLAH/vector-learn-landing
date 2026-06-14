/**
 * PAR — Payment Action Request workflow
 * CORE: backlog/par/PAR-CORE.md §2
 * Migration: drizzle/0113_par_core.sql
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const parPurposeEnum = pgEnum("par_purpose", [
  "execute_payment",
  "obtain_quotations",
  "provide_estimate",
]);

export const parChargeToEnum = pgEnum("par_charge_to", [
  "operations",
  "program",
  "other",
]);

export const parStatusEnum = pgEnum("par_status", [
  "draft",
  "pending_approval",
  "changes_requested",
  "rejected",
  "approved",
  "in_finance",
  "reapproval_required",
  "paid",
  "cancelled",
]);

export const parDecisionEnum = pgEnum("par_decision", [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
]);

export const parRoleEnum = pgEnum("par_role", [
  "requestor",
  "approver",
  "finance",
  "par_admin",
]);

export const parAttachmentKindEnum = pgEnum("par_attachment_kind", [
  "act_of_receipt",
  "contract",
  "quotation",
  "invoice",
  "par_pdf",
  "other",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/** Members: maps user → PAR role(s) within a tenant */
export const parMembers = pgTable(
  "par_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: parRoleEnum("role").notNull(),
    /** Approval authority ceiling in minor units (null = no DOA limit set) */
    approvalLimitCents: integer("approval_limit_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_members_tenant_idx").on(t.tenantId),
    userIdx: index("par_members_user_idx").on(t.userId),
  })
);

/** Departments (section 4) */
export const parDepartments = pgTable(
  "par_departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_departments_tenant_idx").on(t.tenantId),
  })
);

/** Projects / Programs (section 6 — "Requested For / Deliver To") */
export const parProjects = pgTable(
  "par_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    donor: varchar("donor", { length: 200 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_projects_tenant_idx").on(t.tenantId),
  })
);

/** Budget codes (section 7) */
export const parBudgetCodes = pgTable(
  "par_budget_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_budget_codes_tenant_idx").on(t.tenantId),
  })
);

/**
 * Vendor / Payee registry (section 12 — GDPR-sensitive: IDNP + IBAN).
 * Reusable across PARs so a requestor picks an existing payee instead of re-typing.
 */
export const parVendors = pgTable(
  "par_vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    /** Moldova personal ID — 13 digits */
    idnp: varchar("idnp", { length: 13 }),
    /** IBAN: Moldova format MD + 22 chars */
    iban: varchar("iban", { length: 34 }),
    bank: varchar("bank", { length: 300 }),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    /**
     * SPLIT-201: link to fin_parties for shared PARTY identity across Business Suite.
     * A PAR vendor (payee) is the same contact as a FinDesk partner.
     * Nullable — existing vendors not yet linked to fin_parties are still valid.
     * Migration: drizzle/0146_split_party_bridge.sql
     */
    finPartyId: uuid("fin_party_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_vendors_tenant_idx").on(t.tenantId),
  })
);

/** Org-level settings per tenant */
export const parSettings = pgTable(
  "par_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" })
      .unique(),
    /** Micro-purchase threshold in minor units (payments ≤ this amount need fewer approval steps) */
    microPurchaseThresholdCents: integer("micro_purchase_threshold_cents").notNull().default(1000000),
    defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("MDL"),
    orgLegalName: varchar("org_legal_name", { length: 300 }),
    orgLogoUrl: varchar("org_logo_url", { length: 1000 }),
    pdfHelpUrl: varchar("pdf_help_url", { length: 1000 }),
    /** Prefix for PAR numbers (default "PAR") */
    requestNoPrefix: varchar("request_no_prefix", { length: 20 }).notNull().default("PAR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_settings_tenant_idx").on(t.tenantId),
  })
);

/** Delegation of Authority matrix row */
export const parDoaMatrix = pgTable(
  "par_doa_matrix",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** null = applies to any charge_to */
    chargeTo: parChargeToEnum("charge_to"),
    /** null = applies to any department */
    departmentId: uuid("department_id").references(() => parDepartments.id, { onDelete: "set null" }),
    minAmountCents: integer("min_amount_cents").notNull().default(0),
    maxAmountCents: integer("max_amount_cents"),
    /** Approval step number (1 = first approval needed, 2 = second, …) */
    step: integer("step").notNull(),
    /** Human-readable label, e.g. "DOA Holder / Supervisor", "Executive Director" */
    approverRoleLabel: varchar("approver_role_label", { length: 200 }).notNull(),
    /** Specific user assigned as approver (optional — overrides par_role matching) */
    approverUserId: uuid("approver_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Role-based approver: any user with this par_role (used when approverUserId is null) */
    approverParRole: parRoleEnum("approver_par_role"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_doa_matrix_tenant_idx").on(t.tenantId),
  })
);

/** PAR header — sections 1–13 (the request itself) */
export const parRequests = pgTable(
  "par_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Human-readable sequential ID per tenant, e.g. "PAR-2026-0001" */
    requestNo: varchar("request_no", { length: 50 }).notNull(),
    /** Section 1 */
    dateOfRequest: timestamp("date_of_request", { withTimezone: true }).notNull().defaultNow(),
    /** Section 2 — user who created the request */
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Section 3 — job title snapshot at time of request */
    requestorTitle: varchar("requestor_title", { length: 300 }),
    /** Section 4 */
    departmentId: uuid("department_id").references(() => parDepartments.id, { onDelete: "set null" }),
    /** Section 5 — optional delivery date */
    dateNeeded: timestamp("date_needed", { withTimezone: true }),
    /** Section 6 — project / program */
    projectId: uuid("project_id").references(() => parProjects.id, { onDelete: "set null" }),
    /** Section 7 */
    budgetCodeId: uuid("budget_code_id").references(() => parBudgetCodes.id, { onDelete: "set null" }),
    budgetCodeNote: text("budget_code_note"),
    /** Section 8 */
    purpose: parPurposeEnum("purpose").notNull().default("execute_payment"),
    /** Section 9 */
    chargeTo: parChargeToEnum("charge_to").notNull().default("program"),
    chargeBillingCode: varchar("charge_billing_code", { length: 100 }),
    /** Section 11 — purpose and end use description */
    endUse: text("end_use"),
    /** Section 12 — payee block (vendor ref or inline snapshot) */
    vendorId: uuid("vendor_id").references(() => parVendors.id, { onDelete: "set null" }),
    payeeName: varchar("payee_name", { length: 300 }),
    payeeIdnp: varchar("payee_idnp", { length: 13 }),
    payeeIban: varchar("payee_iban", { length: 34 }),
    payeeBank: varchar("payee_bank", { length: 300 }),
    /** Section 13 */
    attachmentsPresent: boolean("attachments_present").notNull().default(false),
    attachmentsNote: text("attachments_note"),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    /** Cached sum of line totals — kept in sync by the backend on every line item change */
    totalEstimatedCents: integer("total_estimated_cents").notNull().default(0),
    status: parStatusEnum("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * PAR-107: SHA-256 hex hash of (header + line items + payee) at submit time.
     * Used to verify body immutability on display and on PDF (PAR-109 §AC).
     * Null until first submit. Regenerated on re-submit after changes_requested.
     */
    bodyHash: varchar("body_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_requests_tenant_idx").on(t.tenantId),
    statusIdx: index("par_requests_status_idx").on(t.status),
    requestedByIdx: index("par_requests_requested_by_idx").on(t.requestedByUserId),
  })
);

/** Section 10 — line items (repeating table) */
export const parLineItems = pgTable(
  "par_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unit: varchar("unit", { length: 50 }),
    unitPriceCents: integer("unit_price_cents").notNull(),
    /** Computed: quantity × unitPriceCents */
    lineTotalCents: integer("line_total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_line_items_par_idx").on(t.parId),
    tenantIdx: index("par_line_items_tenant_idx").on(t.tenantId),
  })
);

/** Sections 14–15 — approval chain (one row per step; step 0 = requestor submit/signature) */
export const parApprovals = pgTable(
  "par_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    /** 0 = requestor submit, 1 = first approver, 2 = second, … */
    step: integer("step").notNull(),
    approverUserId: uuid("approver_user_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "DOA Holder / Supervisor", "Executive Director" */
    approverRoleLabel: varchar("approver_role_label", { length: 200 }),
    decision: parDecisionEnum("decision").notNull().default("pending"),
    /**
     * PAR-107/PAR-109: true = step cannot be decided yet (prior step not approved).
     * Step 1 starts as false (active); all subsequent steps start as true (locked).
     * Unlocked by the routing engine when the previous step reaches "approved".
     */
    locked: boolean("locked").notNull().default(false),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment"),
    /** Typed or drawn signature name — prints in signature box on PDF */
    signatureName: varchar("signature_name", { length: 300 }),
    signatureTitle: varchar("signature_title", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_approvals_par_idx").on(t.parId),
    tenantIdx: index("par_approvals_tenant_idx").on(t.tenantId),
    statusIdx: index("par_approvals_decision_idx").on(t.decision),
  })
);

/** Section 13 — file attachments */
export const parAttachments = pgTable(
  "par_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    fileUrl: varchar("file_url", { length: 2000 }).notNull(),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    kind: parAttachmentKindEnum("kind").notNull().default("other"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_attachments_par_idx").on(t.parId),
    tenantIdx: index("par_attachments_tenant_idx").on(t.tenantId),
  })
);

/** Section 16 — Finance / payment execution (filled by finance role) */
export const parPayments = pgTable(
  "par_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" })
      .unique(),
    /** PAR budget line — accounting booking line */
    parBl: varchar("par_bl", { length: 200 }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Actual amount paid (may differ from totalEstimatedCents) */
    actualAmountCents: integer("actual_amount_cents"),
    paymentDate: timestamp("payment_date", { withTimezone: true }),
    paymentRef: varchar("payment_ref", { length: 500 }),
    proofUrl: varchar("proof_url", { length: 2000 }),
    /** True if the 10%-overage rule triggered and a re-approval was granted */
    overageReapproved: boolean("overage_reapproved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_payments_par_idx").on(t.parId),
    tenantIdx: index("par_payments_tenant_idx").on(t.tenantId),
  })
);

/** Append-only audit log for every PAR state transition */
export const parAudit = pgTable(
  "par_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "created", "submitted", "approved", "rejected", "paid", "edited", "cancelled" */
    event: varchar("event", { length: 100 }).notNull(),
    detail: text("detail"),
    /** JSON snapshot of before/after diff for edits */
    diff: text("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_audit_par_idx").on(t.parId),
    tenantIdx: index("par_audit_tenant_idx").on(t.tenantId),
  })
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParRequest = typeof parRequests.$inferSelect;
export type NewParRequest = typeof parRequests.$inferInsert;
export type ParLineItem = typeof parLineItems.$inferSelect;
export type NewParLineItem = typeof parLineItems.$inferInsert;
export type ParApproval = typeof parApprovals.$inferSelect;
export type NewParApproval = typeof parApprovals.$inferInsert;
export type ParAttachment = typeof parAttachments.$inferSelect;
export type NewParAttachment = typeof parAttachments.$inferInsert;
export type ParPayment = typeof parPayments.$inferSelect;
export type NewParPayment = typeof parPayments.$inferInsert;
export type ParDoaMatrix = typeof parDoaMatrix.$inferSelect;
export type NewParDoaMatrix = typeof parDoaMatrix.$inferInsert;
export type ParBudgetCode = typeof parBudgetCodes.$inferSelect;
export type ParDepartment = typeof parDepartments.$inferSelect;
export type ParProject = typeof parProjects.$inferSelect;
export type ParVendor = typeof parVendors.$inferSelect;
export type ParSettings = typeof parSettings.$inferSelect;
export type ParMember = typeof parMembers.$inferSelect;
export type ParAudit = typeof parAudit.$inferSelect;
