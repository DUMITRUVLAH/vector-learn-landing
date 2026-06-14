/**
 * MASS-002 + MASS-003: FinDesk Bulk Operations API
 *
 * Routes:
 *   POST   /api/fin/mass/recurring-invoices   — starts async job: active agreements → invoices → e-factura
 *   GET    /api/fin/mass/jobs                 — list bulk jobs for tenant (desc by created_at)
 *   GET    /api/fin/mass/jobs/:jobId          — job details + all rows
 *   POST   /api/fin/mass/import/parties       — CSV import: fin_parties (MASS-003)
 *   POST   /api/fin/mass/import/spend         — CSV import: fin_spend_entries (MASS-003)
 *
 * Design:
 * - All POST bulk-trigger routes return immediately with { jobId, totalRows }
 * - Actual processing runs async (setImmediate) — no blocking the HTTP response
 * - Tenant isolation: all queries filter by tenantId from session
 * - No raw .execute().rows — Drizzle query builder throughout
 * - FIN-CORE §1.15: job infra in fin_bulk_jobs / fin_bulk_rows
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, lte } from "drizzle-orm";
import { db } from "../db/client";
import { finBulkJobs, finBulkRows } from "../db/schema/finBulk";
import { finAgreements, finAgreementServices } from "../db/schema/finAgreements";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runBulkJob } from "../lib/finBulkRunner";
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

      setImmediate(() => {
        runBulkJob(job.id, (row) =>
          processor({ id: row.id, externalRef: row.externalRef })
        ).catch((err) => {
          console.error(`[finMass] runBulkJob failed for job ${job.id}:`, err);
        });
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
  setImmediate(() => {
    runBulkJob(job.id, processor).catch((err) => {
      console.error(`[finMass] party import job ${job.id} failed:`, err);
    });
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
  setImmediate(() => {
    runBulkJob(job.id, processor).catch((err) => {
      console.error(`[finMass] spend import job ${job.id} failed:`, err);
    });
  });

  return c.json({ jobId: job.id, totalRows }, 200);
});
