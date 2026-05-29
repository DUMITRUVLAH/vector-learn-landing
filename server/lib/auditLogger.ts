/**
 * HR-404: Audit logger — write to audit_log table silently.
 * Import this in any route that needs to track changes.
 */
import { db } from "../db/client";
import { auditLog } from "../db/schema";

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

/** Log an audit entry — fire and forget (never throws) */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId: entry.tenantId,
      actorId: entry.actorId ?? null,
      actionType: entry.actionType,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  } catch {
    // Audit log failures should never crash the main request
  }
}
