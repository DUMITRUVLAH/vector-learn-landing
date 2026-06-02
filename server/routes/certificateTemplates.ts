/**
 * DIPLOMA-801 — Certificate Templates API
 *
 * GET    /api/certificate-templates           — list (global + per course/cohort)
 * GET    /api/certificate-templates/:id       — get one template
 * POST   /api/certificate-templates           — create template
 * PATCH  /api/certificate-templates/:id       — update template
 * DELETE /api/certificate-templates/:id       — delete template
 *
 * All endpoints are tenant-safe via requireAuth + tenantId filter.
 *
 * Backlog discovered: need POST /api/certificates/background upload endpoint
 * when object storage is available (Supabase Storage or S3).
 * For now, backgroundUrl is set manually via PATCH as an external URL.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { certificateTemplates } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const certificateTemplatesRoutes = new Hono<{ Variables: AuthVariables }>();

certificateTemplatesRoutes.use("*", requireAuth);

// ─── Validators ──────────────────────────────────────────────────────────────

const fieldConfigSchema = z.object({
  x: z.number(),
  y: z.number(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidth: z.number().optional(),
  size: z.number().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  courseId: z.string().uuid().optional().nullable(),
  cohortId: z.string().uuid().optional().nullable(),
  backgroundUrl: z.string().url().optional().nullable(),
  fieldsConfig: z.record(z.string(), fieldConfigSchema.optional()).optional().nullable(),
  isGlobal: z.boolean().default(false),
});

const patchSchema = createSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertOwnership(id: string, tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ id: certificateTemplates.id })
    .from(certificateTemplates)
    .where(
      and(
        eq(certificateTemplates.id, id),
        eq(certificateTemplates.tenantId, tenantId)
      )
    );
  const list =
    Array.isArray(rows)
      ? rows
      : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return list.length > 0;
}

// ─── GET /api/certificate-templates ──────────────────────────────────────────

certificateTemplatesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const courseId = c.req.query("courseId");
  const cohortId = c.req.query("cohortId");

  let rows;

  if (courseId) {
    rows = await db
      .select()
      .from(certificateTemplates)
      .where(
        and(
          eq(certificateTemplates.tenantId, user.tenantId),
          or(
            eq(certificateTemplates.isGlobal, true),
            eq(certificateTemplates.courseId, courseId)
          )
        )
      );
  } else if (cohortId) {
    rows = await db
      .select()
      .from(certificateTemplates)
      .where(
        and(
          eq(certificateTemplates.tenantId, user.tenantId),
          or(
            eq(certificateTemplates.isGlobal, true),
            eq(certificateTemplates.cohortId, cohortId)
          )
        )
      );
  } else {
    rows = await db
      .select()
      .from(certificateTemplates)
      .where(eq(certificateTemplates.tenantId, user.tenantId));
  }

  const list =
    Array.isArray(rows)
      ? rows
      : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ templates: list });
});

// ─── GET /api/certificate-templates/:id ──────────────────────────────────────

certificateTemplatesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(certificateTemplates)
    .where(
      and(
        eq(certificateTemplates.id, id),
        eq(certificateTemplates.tenantId, user.tenantId)
      )
    );
  const list =
    Array.isArray(rows)
      ? rows
      : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  if (list.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ template: list[0] });
});

// ─── POST /api/certificate-templates ─────────────────────────────────────────

certificateTemplatesRoutes.post(
  "/",
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const isGlobal = body.isGlobal || !body.courseId;

    const inserted = await db
      .insert(certificateTemplates)
      .values({
        tenantId: user.tenantId,
        name: body.name,
        courseId: body.courseId ?? null,
        cohortId: body.cohortId ?? null,
        backgroundUrl: body.backgroundUrl ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fieldsConfig: (body.fieldsConfig as any) ?? null,
        isGlobal,
      })
      .returning();

    const row =
      Array.isArray(inserted)
        ? inserted[0]
        : (inserted as unknown as { rows: typeof inserted }).rows?.[0] ?? inserted;

    return c.json({ template: row }, 201);
  }
);

// ─── PATCH /api/certificate-templates/:id ────────────────────────────────────

certificateTemplatesRoutes.patch(
  "/:id",
  zValidator("json", patchSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    if (!(await assertOwnership(id, user.tenantId))) {
      return c.json({ error: "not_found" }, 404);
    }

    const isGlobal =
      body.isGlobal !== undefined
        ? body.isGlobal
        : body.courseId !== undefined
        ? !body.courseId
        : undefined;

    const updated = await db
      .update(certificateTemplates)
      .set({
        ...body,
        ...(isGlobal !== undefined ? { isGlobal } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fieldsConfig: body.fieldsConfig as any,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(certificateTemplates.id, id),
          eq(certificateTemplates.tenantId, user.tenantId)
        )
      )
      .returning();

    const row =
      Array.isArray(updated)
        ? updated[0]
        : (updated as unknown as { rows: typeof updated }).rows?.[0];

    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ template: row });
  }
);

// ─── DELETE /api/certificate-templates/:id ───────────────────────────────────

certificateTemplatesRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!(await assertOwnership(id, user.tenantId))) {
    return c.json({ error: "not_found" }, 404);
  }

  const deleted = await db
    .delete(certificateTemplates)
    .where(
      and(
        eq(certificateTemplates.id, id),
        eq(certificateTemplates.tenantId, user.tenantId)
      )
    )
    .returning();

  const row =
    Array.isArray(deleted)
      ? deleted[0]
      : (deleted as unknown as { rows: typeof deleted }).rows?.[0];

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
