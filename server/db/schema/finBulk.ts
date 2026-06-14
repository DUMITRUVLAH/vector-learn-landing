// MASS-001: FinDesk Bulk Operations schema
// Tables: fin_bulk_jobs, fin_bulk_rows
// FIN-CORE §1.15: async bulk job infrastructure
// Tenant isolation: all queries must filter by tenant_id

import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  jsonb,
  index,
  unique,
  // MASS-003: meta column added via migration 0122
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── fin_bulk_jobs ────────────────────────────────────────────────────────────
// Represents one bulk operation (recurring invoices, CSV import, etc.)
// job_type values: recurring_invoices | csv_import_parties | csv_import_spend
// status values:   pending | running | done | failed | cancelled

export const finBulkJobs = pgTable(
  "fin_bulk_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobType: varchar("job_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    successRows: integer("success_rows").notNull().default(0),
    failRows: integer("fail_rows").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    // Job-type-specific parameters (e.g. { period: "2026-06", include_einv: true })
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("fbj_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("fbj_tenant_status_idx").on(t.tenantId, t.status),
    tenantTypeIdx: index("fbj_tenant_type_idx").on(t.tenantId, t.jobType),
  })
);

// ─── fin_bulk_rows ────────────────────────────────────────────────────────────
// One row per processed item within a job.
// status values: pending | success | fail | skipped

export const finBulkRows = pgTable(
  "fin_bulk_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => finBulkJobs.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(), // 0-based
    // External reference: agreement_id, CSV line number, etc.
    externalRef: varchar("external_ref", { length: 200 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    errorMessage: text("error_message"),
    // ID of the created object (invoice_id, party_id, etc.)
    resultRef: varchar("result_ref", { length: 200 }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // MASS-003: per-row metadata (csv_line, csv_headers, created_by for CSV import jobs)
    meta: jsonb("meta").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    jobIdx: index("fbr_job_idx").on(t.jobId),
    jobStatusIdx: index("fbr_job_status_idx").on(t.jobId, t.status),
    uniqueJobRow: unique("fbr_job_row_unique").on(t.jobId, t.rowIndex),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const finBulkJobsRelations = relations(finBulkJobs, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [finBulkJobs.tenantId],
    references: [tenants.id],
  }),
  creator: one(users, {
    fields: [finBulkJobs.createdBy],
    references: [users.id],
  }),
  rows: many(finBulkRows),
}));

export const finBulkRowsRelations = relations(finBulkRows, ({ one }) => ({
  job: one(finBulkJobs, {
    fields: [finBulkRows.jobId],
    references: [finBulkJobs.id],
  }),
}));

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type FinBulkJob = typeof finBulkJobs.$inferSelect;
export type InsertFinBulkJob = typeof finBulkJobs.$inferInsert;
export type FinBulkRow = typeof finBulkRows.$inferSelect;
export type InsertFinBulkRow = typeof finBulkRows.$inferInsert;

// Job type constants (used across the MASS module)
export const FIN_BULK_JOB_TYPES = [
  "recurring_invoices",
  "csv_import_parties",
  "csv_import_spend",
] as const;
export type FinBulkJobType = (typeof FIN_BULK_JOB_TYPES)[number];

// Status constants
export const FIN_BULK_JOB_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "cancelled",
] as const;
export type FinBulkJobStatus = (typeof FIN_BULK_JOB_STATUSES)[number];

export const FIN_BULK_ROW_STATUSES = [
  "pending",
  "success",
  "fail",
  "skipped",
  "cancelled",
] as const;
export type FinBulkRowStatus = (typeof FIN_BULK_ROW_STATUSES)[number];
