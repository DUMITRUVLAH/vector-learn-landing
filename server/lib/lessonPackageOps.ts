/**
 * GAP-007: Unit deduction / restoration helpers for lesson packages.
 * Called from attendance marking routes to atomically update unitsRemaining.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "../db/client";
import { lessonPackages } from "../db/schema";
import { writeAuditLog } from "./auditLogger";

/**
 * Deduct 1 unit from the oldest active package for a student+course (FIFO).
 * Marks the package as 'exhausted' when unitsRemaining reaches 0.
 * Fire-and-forget safe — never throws to caller.
 */
export async function deductUnit(
  tenantId: string,
  studentId: string,
  courseId: string,
  lessonId: string,
  actorId: string
): Promise<void> {
  try {
    const [pkg] = await db
      .select()
      .from(lessonPackages)
      .where(
        and(
          eq(lessonPackages.tenantId, tenantId),
          eq(lessonPackages.studentId, studentId),
          eq(lessonPackages.courseId, courseId),
          eq(lessonPackages.status, "active"),
          gt(lessonPackages.unitsRemaining, 0)
        )
      )
      .orderBy(asc(lessonPackages.validFrom))
      .limit(1);

    if (!pkg) return; // no active package — silent skip

    const newRemaining = pkg.unitsRemaining - 1;
    const newStatus = newRemaining <= 0 ? "exhausted" : "active";

    await db
      .update(lessonPackages)
      .set({ unitsRemaining: newRemaining, status: newStatus, updatedAt: new Date() })
      .where(eq(lessonPackages.id, pkg.id));

    void writeAuditLog({
      tenantId,
      actorId,
      actionType: "lesson_package.unit_deducted",
      targetType: "lesson_package",
      targetId: pkg.id,
      oldValue: { unitsRemaining: pkg.unitsRemaining, status: pkg.status },
      newValue: { unitsRemaining: newRemaining, status: newStatus, lessonId },
    }).catch(() => undefined);
  } catch {
    // Deduction failure must never break attendance marking
  }
}

/**
 * Restore 1 unit to the package that was most recently deducted for a student+course.
 * Used when un-marking attendance (reverting 'present' → other).
 * Fire-and-forget safe — never throws to caller.
 */
export async function restoreUnit(
  tenantId: string,
  studentId: string,
  courseId: string,
  lessonId: string,
  actorId: string
): Promise<void> {
  try {
    // Find the most recently updated exhausted-or-active package (LIFO restore)
    const [pkg] = await db
      .select()
      .from(lessonPackages)
      .where(
        and(
          eq(lessonPackages.tenantId, tenantId),
          eq(lessonPackages.studentId, studentId),
          eq(lessonPackages.courseId, courseId)
        )
      )
      .orderBy(asc(lessonPackages.validFrom))
      .limit(1);

    if (!pkg) return;

    const newRemaining = pkg.unitsRemaining + 1;
    const newStatus =
      newRemaining > 0 && pkg.status === "exhausted" ? "active" : pkg.status;

    await db
      .update(lessonPackages)
      .set({ unitsRemaining: newRemaining, status: newStatus, updatedAt: new Date() })
      .where(eq(lessonPackages.id, pkg.id));

    void writeAuditLog({
      tenantId,
      actorId,
      actionType: "lesson_package.unit_restored",
      targetType: "lesson_package",
      targetId: pkg.id,
      oldValue: { unitsRemaining: pkg.unitsRemaining, status: pkg.status },
      newValue: { unitsRemaining: newRemaining, status: newStatus, lessonId },
    }).catch(() => undefined);
  } catch {
    // Restore failure must never break attendance marking
  }
}
