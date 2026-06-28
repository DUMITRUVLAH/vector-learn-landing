/**
 * TRUST-003: FinDesk GDPR Data Portability + Anonymisation routes (FIN-CORE §1.16)
 *
 * Routes:
 *   GET  /api/fin/gdpr/export/:studentId   — GDPR Art. 20 data portability export (JSON)
 *   POST /api/fin/gdpr/anonymize-old       — GDPR Art. 5(1)(e) anonymise students inactive > N days
 *
 * Design:
 * - Tenant isolation via session.tenantId throughout.
 * - No raw .execute().rows — Drizzle query builder.
 * - Export returns JSON attachment with profile, consents, ai_audit_log.
 * - Anonymise replaces PII with GDPR removal markers (not deletes — audit trail preserved).
 * - FIN-CORE §1.16.
 */

import { Hono } from "hono";
import { eq, and, lt } from "drizzle-orm";
import { db } from "../db/client";
import { students } from "../db/schema/students";
import { consentRequests } from "../db/schema/consent";
import { aiAuditLog } from "../db/schema/aiAuditLog";
import { finDataSettings, FIN_DATA_SETTINGS_DEFAULTS } from "../db/schema/finDataSettings";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireFinRole } from "../middleware/requireFinRole";
import { writeAuditLog } from "../lib/auditLogger";

export const finGdprRoutes = new Hono<{ Variables: AuthVariables }>();

finGdprRoutes.use("*", requireAuth);

/** Client IP from proxy headers, for the audit trail. */
function clientIp(c: { req: { header: (k: string) => string | undefined } }): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
}

// ─── Helper: get retention_days_students ──────────────────────────────────────

async function getStudentRetentionDays(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ retentionDaysStudents: finDataSettings.retentionDaysStudents })
    .from(finDataSettings)
    .where(eq(finDataSettings.tenantId, tenantId))
    .limit(1);

  if (row) return row.retentionDaysStudents;

  // Upsert defaults and return default
  await db
    .insert(finDataSettings)
    .values({ tenantId, ...FIN_DATA_SETTINGS_DEFAULTS })
    .onConflictDoNothing();

  return FIN_DATA_SETTINGS_DEFAULTS.retentionDaysStudents;
}

// ─── GET /api/fin/gdpr/export/:studentId ──────────────────────────────────────

// SEC-05: exporting a data subject's PII is owner-only within the FinDesk workspace.
// The previous gate used the CRM users.role (admin/manager), which let a fin-viewer who happened
// to be a CRM admin export PII. requireFinRole checks the FinDesk membership role instead.
finGdprRoutes.get("/export/:studentId", requireFinRole("owner"), async (c) => {
  const user = c.get("user");

  const tenantId = user.tenantId;
  const studentId = c.req.param("studentId");

  // 1. Student profile
  const [studentRow] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
    .limit(1);

  if (!studentRow) {
    return c.json({ error: "student_not_found" }, 404);
  }

  // 2. Consent requests (last 200, most recent first)
  const consents = await db
    .select()
    .from(consentRequests)
    .where(eq(consentRequests.studentId, studentId))
    .limit(200);

  // 3. AI audit log entries related to this student (last 100)
  const aiLog = await db
    .select()
    .from(aiAuditLog)
    .where(
      and(
        eq(aiAuditLog.tenantId, tenantId),
        eq(aiAuditLog.entityType, "student"),
        eq(aiAuditLog.entityId, studentId)
      )
    )
    .limit(100);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    gdprBasis: "Art. 20 GDPR — dreptul la portabilitatea datelor",
    subject: "student",
    subjectId: studentId,
    profile: {
      id: studentRow.id,
      fullName: studentRow.fullName,
      phone: studentRow.phone,
      email: studentRow.email,
      parentPhone: studentRow.parentPhone,
      parentEmail: studentRow.parentEmail,
      birthDate: studentRow.birthDate,
      status: studentRow.status,
      createdAt: studentRow.createdAt,
      updatedAt: studentRow.updatedAt,
    },
    consents,
    aiLog,
  };

  const filename = `gdpr-export-${studentId}.json`;
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Content-Type", "application/json; charset=utf-8");

  return c.body(JSON.stringify(exportPayload, null, 2), 200);
});

// ─── POST /api/fin/gdpr/anonymize-old ─────────────────────────────────────────

const GDPR_REMOVED = "[GDPR_REMOVED]";

// SEC-05: mass anonymisation is irreversible — owner-only, requires an explicit confirm flag,
// and only touches ARCHIVED students (a real "no longer active" signal). The old code keyed off
// `updatedAt < cutoff`, which would wipe the PII of an ACTIVE student whose row simply hadn't been
// edited in a while. Every run is written to the audit log.
finGdprRoutes.post("/anonymize-old", requireFinRole("owner"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Explicit confirmation required for a destructive, irreversible operation.
  const body = await c.req.json<{ confirm?: boolean }>().catch(() => ({}) as { confirm?: boolean });
  if (body.confirm !== true) {
    return c.json({ error: "confirmation_required", detail: "pass { confirm: true } to run anonymisation" }, 400);
  }

  const retentionDays = await getStudentRetentionDays(tenantId);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // Only ARCHIVED students past the retention cutoff — never active/trial/paused ones.
  const oldStudents = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        eq(students.status, "archived"),
        lt(students.updatedAt, cutoff)
      )
    );

  if (oldStudents.length === 0) {
    return c.json({ anonymized: 0 }, 200);
  }

  let anonymized = 0;
  for (const { id } of oldStudents) {
    await db
      .update(students)
      .set({
        fullName: GDPR_REMOVED,
        phone: null,
        email: null,
        parentPhone: null,
        parentEmail: null,
        birthDate: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(students.id, id),
          eq(students.tenantId, tenantId)
        )
      );
    anonymized++;
  }

  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "gdpr_anonymize_old",
    targetType: "student",
    newValue: { anonymized, retentionDays, status: "archived" },
    ipAddress: clientIp(c),
  });

  return c.json({ anonymized }, 200);
});
