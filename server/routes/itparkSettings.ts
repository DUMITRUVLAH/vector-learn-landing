/**
 * ITPARK-003: Settings per tenant — prag eligibilitate, toleranță, auditor
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §7
 * Mounted in server/app.ts: app.route("/api/itpark/settings", itparkSettingsRoutes)
 *
 * Routes:
 *   GET  /api/itpark/settings  → citire setări (orice user autentificat)
 *   PUT  /api/itpark/settings  → actualizare setări (admin|manager doar)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { itparkSettings } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireItparkRole } from "../lib/itparkAuth";

export const itparkSettingsRoutes = new Hono<{ Variables: AuthVariables }>();
itparkSettingsRoutes.use("*", requireAuth);

const putSettingsSchema = z.object({
  eligibilityThresholdPct: z.number().min(0).max(100).optional(),
  toleranceMonths: z.number().int().min(0).max(12).optional(),
  defaultCurrency: z.string().max(10).optional(),
  defaultAuditFirm: z.string().max(255).nullable().optional(),
  auditorUserId: z.string().uuid().nullable().optional(),
});

// GET /api/itpark/settings
itparkSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");

  let settings = await db.query.itparkSettings.findFirst({
    where: eq(itparkSettings.tenantId, user.tenantId),
  });

  // Dacă nu există setări → returnăm valorile default
  if (!settings) {
    return c.json({
      settings: {
        id: null,
        tenantId: user.tenantId,
        eligibilityThresholdPct: "70.00",
        toleranceMonths: 2,
        defaultCurrency: "MDL",
        defaultAuditFirm: null,
        auditorUserId: null,
        createdAt: null,
        updatedAt: null,
      },
    });
  }

  return c.json({ settings });
});

// PUT /api/itpark/settings
itparkSettingsRoutes.put(
  "/",
  zValidator("json", putSettingsSchema),
  async (c) => {
    // Doar admin/manager pot modifica setările
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const body = c.req.valid("json");

    const existing = await db.query.itparkSettings.findFirst({
      where: eq(itparkSettings.tenantId, user.tenantId),
    });

    if (existing) {
      // Update — build typed partial object
      const updateData: {
        updatedAt: Date;
        eligibilityThresholdPct?: string;
        toleranceMonths?: number;
        defaultCurrency?: string;
        defaultAuditFirm?: string | null;
        auditorUserId?: string | null;
      } = { updatedAt: new Date() };
      if (body.eligibilityThresholdPct !== undefined) {
        updateData.eligibilityThresholdPct = String(body.eligibilityThresholdPct);
      }
      if (body.toleranceMonths !== undefined) updateData.toleranceMonths = body.toleranceMonths;
      if (body.defaultCurrency !== undefined) updateData.defaultCurrency = body.defaultCurrency;
      if ("defaultAuditFirm" in body) updateData.defaultAuditFirm = body.defaultAuditFirm ?? null;
      if ("auditorUserId" in body) updateData.auditorUserId = body.auditorUserId ?? null;

      const [updated] = await db
        .update(itparkSettings)
        .set(updateData)
        .where(eq(itparkSettings.tenantId, user.tenantId))
        .returning();

      return c.json({ settings: updated });
    } else {
      // Insert
      const insertData = {
        tenantId: user.tenantId,
        eligibilityThresholdPct: body.eligibilityThresholdPct !== undefined
          ? String(body.eligibilityThresholdPct)
          : "70.00",
        toleranceMonths: body.toleranceMonths ?? 2,
        defaultCurrency: body.defaultCurrency ?? "MDL",
        defaultAuditFirm: body.defaultAuditFirm ?? null,
        auditorUserId: body.auditorUserId ?? null,
      };

      const [created] = await db.insert(itparkSettings).values(insertData).returning();
      return c.json({ settings: created }, 201);
    }
  }
);
