/**
 * COURSE-203: Promo codes routes.
 *
 * Routes:
 *   GET    /api/promo-codes                     — list all codes for tenant
 *   POST   /api/promo-codes                     — create promo code
 *   POST   /api/promo-codes/:code/validate      — validate a code (returns discount info or reason)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { promoCodes } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const promoCodeRoutes = new Hono<{ Variables: AuthVariables }>();

promoCodeRoutes.use("*", requireAuth);

const createPromoSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, "Codul poate conține litere, cifre, - și _"),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().min(1), // validated further below
  maxUses: z.number().int().min(1).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// GET /api/promo-codes — list all codes
promoCodeRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const items = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.tenantId, tenantId))
    .orderBy(promoCodes.createdAt);

  // Enrich with computed status
  const now = new Date();
  const enriched = items.map((pc) => ({
    ...pc,
    computedStatus: computeStatus(pc, now),
  }));

  return c.json({ items: enriched });
});

// POST /api/promo-codes — create a code
promoCodeRoutes.post("/", zValidator("json", createPromoSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Extra validation: percent must be 1..100, fixed must be > 0
  if (body.discountType === "percent" && body.discountValue > 100) {
    return c.json({ error: "percent_discount_max_100" }, 422);
  }

  // Code must be unique within tenant
  const existing = await db.query.promoCodes.findFirst({
    where: and(
      eq(promoCodes.tenantId, tenantId),
      eq(promoCodes.code, body.code.toUpperCase())
    ),
    columns: { id: true },
  });
  if (existing) return c.json({ error: "code_already_exists" }, 409);

  const [created] = await db
    .insert(promoCodes)
    .values({
      tenantId,
      code: body.code.toUpperCase(),
      discountType: body.discountType,
      discountValue: body.discountValue,
      maxUses: body.maxUses ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    .returning();

  return c.json(created, 201);
});

// POST /api/promo-codes/:code/validate — check if a code is usable
promoCodeRoutes.post("/:code/validate", async (c) => {
  const tenantId = c.get("user").tenantId;
  const code = c.req.param("code").toUpperCase();

  const pc = await db.query.promoCodes.findFirst({
    where: and(eq(promoCodes.tenantId, tenantId), eq(promoCodes.code, code)),
  });

  if (!pc) {
    return c.json({ valid: false, reason: "not_found" });
  }

  const now = new Date();
  const status = computeStatus(pc, now);

  if (status === "expired") {
    return c.json({ valid: false, reason: "expired" });
  }
  if (status === "exhausted") {
    return c.json({ valid: false, reason: "exhausted" });
  }
  if (status === "disabled") {
    return c.json({ valid: false, reason: "disabled" });
  }

  return c.json({
    valid: true,
    id: pc.id,
    discountType: pc.discountType,
    discountValue: pc.discountValue,
    expiresAt: pc.expiresAt?.toISOString() ?? null,
    usesLeft:
      pc.maxUses != null ? pc.maxUses - pc.usedCount : null,
  });
});

/** Compute the live status of a promo code. */
function computeStatus(
  pc: {
    status: "active" | "expired" | "exhausted" | "disabled";
    expiresAt: Date | null;
    maxUses: number | null;
    usedCount: number;
  },
  now: Date
): "active" | "expired" | "exhausted" | "disabled" {
  if (pc.status === "disabled") return "disabled";
  if (pc.expiresAt && pc.expiresAt < now) return "expired";
  if (pc.maxUses != null && pc.usedCount >= pc.maxUses) return "exhausted";
  return "active";
}
