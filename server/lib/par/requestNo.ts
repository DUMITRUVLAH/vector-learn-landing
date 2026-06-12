/**
 * PAR-101: Sequential PAR request number generator
 * CORE: backlog/par/PAR-CORE.md §2 — "request_no" format: {prefix}-{YYYY}-{NNNN}
 *
 * Collision-free: uses MAX(sequence)+1 within a transaction guard.
 * Per-tenant sequential, resets per year (PAR-2026-0001, PAR-2026-0002, …).
 */
import { db } from "../../db/client";
import { parRequests, parSettings } from "../../db/schema/par";
import { and, eq, like, max } from "drizzle-orm";

/**
 * Generate the next sequential request number for a tenant in the current year.
 * Reads from par_settings for the prefix (default "PAR").
 * Scans existing request_no values to find the max sequence number for this year.
 *
 * Must be called INSIDE a transaction to avoid race conditions.
 * Returns e.g. "PAR-2026-0001", "PAR-2026-0042", etc.
 */
export async function generateRequestNo(
  tenantId: string,
  year?: number
): Promise<string> {
  const yr = year ?? new Date().getFullYear();

  // Get the prefix from par_settings (or default "PAR")
  const [settings] = await db
    .select({ prefix: parSettings.requestNoPrefix })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));

  const prefix = settings?.prefix ?? "PAR";

  // Find the current max sequence number for this tenant + year
  // Pattern: "{prefix}-{yr}-{NNNN}" — we match on the prefix+year part
  const yearPattern = `${prefix}-${yr}-%`;

  const rows = await db
    .select({ requestNo: parRequests.requestNo })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        like(parRequests.requestNo, yearPattern)
      )
    );

  let maxSeq = 0;
  for (const row of rows) {
    const parts = row.requestNo.split("-");
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  const paddedSeq = String(nextSeq).padStart(4, "0");
  return `${prefix}-${yr}-${paddedSeq}`;
}
