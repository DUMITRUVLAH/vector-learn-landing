/**
 * MASS-002 + MASS-003 + MASS-004: FinDesk Bulk Operations API
 *
 * Routes:
 *   POST   /api/fin/mass/recurring-invoices      — starts async job: active agreements → invoices → e-factura
 *   GET    /api/fin/mass/jobs                    — list bulk jobs for tenant (desc by created_at)
 *   GET    /api/fin/mass/jobs/:jobId             — job details + all rows
 *   POST   /api/fin/mass/jobs/:jobId/retry       — MASS-004: retry failed rows (non-validation)
 *   POST   /api/fin/mass/jobs/:jobId/cancel      — MASS-004: cancel pending/running job
 *   POST   /api/fin/mass/import/parties          — CSV import: fin_parties (MASS-003)
 *   POST   /api/fin/mass/import/spend            — CSV import: fin_spend_entries (MASS-003)
 *
 * Design:
 * - All POST bulk-trigger routes return immediately with { jobId, totalRows }
 * - Actual processing runs async (setImmediate) — no blocking the HTTP response
 * - Tenant isolation: all queries filter by tenantId from session
 * - No raw .execute().rows — Drizzle query builder throughout
 * - FIN-CORE §1.15: job infra in fin_bulk_jobs / fin_bulk_rows
 * - MASS-004: in-app notifications on job completion (done/failed)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, lte, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { finBulkJobs, finBulkRows } from "../db/schema/finBulk";
import { finAgreements, finAgreementServices } from "../db/schema/finAgreements";
import { inAppNotifications } from "../db/schema/inAppNotifications";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runBulkJob, type RowProcessor } from "../lib/finBulkRunner";
import {
  makeRecurringInvoiceProcessor,
  type RecurringJobMeta,
} from "../lib/finRecurringProcessor";
import {
  makePartyImportProcessor,
  makeSpendImportProcessor,
} from "../lib/finCsvImportProcessor";

export const finMassRoutes = new Hono<{ Variables: AuthVariables }>();

finMassRoutes.use("*", requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ─── POST /recurring-invoices ─────────────────────────────────────────────────

const recurringSchema = z.object({
  /** Billing period; defaults to current month (YYYY-MM). */
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Formatul perioadei trebuie să fie YYYY-MM")
    .optional(),
  /** Whether to also generate/submit e-Factura SFS records. */
  includeEinv: z.boolean().optional().default(false),
});

finMassRoutes.post(
  "/recurring-invoices",
  zValidator("json", recurringSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { period: rawPeriod, includeEinv } = c.req.valid("json");
    const period = rawPeriod ?? getCurrentPeriod();

    const today = getTodayDateStr();

    // Find eligible agreements: active + at least one service with next_bill_date <= today
    const eligibleAgreements = await db
      .select({
        id: finAgreements.id,
        title: finAgreements.title,
      })
      .from(finAgreements)
      .where(
        and(
          eq(finAgreements.tenantId, tenantId),
          eq(finAgreements.status, "active")
        )
      );

    // Filter to those with at least one due service
    const agreementsWithDueServices: string[] = [];
    for (const agr of eligibleAgreements) {
      const dueServices = await db
        .select({ id: finAgreementServices.id })
        .from(finAgreementServices)
        .where(
          and(
            eq(finAgreementServices.agreementId, agr.id),
            eq(finAgreementServices.isActive, true),
            lte(finAgreementServices.nextBillDate, today)
          )
        )
        .limit(1);

      if (dueServices.length > 0) {
        agreementsWithDueServices.push(agr.id);
      }
    }

    const totalRows = agreementsWithDueServices.length;

    // Create the bulk job
    const [job] = await db
      .insert(finBulkJobs)
      .values({
        tenantId,
        jobType: "recurring_invoices",
        status: "pending",
        totalRows,
        meta: { period, includeEinv } as unknown as Record<string, unknown>,
        createdBy: user.id,
      })
      .returning();

    // Create one row per eligible agreement
    if (totalRows > 0) {
      await db.insert(finBulkRows).values(
        agreementsWithDueServices.map((agrId, i) => ({
          jobId: job.id,
          rowIndex: i,
          externalRef: agrId,
        }))
      );
    }

    // Run async (non-blocking)
    if (totalRows > 0) {
      const meta: RecurringJobMeta = { period, includeEinv: includeEinv ?? false };
      const processor = makeRecurringInvoiceProcessor(tenantId, meta);
      const creatorId = user.id;

      setImmediate(async () => {
        try {
          await runBulkJob(job.id, (row) =>
            processor({ id: row.id, externalRef: row.externalRef })
          );
          // MASS-004: notify creator on completion
          await sendJobCompletionNotification(job.id, tenantId, creatorId);
        } catch (err) {
          console.error(`[finMass] runBulkJob failed for job ${job.id}:`, err);
        }
      });
    } else {
      // No rows to process — mark as done immediately
      await db
        .update(finBulkJobs)
        .set({ status: "done", finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(finBulkJobs.id, job.id));
    }

    return c.json({ jobId: job.id, totalRows }, 200);
  }
);

// ─── GET /jobs ────────────────────────────────────────────────────────────────

finMassRoutes.get("/jobs", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const limitParam = Number(c.req.query("limit") ?? "20");
  const offsetParam = Number(c.req.query("offset") ?? "0");
  const limit = Math.min(Math.max(1, limitParam), 100);
  const offset = Math.max(0, offsetParam);

  const jobs = await db
    .select()
    .from(finBulkJobs)
    .where(eq(finBulkJobs.tenantId, tenantId))
    .orderBy(desc(finBulkJobs.createdAt))
    .limit(limit)
    .offset(offset);

  // Total count for pagination
  const totalResult = await db
    .select({ count: finBulkJobs.id })
    .from(finBulkJobs)
    .where(eq(finBulkJobs.tenantId, tenantId));

  return c.json({ jobs, total: totalResult.length }, 200);
});

// ─── GET /jobs/:jobId ─────────────────────────────────────────────────────────

finMassRoutes.get("/jobs/:jobId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const jobId = c.req.param("jobId");

  const job = await db.query.finBulkJobs.findFirst({
    where: and(
      eq(finBulkJobs.id, jobId),
      eq(finBulkJobs.tenantId, tenantId) // tenant isolation
    ),
  });

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const rows = await db
    .select()
    .from(finBulkRows)
    .where(eq(finBulkRows.jobId, jobId))
    .orderBy(finBulkRows.rowIndex);

  return c.json({ job, rows }, 200);
});

// ─── POST /jobs/:jobId/retry ──────────────────────────────────────────────────
// MASS-004: re-process all failed rows (non-validation errors) in a job.
// Resets retry_count=0 and status='pending' for rows whose error_message does
// NOT contain the word 'validation' (those are permanent data errors, not transient).
// Returns { retried: N }.

finMassRoutes.post("/jobs/:jobId/retry", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const jobId = c.req.param("jobId");

  // Tenant isolation: verify job belongs to this tenant
  const job = await db.query.finBulkJobs.findFirst({
    where: and(
      eq(finBulkJobs.id, jobId),
      eq(finBulkJobs.tenantId, tenantId)
    ),
  });

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Fetch all failed rows for this job
  const failedRows = await db
    .select()
    .from(finBulkRows)
    .where(
      and(
        eq(finBulkRows.jobId, jobId),
        eq(finBulkRows.status, "fail")
      )
    );

  // Filter out validation errors — those won't succeed on retry
  const retriableRows = failedRows.filter(
    (r) => !r.errorMessage?.toLowerCase().includes("validation")
  );

  if (retriableRows.length === 0) {
    return c.json({ retried: 0 }, 200);
  }

  // Reset rows to pending with retry_count=0
  const retriableIds = retriableRows.map((r) => r.id);
  await db
    .update(finBulkRows)
    .set({
      status: "pending",
      retryCount: 0,
      errorMessage: null,
      processedAt: null,
    })
    .where(inArray(finBulkRows.id, retriableIds));

  // Reset job status to pending so runner picks it up
  await db
    .update(finBulkJobs)
    .set({
      status: "pending",
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(finBulkJobs.id, jobId));

  // Re-run the job async — reuse the same processor based on job type
  setImmediate(async () => {
    try {
      // We need to re-derive the processor by job type
      const latestJob = await db.query.finBulkJobs.findFirst({
        where: eq(finBulkJobs.id, jobId),
      });
      if (!latestJob) return;

      let processor: RowProcessor;
      if (latestJob.jobType === "recurring_invoices") {
        const meta = (latestJob.meta ?? {}) as RecurringJobMeta;
        const innerProc = makeRecurringInvoiceProcessor(tenantId, meta);
        processor = (row) => innerProc({ id: row.id, externalRef: row.externalRef });
      } else if (latestJob.jobType === "import_parties") {
        processor = makePartyImportProcessor(tenantId);
      } else if (latestJob.jobType === "import_spend") {
        processor = makeSpendImportProcessor(tenantId);
      } else {
        return; // unknown job type — don't retry
      }

      await runBulkJob(jobId, processor);

      // Send in-app notification on retry completion
      await sendJobCompletionNotification(jobId, tenantId, user.id);
    } catch (err) {
      console.error(`[finMass] retry job ${jobId} failed:`, err);
    }
  });

  return c.json({ retried: retriableRows.length }, 200);
});

// ─── POST /jobs/:jobId/cancel ─────────────────────────────────────────────────
// MASS-004: cancel a pending or running job.
// Sets job status='cancelled'; all pending rows become 'cancelled' too.
// Returns 400 if the job is already done/failed/cancelled.

finMassRoutes.post("/jobs/:jobId/cancel", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const jobId = c.req.param("jobId");

  // Tenant isolation
  const job = await db.query.finBulkJobs.findFirst({
    where: and(
      eq(finBulkJobs.id, jobId),
      eq(finBulkJobs.tenantId, tenantId)
    ),
  });

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const cancellableStatuses = ["pending", "running"] as const;
  if (!cancellableStatuses.includes(job.status as "pending" | "running")) {
    return c.json(
      {
        error: `Nu se poate anula un job cu status '${job.status}'.`,
        code: "JOB_NOT_CANCELLABLE",
      },
      400
    );
  }

  // Cancel all pending rows
  await db
    .update(finBulkRows)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(finBulkRows.jobId, jobId),
        eq(finBulkRows.status, "pending")
      )
    );

  // Mark job as cancelled
  await db
    .update(finBulkJobs)
    .set({
      status: "cancelled",
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(finBulkJobs.id, jobId));

  return c.json({ cancelled: true }, 200);
});

// ─── Notification helper ──────────────────────────────────────────────────────
// MASS-004: Insert an in-app notification when a bulk job transitions to done/failed.

async function sendJobCompletionNotification(
  jobId: string,
  tenantId: string,
  recipientUserId: string
): Promise<void> {
  const job = await db.query.finBulkJobs.findFirst({
    where: eq(finBulkJobs.id, jobId),
  });
  if (!job) return;

  const statusLabel =
    job.status === "done" ? "finalizat cu succes" : "finalizat cu erori";
  const body = `Job ${job.jobType} ${statusLabel}: ${job.successRows}/${job.totalRows} rânduri procesate cu succes.`;

  await db.insert(inAppNotifications).values({
    tenantId,
    recipientUserId,
    payload: { body },
    kind: "system",
  });
}

// ─── POST /import/parties ─────────────────────────────────────────────────────

/**
 * Import clients/suppliers from CSV multipart upload.
 * Expects a multipart/form-data body with a "file" field containing CSV text.
 * Returns { jobId, totalRows } immediately; processing is async.
 *
 * CSV headers (first row): kind,name,country,idno,iban,address,city,email,phone
 */
finMassRoutes.post("/import/parties", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  let csvText: string;
  try {
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return c.json({ error: "Missing file field in multipart form" }, 400);
      }
      csvText = await (file as File).text();
    } else {
      // Also accept raw CSV text body (for programmatic use)
      csvText = await c.req.text();
    }
  } catch {
    return c.json({ error: "Failed to read request body" }, 400);
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return c.json({ error: "CSV must have a header row and at least one data row" }, 400);
  }

  const [headers, ...dataLines] = lines;
  const totalRows = dataLines.length;

  // Create bulk job
  const [job] = await db
    .insert(finBulkJobs)
    .values({
      tenantId,
      jobType: "import_parties",
      status: "pending",
      totalRows,
      meta: { fileName: "parties.csv" },
      createdBy: user.id,
    })
    .returning();

  // Create one row per CSV data line
  await db.insert(finBulkRows).values(
    dataLines.map((line, i) => ({
      jobId: job.id,
      rowIndex: i,
      externalRef: null,
      meta: { csv_line: line, csv_headers: headers } as unknown as Record<string, unknown>,
    }))
  );

  // Run async
  const processor = makePartyImportProcessor(tenantId);
  const partyCreatorId = user.id;
  setImmediate(async () => {
    try {
      await runBulkJob(job.id, processor);
      // MASS-004: notify creator on completion
      await sendJobCompletionNotification(job.id, tenantId, partyCreatorId);
    } catch (err) {
      console.error(`[finMass] party import job ${job.id} failed:`, err);
    }
  });

  return c.json({ jobId: job.id, totalRows }, 200);
});

// ─── POST /import/spend ───────────────────────────────────────────────────────

/**
 * Import expense records from CSV multipart upload.
 * Expects a multipart/form-data body with a "file" field containing CSV text.
 * Returns { jobId, totalRows } immediately; processing is async.
 *
 * CSV headers: category,amount_cents,currency,vat_deductible,description,vendor_name,expense_date,reference
 */
finMassRoutes.post("/import/spend", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  let csvText: string;
  try {
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return c.json({ error: "Missing file field in multipart form" }, 400);
      }
      csvText = await (file as File).text();
    } else {
      csvText = await c.req.text();
    }
  } catch {
    return c.json({ error: "Failed to read request body" }, 400);
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return c.json({ error: "CSV must have a header row and at least one data row" }, 400);
  }

  const [headers, ...dataLines] = lines;
  const totalRows = dataLines.length;

  // Create bulk job
  const [job] = await db
    .insert(finBulkJobs)
    .values({
      tenantId,
      jobType: "import_spend",
      status: "pending",
      totalRows,
      meta: { fileName: "spend.csv" },
      createdBy: user.id,
    })
    .returning();

  // Create one row per CSV data line, storing created_by in meta for the processor
  await db.insert(finBulkRows).values(
    dataLines.map((line, i) => ({
      jobId: job.id,
      rowIndex: i,
      externalRef: null,
      meta: {
        csv_line: line,
        csv_headers: headers,
        created_by: user.id,
      } as unknown as Record<string, unknown>,
    }))
  );

  // Run async
  const processor = makeSpendImportProcessor(tenantId);
  const spendCreatorId = user.id;
  setImmediate(async () => {
    try {
      await runBulkJob(job.id, processor);
      // MASS-004: notify creator on completion
      await sendJobCompletionNotification(job.id, tenantId, spendCreatorId);
    } catch (err) {
      console.error(`[finMass] spend import job ${job.id} failed:`, err);
    }
  });

  return c.json({ jobId: job.id, totalRows }, 200);
});
