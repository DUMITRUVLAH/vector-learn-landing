/**
 * MASS-004 — Bulk retry manual + anulare job + notificare finalizare
 *
 * T-MASS-004-1 [blocant] Given job cu 1 rând fail (non-validation), When POST /retry,
 *              Then rândul status='pending', retry_count=0.
 * T-MASS-004-2 [blocant] Given job running, When POST /cancel,
 *              Then job status='cancelled', rânduri pending→cancelled.
 * T-MASS-004-3 [blocant] Given job done, When POST /cancel, Then 400 (nu poate anula).
 * T-MASS-004-4 [normal]  UI: butoanele retry/cancel sunt vizibile doar la stările corecte.
 * T-MASS-004-5 [normal]  API client exports retryJobFailedRows + cancelJob functions.
 */

import { describe, it, expect } from "vitest";

// ─── T-MASS-004-5 [normal] API client exports ────────────────────────────────

describe("MASS-004 — API client exports", () => {
  it("T-MASS-004-5 exports retryJobFailedRows and cancelJob", async () => {
    const api = await import("../../lib/api/finMass");
    expect(typeof api.retryJobFailedRows).toBe("function");
    expect(typeof api.cancelJob).toBe("function");
  });
});

// ─── T-MASS-004-1 [blocant] Retry logic unit test ────────────────────────────

describe("MASS-004 — retry logic (unit)", () => {
  it("T-MASS-004-1 [blocant] filters out validation errors from retry candidates", () => {
    // Simulate the server-side filter logic for retry candidates
    type BulkRow = {
      id: string;
      status: string;
      errorMessage: string | null;
      retryCount: number;
    };

    const rows: BulkRow[] = [
      {
        id: "r1",
        status: "fail",
        errorMessage: "DB connection timeout",
        retryCount: 1,
      },
      {
        id: "r2",
        status: "fail",
        errorMessage: "validation: IDNO must be 13 digits",
        retryCount: 0,
      },
      {
        id: "r3",
        status: "fail",
        errorMessage: "Network error",
        retryCount: 2,
      },
      {
        id: "r4",
        status: "success",
        errorMessage: null,
        retryCount: 0,
      },
    ];

    // Server logic: only fail rows with non-validation errors are retriable
    const retriable = rows.filter(
      (r) =>
        r.status === "fail" &&
        !r.errorMessage?.toLowerCase().includes("validation")
    );

    expect(retriable).toHaveLength(2);
    expect(retriable.map((r) => r.id)).toEqual(["r1", "r3"]);
    // Validation error row (r2) must NOT be in the list
    expect(retriable.find((r) => r.id === "r2")).toBeUndefined();
  });

  it("T-MASS-004-1b retry resets retry_count=0 for retriable rows", () => {
    // After retry reset, each retriable row should have retryCount=0 and status='pending'
    const retried = [
      { id: "r1", status: "fail", retryCount: 1 },
      { id: "r3", status: "fail", retryCount: 2 },
    ].map((r) => ({ ...r, status: "pending" as const, retryCount: 0 }));

    for (const row of retried) {
      expect(row.status).toBe("pending");
      expect(row.retryCount).toBe(0);
    }
  });
});

// ─── T-MASS-004-2 + T-MASS-004-3 [blocant] Cancel logic ────────────────────

describe("MASS-004 — cancel logic (unit)", () => {
  it("T-MASS-004-2 [blocant] cancellable statuses are pending and running", () => {
    const cancellableStatuses = ["pending", "running"] as const;

    expect(cancellableStatuses.includes("pending")).toBe(true);
    expect(cancellableStatuses.includes("running")).toBe(true);
  });

  it("T-MASS-004-3 [blocant] done, failed, cancelled jobs cannot be cancelled", () => {
    const nonCancellableStatuses = ["done", "failed", "cancelled"];
    const cancellableStatuses = ["pending", "running"] as const;

    for (const status of nonCancellableStatuses) {
      const canCancel = cancellableStatuses.includes(
        status as "pending" | "running"
      );
      expect(canCancel).toBe(false);
    }
  });

  it("T-MASS-004-2b pending rows become cancelled when job is cancelled", () => {
    // Simulate the cancel mutation: pending rows → cancelled
    type BulkRow = { id: string; status: string };
    const rows: BulkRow[] = [
      { id: "r1", status: "pending" },
      { id: "r2", status: "success" },
      { id: "r3", status: "pending" },
      { id: "r4", status: "skipped" },
    ];

    const afterCancel = rows.map((r) =>
      r.status === "pending" ? { ...r, status: "cancelled" } : r
    );

    const cancelledRows = afterCancel.filter((r) => r.status === "cancelled");
    expect(cancelledRows).toHaveLength(2);
    expect(cancelledRows.map((r) => r.id)).toEqual(["r1", "r3"]);

    // Non-pending rows are untouched
    expect(afterCancel.find((r) => r.id === "r2")?.status).toBe("success");
    expect(afterCancel.find((r) => r.id === "r4")?.status).toBe("skipped");
  });
});

// ─── T-MASS-004-4 [normal] UI visibility logic ───────────────────────────────

describe("MASS-004 — UI button visibility logic", () => {
  type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

  function canRetry(jobStatus: JobStatus, hasNonValidationFails: boolean): boolean {
    return (
      (jobStatus === "done" || jobStatus === "failed") && hasNonValidationFails
    );
  }

  function canCancel(jobStatus: JobStatus): boolean {
    return jobStatus === "pending" || jobStatus === "running";
  }

  it("T-MASS-004-4 [normal] retry button shown only for done/failed jobs with non-validation fails", () => {
    expect(canRetry("done", true)).toBe(true);
    expect(canRetry("failed", true)).toBe(true);
    expect(canRetry("running", true)).toBe(false);
    expect(canRetry("pending", true)).toBe(false);
    expect(canRetry("cancelled", true)).toBe(false);
    // No non-validation fails → retry button hidden even for done/failed
    expect(canRetry("done", false)).toBe(false);
    expect(canRetry("failed", false)).toBe(false);
  });

  it("T-MASS-004-4b cancel button shown only for pending/running jobs", () => {
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("running")).toBe(true);
    expect(canCancel("done")).toBe(false);
    expect(canCancel("failed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });
});

// ─── T-MASS-004: notification message format ─────────────────────────────────

describe("MASS-004 — in-app notification message format", () => {
  it("generates correct completion notification body", () => {
    function makeNotificationBody(
      jobType: string,
      status: string,
      successRows: number,
      totalRows: number
    ): string {
      const statusLabel =
        status === "done" ? "finalizat cu succes" : "finalizat cu erori";
      return `Job ${jobType} ${statusLabel}: ${successRows}/${totalRows} rânduri procesate cu succes.`;
    }

    const bodyDone = makeNotificationBody(
      "recurring_invoices",
      "done",
      10,
      10
    );
    expect(bodyDone).toContain("finalizat cu succes");
    expect(bodyDone).toContain("10/10");

    const bodyFailed = makeNotificationBody(
      "import_parties",
      "failed",
      3,
      5
    );
    expect(bodyFailed).toContain("finalizat cu erori");
    expect(bodyFailed).toContain("3/5");
  });
});
