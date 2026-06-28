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
  numeric,
  boolean,
  text,
  timestamp,
  index,
  uniqueIndex,
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

/**
 * Project-scoped approvers (VF-approval-scoping): which users may approve PARs on a given project.
 * If a project has ≥1 row here, ONLY those users (who also hold the `approver`/`par_admin` role) can
 * decide its role-based approval steps. A project with NO rows → any approver (global, the default).
 * Managed by the par_admin only.
 */
export const parProjectApprovers = pgTable(
  "par_project_approvers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => parProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("par_project_approvers_project_idx").on(t.projectId),
    tenantIdx: index("par_project_approvers_tenant_idx").on(t.tenantId),
    uniqProjectUser: uniqueIndex("par_project_approvers_project_user_uniq").on(t.projectId, t.userId),
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
    /** Feature 2: total budget allocated to this code (minor units, default 0 = uncapped) */
    allocatedCents: integer("allocated_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_budget_codes_tenant_idx").on(t.tenantId),
  })
);

/** VM1-04: Events — sub-entity of a project (Proiect → Eveniment → PAR).
 * Defined before parRequests so eventId FK is resolvable without a forward ref. */
export const parEvents = pgTable(
  "par_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Optional parent project. Null = event not tied to a specific project. */
    projectId: uuid("project_id").references(() => parProjects.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    /** Feature 2: who created this event (for "added by" display) */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_events_tenant_idx").on(t.tenantId),
    projectIdx: index("par_events_project_idx").on(t.projectId),
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
    /** Vendor compliance — Feature 1 (contafirm.md registry) */
    /** individual | company */
    kind: varchar("kind", { length: 20 }).notNull().default("individual"),
    /** Registry status string from contafirm.md (e.g. "active") */
    companyStatus: varchar("company_status", { length: 100 }),
    /** contafirm.md numeric id */
    registryId: integer("registry_id"),
    /** Timestamp when the vendor was last verified against the registry */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
    /** VF-003: false until the org finishes (or skips) the onboarding wizard. */
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    /** VF-505: when true, payments are blocked unless the 3-way match (PO + receipt + amount) passes. */
    enforceThreeWayMatch: boolean("enforce_three_way_match").notNull().default(false),
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
    /** VM1-04: optional event (sub-entity of project). Nullable FK → par_events. */
    eventId: uuid("event_id").references(() => parEvents.id, { onDelete: "set null" }),
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
    /** Feature 1: persoană fizică ("fizic") sau juridică ("juridic"). Null = unset/legacy. */
    payeeType: varchar("payee_type", { length: 10 }),
    /** Section 13 */
    attachmentsPresent: boolean("attachments_present").notNull().default(false),
    attachmentsNote: text("attachments_note"),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    /** Cached sum of line totals — kept in sync by the backend on every line item change */
    totalEstimatedCents: integer("total_estimated_cents").notNull().default(0),
    /** VF-203: exchange rate (1 unit of `currency` → MDL) captured at submit. Null for MDL. */
    exchangeRate: numeric("exchange_rate", { precision: 14, scale: 6 }),
    /** VF-203: total converted to MDL minor units at submit (= totalEstimatedCents when currency=MDL). */
    totalMdlCents: integer("total_mdl_cents"),
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
    // base64 data URLs (megabytes) are stored here — MUST be text, not varchar(2000), or any real
    // file upload fails with "value too long for type character varying(2000)".
    fileUrl: text("file_url").notNull(),
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
    // may hold a base64 proof image — text, not varchar(2000), for the same reason as file_url.
    proofUrl: text("proof_url"),
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

/**
 * Feature 3: PAR Templates — JSON snapshots of header + line items + payee.
 * Allows saving a PAR as a reusable template and instantiating new draft PARs from it.
 */
export const parTemplates = pgTable(
  "par_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** JSON snapshot of header fields + line items + payee (no status/approval data) */
    snapshot: text("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_templates_tenant_idx").on(t.tenantId),
    createdByIdx: index("par_templates_created_by_idx").on(t.createdByUserId),
  })
);

// VF-004: pending invitations. The raw token is never stored — only its sha256 hash.
export const parInvites = pgTable(
  "par_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    parRole: parRoleEnum("par_role").notNull(),
    /** sha256(token) — the plaintext token lives only in the invite URL. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_invites_tenant_idx").on(t.tenantId),
    tokenHashIdx: index("par_invites_token_hash_idx").on(t.tokenHash),
    emailIdx: index("par_invites_email_idx").on(t.email),
  })
);

// VF-104: comments on a PAR. Append-only (no edit/delete in v1) for audit integrity.
export const parComments = pgTable(
  "par_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_comments_par_idx").on(t.parId),
    tenantIdx: index("par_comments_tenant_idx").on(t.tenantId),
  })
);

// VF-501: quotes collected on an `obtain_quotations` PAR (donor 3-bid rule).
export const parQuotes = pgTable(
  "par_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    /** Registered vendor (optional) or a free-typed name snapshot. */
    vendorId: uuid("vendor_id").references(() => parVendors.id, { onDelete: "set null" }),
    vendorName: varchar("vendor_name", { length: 300 }).notNull(),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    notes: text("notes"),
    fileUrl: text("file_url"),
    /** VF-502: the chosen winning quote (one per PAR) + the justification for the choice. */
    selected: boolean("selected").notNull().default(false),
    selectionReason: text("selection_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_quotes_par_idx").on(t.parId),
    tenantIdx: index("par_quotes_tenant_idx").on(t.tenantId),
  })
);

// VF-503: purchase order issued from an approved PAR (one PO per PAR).
export const parPurchaseOrders = pgTable(
  "par_purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .unique()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    poNumber: varchar("po_number", { length: 50 }).notNull(),
    vendorName: varchar("vendor_name", { length: 300 }),
    vendorIdnp: varchar("vendor_idnp", { length: 13 }),
    vendorIban: varchar("vendor_iban", { length: 34 }),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("MDL"),
    status: varchar("status", { length: 20 }).notNull().default("issued"),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_po_tenant_idx").on(t.tenantId),
  })
);

// VF-504: goods/services receipt (confirm what arrived before payment).
export const parReceipts = pgTable(
  "par_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parId: uuid("par_id")
      .notNull()
      .references(() => parRequests.id, { onDelete: "cascade" }),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    /** true = full receipt; false = partial. */
    complete: boolean("complete").notNull().default(true),
    notes: text("notes"),
    fileUrl: text("file_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parIdx: index("par_receipts_par_idx").on(t.parId),
    tenantIdx: index("par_receipts_tenant_idx").on(t.tenantId),
  })
);

export const parReceiptLines = pgTable(
  "par_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => parReceipts.id, { onDelete: "cascade" }),
    lineItemId: uuid("line_item_id")
      .notNull()
      .references(() => parLineItems.id, { onDelete: "cascade" }),
    qtyReceived: integer("qty_received").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    receiptIdx: index("par_receipt_lines_receipt_idx").on(t.receiptId),
    tenantIdx: index("par_receipt_lines_tenant_idx").on(t.tenantId),
  })
);

// VF-302: approver delegation. While active, `toUser` can decide steps assigned to `fromUser`.
export const parDelegations = pgTable(
  "par_delegations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("par_delegations_tenant_idx").on(t.tenantId),
    fromIdx: index("par_delegations_from_idx").on(t.fromUserId),
    toIdx: index("par_delegations_to_idx").on(t.toUserId),
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
export type ParTemplate = typeof parTemplates.$inferSelect;
export type NewParTemplate = typeof parTemplates.$inferInsert;
export type ParInvite = typeof parInvites.$inferSelect;
export type NewParInvite = typeof parInvites.$inferInsert;
export type ParComment = typeof parComments.$inferSelect;
export type NewParComment = typeof parComments.$inferInsert;
export type ParDelegation = typeof parDelegations.$inferSelect;
export type NewParDelegation = typeof parDelegations.$inferInsert;
export type ParQuote = typeof parQuotes.$inferSelect;
export type NewParQuote = typeof parQuotes.$inferInsert;
export type ParPurchaseOrder = typeof parPurchaseOrders.$inferSelect;
export type NewParPurchaseOrder = typeof parPurchaseOrders.$inferInsert;
export type ParReceipt = typeof parReceipts.$inferSelect;
export type NewParReceipt = typeof parReceipts.$inferInsert;
export type ParReceiptLine = typeof parReceiptLines.$inferSelect;
export type NewParReceiptLine = typeof parReceiptLines.$inferInsert;
export type ParEvent = typeof parEvents.$inferSelect;
export type NewParEvent = typeof parEvents.$inferInsert;
