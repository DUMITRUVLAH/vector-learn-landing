// MASS-001: FinDesk Bulk Job Runner
// Iterates fin_bulk_rows for a job, calls a processor per row,
// handles retry logic (max 3 attempts), and updates job summary on completion.
// No raw .execute().rows — all queries use the Drizzle query builder.

import { eq, and, lte } from "drizzle-orm";
import { db } from "../db/client";
import { finBulkJobs, finBulkRows } from "../db/schema/finBulk";
import type { FinBulkRow } from "../db/schema/finBulk";

const MAX_RETRY = 3;

/**
 * Result returned by a row processor.
 * - ref:   ID of the created/updated object (invoice_id, party_id, …)
 * - error: human-readable error message if the row could not be processed
 * - skip:  true when the row should be marked "skipped" (idempotent duplicate)
 */
export type ProcessorResult = {
  ref?: string;
  error?: string;
  skip?: boolean;
};

/**
 * Processor function signature.
 * Each item type provides its own processor; the runner is generic.
 */
export type RowProcessor = (row: FinBulkRow) => Promise<ProcessorResult>;

/**
 * runBulkJob — runs all pending rows of a bulk job.
 *
 * @param jobId     UUID of the fin_bulk_jobs record
 * @param processor Function that processes a single row and returns a result
 */
export async function runBulkJob(
  jobId: string,
  processor: RowProcessor
): Promise<void> {
  // 1. Mark job as running
  await db
    .update(finBulkJobs)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(finBulkJobs.id, jobId));

  try {
    // 2. Fetch all rows eligible for processing (pending OR retryable fail)
    const rows = await db
      .select()
      .from(finBulkRows)
      .where(
        and(
          eq(finBulkRows.jobId, jobId),
          // Include rows that are still pending (retry_count < MAX_RETRY)
          lte(finBulkRows.retryCount, MAX_RETRY - 1)
        )
      )
      .orderBy(finBulkRows.rowIndex);

    // Separate pending vs fail rows (fail rows with retryCount < MAX_RETRY get retried)
    const eligible = rows.filter(
      (r) => r.status === "pending" || (r.status === "fail" && r.retryCount < MAX_RETRY)
    );

    // 3. Process each row
    for (const row of eligible) {
      try {
        const result = await processor(row);

        if (result.skip) {
          // Idempotent skip — don't count as failure or success; it's a skip
          await db
            .update(finBulkRows)
            .set({
              status: "skipped",
              processedAt: new Date(),
              resultRef: result.ref ?? null,
            })
            .where(eq(finBulkRows.id, row.id));
        } else if (result.error) {
          // Processor returned an error
          const newRetryCount = row.retryCount + 1;
          const isDefinitiveFail = newRetryCount >= MAX_RETRY;

          await db
            .update(finBulkRows)
            .set({
              status: isDefinitiveFail ? "fail" : "pending",
              retryCount: newRetryCount,
              errorMessage: result.error,
              processedAt: isDefinitiveFail ? new Date() : null,
            })
            .where(eq(finBulkRows.id, row.id));
        } else {
          // Success
          await db
            .update(finBulkRows)
            .set({
              status: "success",
              resultRef: result.ref ?? null,
              errorMessage: null,
              processedAt: new Date(),
            })
            .where(eq(finBulkRows.id, row.id));
        }
      } catch (err) {
        // Unexpected processor error — treat as a retriable failure
        const newRetryCount = row.retryCount + 1;
        const isDefinitiveFail = newRetryCount >= MAX_RETRY;
        const errMsg = err instanceof Error ? err.message : String(err);

        await db
          .update(finBulkRows)
          .set({
            status: isDefinitiveFail ? "fail" : "pending",
            retryCount: newRetryCount,
            errorMessage: errMsg,
            processedAt: isDefinitiveFail ? new Date() : null,
          })
          .where(eq(finBulkRows.id, row.id));
      }
    }

    // 4. Compute summary from all rows of this job
    const allRows = await db
      .select()
      .from(finBulkRows)
      .where(eq(finBulkRows.jobId, jobId));

    const successRows = allRows.filter((r) => r.status === "success").length;
    const failRows = allRows.filter((r) => r.status === "fail").length;
    const skippedRows = allRows.filter((r) => r.status === "skipped").length;
    const pendingRows = allRows.filter((r) => r.status === "pending").length;

    // Job is "done" if no rows are still pending; "failed" if all terminal rows failed
    const allTerminal = pendingRows === 0;
    const allFailed = allTerminal && successRows === 0 && skippedRows === 0 && failRows > 0;
    const finalStatus = allTerminal ? (allFailed ? "failed" : "done") : "running";

    await db
      .update(finBulkJobs)
      .set({
        status: finalStatus,
        successRows,
        failRows,
        finishedAt: allTerminal ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(finBulkJobs.id, jobId));
  } catch (fatalErr) {
    // Fatal error in the runner itself (not a row processor)
    const errMsg =
      fatalErr instanceof Error ? fatalErr.message : String(fatalErr);

    await db
      .update(finBulkJobs)
      .set({
        status: "failed",
        errorMessage: errMsg,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(finBulkJobs.id, jobId));
  }
}
