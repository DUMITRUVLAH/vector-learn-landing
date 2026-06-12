/**
 * PAR-102: Total recalculation helper for par_requests.total_estimated_cents
 * CORE: backlog/par/PAR-CORE.md §2 ("Σ line totals")
 *
 * Pure-ish: performs DB read + update but has no other side effects.
 * Called after every line item create/update/delete.
 */
import { db } from "../../db/client";
import { parRequests, parLineItems } from "../../db/schema/par";
import { and, eq, sum } from "drizzle-orm";

/**
 * Recalculates par_requests.total_estimated_cents = Σ par_line_items.line_total_cents
 * for the given PAR, and persists it.
 *
 * Returns the new total.
 * Safe to call multiple times (idempotent).
 */
export async function recalcParTotal(
  parId: string,
  tenantId: string
): Promise<number> {
  // Sum all line totals for this PAR using query builder (portability: no raw execute)
  const lines = await db
    .select({ lineTotalCents: parLineItems.lineTotalCents })
    .from(parLineItems)
    .where(
      and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId))
    );

  const total = lines.reduce((acc, l) => acc + l.lineTotalCents, 0);

  await db
    .update(parRequests)
    .set({ totalEstimatedCents: total, updatedAt: new Date() })
    .where(
      and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId))
    );

  return total;
}
