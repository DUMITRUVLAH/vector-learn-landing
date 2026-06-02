/**
 * DIPLOMA-803 — Certificate Issue Routes
 *
 * POST /api/certificates/issue       — issue (upsert) a single certificate, return token
 * POST /api/certificates/issue-bulk  — issue (upsert) multiple certificates, return [{ certificateId, token }]
 *
 * Both endpoints are tenant-safe via requireAuth.
 * Upsert on (tenantId, certificateId) — same cert re-issued keeps same token.
 *
 * §3.5.1 portability: no raw .execute().rows — use query builder with Array.isArray guard.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { issuedCertificates } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const certificatesIssueRoutes = new Hono<{ Variables: AuthVariables }>();

certificatesIssueRoutes.use("*", requireAuth);

// ─── Single issue ─────────────────────────────────────────────────────────────

const issueSchema = z.object({
  certificateId: z.string().min(1).max(100),
  cohortId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  participantName: z.string().min(1).max(300),
  courseName: z.string().min(1).max(300),
  edition: z.string().max(100).optional().nullable(),
  mentorName: z.string().max(200).optional().nullable(),
  completionDate: z.string().optional().nullable(), // YYYY-MM-DD
});

certificatesIssueRoutes.post(
  "/issue",
  zValidator("json", issueSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Upsert: if (tenantId, certificateId) exists, update fields; keep token.
    const existing = await db
      .select({ id: issuedCertificates.id, verificationToken: issuedCertificates.verificationToken })
      .from(issuedCertificates)
      .where(
        and(
          eq(issuedCertificates.tenantId, user.tenantId),
          eq(issuedCertificates.certificateId, body.certificateId)
        )
      );

    const existingList = Array.isArray(existing)
      ? existing
      : (existing as unknown as { rows: typeof existing }).rows ?? existing;

    if (existingList.length > 0) {
      // Update fields but KEEP verificationToken (stable, idempotent)
      const row = existingList[0];
      await db
        .update(issuedCertificates)
        .set({
          participantName: body.participantName,
          courseName: body.courseName,
          edition: body.edition ?? null,
          mentorName: body.mentorName ?? null,
          completionDate: body.completionDate ?? null,
          cohortId: body.cohortId ?? null,
          templateId: body.templateId ?? null,
        })
        .where(
          and(
            eq(issuedCertificates.tenantId, user.tenantId),
            eq(issuedCertificates.certificateId, body.certificateId)
          )
        );
      return c.json({
        certificateId: body.certificateId,
        verificationToken: row.verificationToken,
        reissued: true,
      });
    }

    // New insert
    const inserted = await db
      .insert(issuedCertificates)
      .values({
        tenantId: user.tenantId,
        certificateId: body.certificateId,
        cohortId: body.cohortId ?? null,
        templateId: body.templateId ?? null,
        participantName: body.participantName,
        courseName: body.courseName,
        edition: body.edition ?? null,
        mentorName: body.mentorName ?? null,
        completionDate: body.completionDate ?? null,
      })
      .returning({
        id: issuedCertificates.id,
        verificationToken: issuedCertificates.verificationToken,
      });

    const insertedList = Array.isArray(inserted)
      ? inserted
      : (inserted as unknown as { rows: typeof inserted }).rows ?? inserted;

    const newRow = insertedList[0];
    if (!newRow) return c.json({ error: "insert_failed" }, 500);

    return c.json(
      {
        certificateId: body.certificateId,
        verificationToken: newRow.verificationToken,
        reissued: false,
      },
      201
    );
  }
);

// ─── Bulk issue ───────────────────────────────────────────────────────────────

const issueBulkSchema = z.object({
  cohortId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  courseName: z.string().min(1).max(300),
  edition: z.string().max(100).optional().nullable(),
  mentorName: z.string().max(200).optional().nullable(),
  completionDate: z.string().optional().nullable(),
  participants: z.array(
    z.object({
      certificateId: z.string().min(1).max(100),
      participantName: z.string().min(1).max(300),
    })
  ).min(1).max(500),
});

certificatesIssueRoutes.post(
  "/issue-bulk",
  zValidator("json", issueBulkSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Deduplicate incoming list on certificateId
    const seen = new Set<string>();
    const deduped = body.participants.filter((p) => {
      if (seen.has(p.certificateId)) return false;
      seen.add(p.certificateId);
      return true;
    });

    const results: Array<{ certificateId: string; verificationToken: string }> = [];

    // For each participant, upsert individually (keeps tokens stable)
    // We use sequential upserts to avoid PG ON CONFLICT complexity with dynamic tokens.
    for (const p of deduped) {
      const existing = await db
        .select({ verificationToken: issuedCertificates.verificationToken })
        .from(issuedCertificates)
        .where(
          and(
            eq(issuedCertificates.tenantId, user.tenantId),
            eq(issuedCertificates.certificateId, p.certificateId)
          )
        );

      const existingList = Array.isArray(existing)
        ? existing
        : (existing as unknown as { rows: typeof existing }).rows ?? existing;

      if (existingList.length > 0) {
        await db
          .update(issuedCertificates)
          .set({
            participantName: p.participantName,
            courseName: body.courseName,
            edition: body.edition ?? null,
            mentorName: body.mentorName ?? null,
            completionDate: body.completionDate ?? null,
            cohortId: body.cohortId ?? null,
            templateId: body.templateId ?? null,
          })
          .where(
            and(
              eq(issuedCertificates.tenantId, user.tenantId),
              eq(issuedCertificates.certificateId, p.certificateId)
            )
          );
        results.push({ certificateId: p.certificateId, verificationToken: existingList[0].verificationToken });
      } else {
        const inserted = await db
          .insert(issuedCertificates)
          .values({
            tenantId: user.tenantId,
            certificateId: p.certificateId,
            cohortId: body.cohortId ?? null,
            templateId: body.templateId ?? null,
            participantName: p.participantName,
            courseName: body.courseName,
            edition: body.edition ?? null,
            mentorName: body.mentorName ?? null,
            completionDate: body.completionDate ?? null,
          })
          .returning({ verificationToken: issuedCertificates.verificationToken });

        const insertedList = Array.isArray(inserted)
          ? inserted
          : (inserted as unknown as { rows: typeof inserted }).rows ?? inserted;

        if (insertedList[0]) {
          results.push({ certificateId: p.certificateId, verificationToken: insertedList[0].verificationToken });
        }
      }
    }

    return c.json({ issued: results });
  }
);
