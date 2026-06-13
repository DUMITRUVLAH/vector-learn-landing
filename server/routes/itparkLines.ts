/**
 * ITPARK-201: Revenue Lines CRUD pentru un engagement (linii Anexa 3)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2 — itpark_revenue_lines
 * Mounted in server/app.ts: app.route("/api/itpark/engagements", itparkEngagementsRoutes) → nested
 *
 * Notă: rutele sunt prefixate cu /:engagementId/lines și montate SEPARATE
 * ca /api/itpark/lines pentru a evita conflicte cu itparkEngagementsRoutes.
 *
 * Routes:
 *   GET    /api/itpark/lines?engagementId=:id → lista linii pentru un engagement
 *   POST   /api/itpark/lines                  → creare linie nouă
 *   PUT    /api/itpark/lines/:id              → editare linie
 *   DELETE /api/itpark/lines/:id             → ștergere linie
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db/client";
import { itparkRevenueLines, itparkEngagements, itparkCaemCodes } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireItparkRole } from "../lib/itparkAuth";

export const itparkLinesRoutes = new Hono<{ Variables: AuthVariables }>();
itparkLinesRoutes.use("*", requireAuth);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const lineWriteSchema = z.object({
  engagementId: z.string().uuid(),
  rowNo: z.number().int().min(0).default(0),
  clientName: z.string().min(1).max(255),
  documentRefs: z.string().nullable().optional(),
  serviceDescription: z.string().default(""),
  caemCode: z.string().min(1).max(20),
  amountCents: z.number().int().min(0),
  isEligible: z.boolean().optional(), // dacă absent → derivat din caemCode
  month: z.number().int().min(1).max(12).nullable().optional(),
});

// ─── Helper: verifică că engagement-ul aparține tenantului ──────────────────

async function getEngagement(engagementId: string, tenantId: string) {
  return db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, tenantId)
    ),
  });
}

// ─── Helper: determină isEligible din caemCode ────────────────────────────

async function resolveEligibility(caemCode: string): Promise<boolean> {
  const code = await db.query.itparkCaemCodes.findFirst({
    where: eq(itparkCaemCodes.code, caemCode),
  });
  return code?.eligible ?? false;
}

// ─── GET /?engagementId=:id — lista linii ────────────────────────────────────

itparkLinesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const engagementId = c.req.query("engagementId");

  if (!engagementId) return c.json({ error: "engagementId required" }, 400);

  // Verifică că engagement-ul există și aparține tenantului
  const eng = await getEngagement(engagementId, user.tenantId);
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  const rows = await db
    .select()
    .from(itparkRevenueLines)
    .where(
      and(
        eq(itparkRevenueLines.engagementId, engagementId),
        eq(itparkRevenueLines.tenantId, user.tenantId)
      )
    )
    .orderBy(asc(itparkRevenueLines.rowNo), asc(itparkRevenueLines.createdAt));

  return c.json({ lines: rows });
});

// ─── POST / — creare linie ────────────────────────────────────────────────────

itparkLinesRoutes.post(
  "/",
  zValidator("json", lineWriteSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const body = c.req.valid("json");

    // Verifică că engagement-ul aparține tenantului
    const eng = await getEngagement(body.engagementId, user.tenantId);
    if (!eng) return c.json({ error: "engagement not found" }, 404);

    // Derivă isEligible dacă nu e specificat explicit
    const isEligible = body.isEligible !== undefined
      ? body.isEligible
      : await resolveEligibility(body.caemCode);

    const [created] = await db
      .insert(itparkRevenueLines)
      .values({
        tenantId: user.tenantId,
        engagementId: body.engagementId,
        rowNo: body.rowNo,
        clientName: body.clientName,
        documentRefs: body.documentRefs ?? null,
        serviceDescription: body.serviceDescription,
        caemCode: body.caemCode,
        amountCents: body.amountCents,
        isEligible,
        month: body.month ?? null,
      })
      .returning();

    return c.json({ line: created }, 201);
  }
);

// ─── PUT /:id — editare linie ─────────────────────────────────────────────────

itparkLinesRoutes.put(
  "/:id",
  zValidator("json", lineWriteSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const lineId = c.req.param("id");
    const body = c.req.valid("json");

    // Verifică că engagement-ul aparține tenantului
    const eng = await getEngagement(body.engagementId, user.tenantId);
    if (!eng) return c.json({ error: "engagement not found" }, 404);

    // Verifică că linia aparține engagement-ului și tenantului
    const existing = await db.query.itparkRevenueLines.findFirst({
      where: and(
        eq(itparkRevenueLines.id, lineId),
        eq(itparkRevenueLines.engagementId, body.engagementId),
        eq(itparkRevenueLines.tenantId, user.tenantId)
      ),
    });
    if (!existing) return c.json({ error: "line not found" }, 404);

    // Derivă isEligible dacă nu e specificat explicit
    const isEligible = body.isEligible !== undefined
      ? body.isEligible
      : await resolveEligibility(body.caemCode);

    const [updated] = await db
      .update(itparkRevenueLines)
      .set({
        rowNo: body.rowNo,
        clientName: body.clientName,
        documentRefs: body.documentRefs ?? null,
        serviceDescription: body.serviceDescription,
        caemCode: body.caemCode,
        amountCents: body.amountCents,
        isEligible,
        month: body.month ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(itparkRevenueLines.id, lineId),
          eq(itparkRevenueLines.tenantId, user.tenantId)
        )
      )
      .returning();

    return c.json({ line: updated });
  }
);

// ─── DELETE /:id — ștergere linie ─────────────────────────────────────────────

itparkLinesRoutes.delete("/:id", async (c) => {
  const deny = await requireItparkRole("accountant", c);
  if (deny) return deny;

  const user = c.get("user");
  const lineId = c.req.param("id");

  const existing = await db.query.itparkRevenueLines.findFirst({
    where: and(
      eq(itparkRevenueLines.id, lineId),
      eq(itparkRevenueLines.tenantId, user.tenantId)
    ),
  });
  if (!existing) return c.json({ error: "line not found" }, 404);

  await db
    .delete(itparkRevenueLines)
    .where(
      and(
        eq(itparkRevenueLines.id, lineId),
        eq(itparkRevenueLines.tenantId, user.tenantId)
      )
    );

  return c.json({ ok: true });
});
