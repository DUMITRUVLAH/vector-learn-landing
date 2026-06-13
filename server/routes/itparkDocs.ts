/**
 * ITPARK-501/502: itpark_packet_documents CRUD API
 * Routes:
 *   GET  /api/itpark/docs/:engagementId         — list all docs for engagement
 *   GET  /api/itpark/docs/:engagementId/:kind    — get specific doc
 *   POST /api/itpark/docs/:engagementId/:kind    — upsert doc (create or update)
 *   POST /api/itpark/docs/:engagementId/:kind/status — update status (draft|ready|exported)
 *
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 * Tenant safety: all ops scoped to user.tenantId
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { itparkPacketDocuments, itparkEngagements, itparkPacketKindEnum, itparkDocStatusEnum } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const itparkDocsRoutes = new Hono<{ Variables: AuthVariables }>();
itparkDocsRoutes.use("*", requireAuth);

/** Validate kind against enum values */
const VALID_KINDS = itparkPacketKindEnum.enumValues;
const VALID_STATUSES = itparkDocStatusEnum.enumValues;

// ─── GET /api/itpark/docs/:engagementId ──────────────────────────────────────
// List all packet documents for an engagement (all kinds)

itparkDocsRoutes.get("/:engagementId", async (c) => {
  const user = c.get("user");
  const { engagementId } = c.req.param();

  if (!/^[0-9a-f-]{36}$/i.test(engagementId)) {
    return c.json({ error: "engagementId invalid" }, 400);
  }

  // Verify engagement belongs to tenant
  const eng = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  const docs = await db
    .select()
    .from(itparkPacketDocuments)
    .where(
      and(
        eq(itparkPacketDocuments.engagementId, engagementId),
        eq(itparkPacketDocuments.tenantId, user.tenantId)
      )
    );

  return c.json({ docs });
});

// ─── GET /api/itpark/docs/:engagementId/:kind ─────────────────────────────────
// Get a specific document by kind

itparkDocsRoutes.get("/:engagementId/:kind", async (c) => {
  const user = c.get("user");
  const { engagementId, kind } = c.req.param();

  if (!/^[0-9a-f-]{36}$/i.test(engagementId)) {
    return c.json({ error: "engagementId invalid" }, 400);
  }
  if (!VALID_KINDS.includes(kind as (typeof VALID_KINDS)[number])) {
    return c.json({ error: `kind must be one of: ${VALID_KINDS.join(", ")}` }, 400);
  }

  // Verify engagement belongs to tenant
  const eng = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  const doc = await db.query.itparkPacketDocuments.findFirst({
    where: and(
      eq(itparkPacketDocuments.engagementId, engagementId),
      eq(itparkPacketDocuments.tenantId, user.tenantId),
      eq(itparkPacketDocuments.kind, kind as (typeof VALID_KINDS)[number])
    ),
  });

  return c.json({ doc: doc ?? null, engagement: eng });
});

// ─── POST /api/itpark/docs/:engagementId/:kind ────────────────────────────────
// Upsert a packet document (create or update content/status)

itparkDocsRoutes.post("/:engagementId/:kind", async (c) => {
  const user = c.get("user");
  const { engagementId, kind } = c.req.param();

  if (!/^[0-9a-f-]{36}$/i.test(engagementId)) {
    return c.json({ error: "engagementId invalid" }, 400);
  }
  if (!VALID_KINDS.includes(kind as (typeof VALID_KINDS)[number])) {
    return c.json({ error: `kind must be one of: ${VALID_KINDS.join(", ")}` }, 400);
  }

  // Verify engagement belongs to tenant
  const eng = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const { dataJson, status } = body as { dataJson?: unknown; status?: string };

  // Validate status if provided
  if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return c.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  const docKind = kind as (typeof VALID_KINDS)[number];
  const docStatus = (status ?? "draft") as (typeof VALID_STATUSES)[number];

  // Check if exists
  const existing = await db.query.itparkPacketDocuments.findFirst({
    where: and(
      eq(itparkPacketDocuments.engagementId, engagementId),
      eq(itparkPacketDocuments.tenantId, user.tenantId),
      eq(itparkPacketDocuments.kind, docKind)
    ),
  });

  let doc;
  const now = new Date();

  if (existing) {
    // Update
    const updated = await db
      .update(itparkPacketDocuments)
      .set({
        status: docStatus,
        dataJson: dataJson !== undefined ? dataJson : existing.dataJson,
        generatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(itparkPacketDocuments.id, existing.id),
          eq(itparkPacketDocuments.tenantId, user.tenantId)
        )
      )
      .returning();
    doc = updated[0];
  } else {
    // Create
    const created = await db
      .insert(itparkPacketDocuments)
      .values({
        tenantId: user.tenantId,
        engagementId,
        kind: docKind,
        status: docStatus,
        dataJson: dataJson ?? null,
        generatedAt: now,
      })
      .returning();
    doc = created[0];
  }

  return c.json({ doc });
});
