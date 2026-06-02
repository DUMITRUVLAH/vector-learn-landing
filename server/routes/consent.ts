/**
 * CONSENT-001 — API formulare de consimțământ cu e-semnătură
 *
 * Routes (montate la /api/school/consent):
 *   GET    /api/school/consent/templates
 *   POST   /api/school/consent/templates
 *   PATCH  /api/school/consent/templates/:templateId
 *   DELETE /api/school/consent/templates/:templateId
 *   GET    /api/school/consent/requests
 *   POST   /api/school/consent/requests
 *   POST   /api/school/consent/requests/:requestId/sign
 *   POST   /api/school/consent/requests/:requestId/decline
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  consentTemplates,
  consentRequests,
  students,
  studentGuardians,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const consentRoutes = new Hono<{ Variables: AuthVariables }>();

consentRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const templateCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  category: z.string().max(50).nullable().optional(),
  isActive: z.boolean().default(true),
});

const requestCreateSchema = z.object({
  templateId: z.string().uuid(),
  studentId: z.string().uuid(),
  guardianIds: z.array(z.string().uuid()).min(1).max(20),
});

const signSchema = z.object({
  name: z.string(),
});

const declineSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── GET /templates ───────────────────────────────────────────────────────────

consentRoutes.get("/templates", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select()
    .from(consentTemplates)
    .where(eq(consentTemplates.tenantId, user.tenantId))
    .limit(100);

  const templates = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ templates });
});

// ─── POST /templates ──────────────────────────────────────────────────────────

consentRoutes.post(
  "/templates",
  zValidator("json", templateCreateSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const inserted = await db
      .insert(consentTemplates)
      .values({
        tenantId: user.tenantId,
        title: body.title,
        body: body.body,
        category: body.category ?? null,
        isActive: body.isActive,
      })
      .returning();

    const template = Array.isArray(inserted)
      ? inserted[0]
      : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted[0];

    return c.json({ template }, 201);
  }
);

// ─── PATCH /templates/:templateId ────────────────────────────────────────────

consentRoutes.patch(
  "/templates/:templateId",
  zValidator("json", templateCreateSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const templateId = c.req.param("templateId");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(consentTemplates)
      .where(
        and(
          eq(consentTemplates.id, templateId),
          eq(consentTemplates.tenantId, user.tenantId)
        )
      );

    if (!existing) return c.json({ error: "not_found" }, 404);

    const updated = await db
      .update(consentTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(consentTemplates.id, templateId))
      .returning();

    const template = Array.isArray(updated)
      ? updated[0]
      : (updated as unknown as { rows: typeof updated }).rows?.[0] ?? updated[0];

    return c.json({ template });
  }
);

// ─── DELETE /templates/:templateId ───────────────────────────────────────────

consentRoutes.delete("/templates/:templateId", async (c) => {
  const user = c.get("user");
  const templateId = c.req.param("templateId");

  const [existing] = await db
    .select()
    .from(consentTemplates)
    .where(
      and(
        eq(consentTemplates.id, templateId),
        eq(consentTemplates.tenantId, user.tenantId)
      )
    );

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .delete(consentTemplates)
    .where(eq(consentTemplates.id, templateId));

  return c.body(null, 204);
});

// ─── GET /requests ────────────────────────────────────────────────────────────

consentRoutes.get("/requests", async (c) => {
  const user = c.get("user");
  const { studentId, status, templateId } = c.req.query();

  // Build filters
  const filters = [eq(consentRequests.tenantId, user.tenantId)];
  if (studentId) filters.push(eq(consentRequests.studentId, studentId));
  if (status) filters.push(eq(consentRequests.status, status));
  if (templateId) filters.push(eq(consentRequests.templateId, templateId));

  const rows = await db
    .select({
      id: consentRequests.id,
      templateId: consentRequests.templateId,
      studentId: consentRequests.studentId,
      guardianId: consentRequests.guardianId,
      status: consentRequests.status,
      signedAt: consentRequests.signedAt,
      signedByName: consentRequests.signedByName,
      declinedAt: consentRequests.declinedAt,
      declineReason: consentRequests.declineReason,
      sentAt: consentRequests.sentAt,
      createdAt: consentRequests.createdAt,
      // Joins
      templateTitle: consentTemplates.title,
      templateCategory: consentTemplates.category,
      studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
      guardianName: studentGuardians.fullName,
    })
    .from(consentRequests)
    .leftJoin(consentTemplates, eq(consentRequests.templateId, consentTemplates.id))
    .leftJoin(students, eq(consentRequests.studentId, students.id))
    .leftJoin(studentGuardians, eq(consentRequests.guardianId, studentGuardians.id))
    .where(and(...filters))
    .limit(100);

  const requests = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ requests });
});

// ─── POST /requests ───────────────────────────────────────────────────────────

consentRoutes.post(
  "/requests",
  zValidator("json", requestCreateSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Verifică că template-ul aparține tenantului
    const [template] = await db
      .select()
      .from(consentTemplates)
      .where(
        and(
          eq(consentTemplates.id, body.templateId),
          eq(consentTemplates.tenantId, user.tenantId)
        )
      );

    if (!template) return c.json({ error: "template_not_found" }, 404);

    // Verifică că studentul aparține tenantului
    const [student] = await db
      .select()
      .from(students)
      .where(
        and(
          eq(students.id, body.studentId),
          eq(students.tenantId, user.tenantId)
        )
      );

    if (!student) return c.json({ error: "student_not_found" }, 404);

    // Verifică că tutorii sunt ai elevului și ai tenantului
    const guardianRows = await db
      .select()
      .from(studentGuardians)
      .where(
        and(
          inArray(studentGuardians.id, body.guardianIds),
          eq(studentGuardians.studentId, body.studentId),
          eq(studentGuardians.tenantId, user.tenantId)
        )
      );

    const validGuardians = Array.isArray(guardianRows)
      ? guardianRows
      : (guardianRows as unknown as { rows: typeof guardianRows }).rows ?? guardianRows;

    const validGuardianIds = new Set(validGuardians.map((g) => g.id));

    let created = 0;
    let skipped = 0;

    for (const guardianId of body.guardianIds) {
      if (!validGuardianIds.has(guardianId)) {
        skipped++;
        continue;
      }

      // Verifică dacă există deja (unic pe templateId, studentId, guardianId)
      const [existing] = await db
        .select({ id: consentRequests.id })
        .from(consentRequests)
        .where(
          and(
            eq(consentRequests.templateId, body.templateId),
            eq(consentRequests.studentId, body.studentId),
            eq(consentRequests.guardianId, guardianId)
          )
        );

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(consentRequests).values({
        tenantId: user.tenantId,
        templateId: body.templateId,
        studentId: body.studentId,
        guardianId,
        status: "pending",
        sentAt: new Date(),
      });

      created++;
    }

    return c.json({ created, skipped }, 201);
  }
);

// ─── POST /requests/:requestId/sign ──────────────────────────────────────────

consentRoutes.post(
  "/requests/:requestId/sign",
  zValidator("json", signSchema),
  async (c) => {
    const user = c.get("user");
    const requestId = c.req.param("requestId");
    const body = c.req.valid("json");

    if (!body.name || body.name.trim() === "") {
      return c.json({ error: "name_required" }, 400);
    }

    const [request] = await db
      .select()
      .from(consentRequests)
      .where(
        and(
          eq(consentRequests.id, requestId),
          eq(consentRequests.tenantId, user.tenantId)
        )
      );

    if (!request) return c.json({ error: "not_found" }, 404);
    if (request.status !== "pending") {
      return c.json({ error: "already_processed" }, 409);
    }

    const updated = await db
      .update(consentRequests)
      .set({
        status: "signed",
        signedAt: new Date(),
        signedByName: body.name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(consentRequests.id, requestId))
      .returning();

    const result = Array.isArray(updated)
      ? updated[0]
      : (updated as unknown as { rows: typeof updated }).rows?.[0] ?? updated[0];

    return c.json({ request: result });
  }
);

// ─── POST /requests/:requestId/decline ───────────────────────────────────────

consentRoutes.post(
  "/requests/:requestId/decline",
  zValidator("json", declineSchema),
  async (c) => {
    const user = c.get("user");
    const requestId = c.req.param("requestId");
    const body = c.req.valid("json");

    const [request] = await db
      .select()
      .from(consentRequests)
      .where(
        and(
          eq(consentRequests.id, requestId),
          eq(consentRequests.tenantId, user.tenantId)
        )
      );

    if (!request) return c.json({ error: "not_found" }, 404);
    if (request.status !== "pending") {
      return c.json({ error: "already_processed" }, 409);
    }

    const updated = await db
      .update(consentRequests)
      .set({
        status: "declined",
        declinedAt: new Date(),
        declineReason: body.reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(consentRequests.id, requestId))
      .returning();

    const result = Array.isArray(updated)
      ? updated[0]
      : (updated as unknown as { rows: typeof updated }).rows?.[0] ?? updated[0];

    return c.json({ request: result });
  }
);
