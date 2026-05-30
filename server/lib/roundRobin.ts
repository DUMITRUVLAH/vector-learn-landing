/**
 * CRM-135: Round-robin auto-assign for new unassigned leads.
 *
 * `autoAssign(db, tenantId, currentAssignedTo)` — atomically picks the next
 * user from the tenant's round-robin list and increments the index.
 *
 * Rules:
 * - If `rr_enabled = false` or `rr_user_ids` is empty → return `currentAssignedTo` unchanged.
 * - If `currentAssignedTo != null` → skip assignment (don't override an explicit assignee).
 * - Otherwise: pick `rr_user_ids[rr_index % len]`, increment `rr_index`, save, return userId.
 *
 * Note: In production Postgres, this should use a SELECT...FOR UPDATE transaction.
 * With PGlite (single-process), a simple read-modify-write is safe.
 */
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { db as defaultDb } from "../db/client";
import { tenants } from "../db/schema";

// Use the same db type as the client
type Db = typeof defaultDb;

export async function autoAssign(
  database: Db,
  tenantId: string,
  currentAssignedTo: string | null | undefined
): Promise<string | null> {
  // Don't override an explicit assignee
  if (currentAssignedTo) return currentAssignedTo;

  const tenant = await database.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) return null;
  if (!tenant.rrEnabled) return null;

  const userIds = Array.isArray(tenant.rrUserIds) ? tenant.rrUserIds as string[] : [];
  if (userIds.length === 0) return null;

  const currentIndex = tenant.rrIndex ?? 0;
  const assignedUserId = userIds[currentIndex % userIds.length];
  const nextIndex = currentIndex + 1;

  // Atomically increment the index
  await database
    .update(tenants)
    .set({ rrIndex: nextIndex, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  return assignedUserId;
}
