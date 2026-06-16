import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { sellerProfiles } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

/**
 * CONT-PLATA: the issuer's own company details ("beneficiar"), one per tenant.
 *   GET /api/seller-profile  → current profile (or null)
 *   PUT /api/seller-profile  → upsert
 */
export const sellerProfileRoutes = new Hono<{ Variables: AuthVariables }>();

sellerProfileRoutes.use("*", requireAuth);

const profileSchema = z.object({
  name: z.string().min(1).max(255),
  idno: z.string().max(32).optional().nullable(),
  legalForm: z.string().max(255).optional().nullable(),
  vatCode: z.string().max(32).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bankName: z.string().max(255).optional().nullable(),
  bankCode: z.string().max(32).optional().nullable(),
  contactEmail: z.string().max(255).optional().nullable(),
  contactPhone: z.string().max(64).optional().nullable(),
  defaultSeries: z.string().min(1).max(20).optional(),
  defaultVatRate: z.number().int().min(0).max(100).optional(),
});

sellerProfileRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [row] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.tenantId, tenantId))
    .limit(1);
  return c.json({ data: row ?? null });
});

sellerProfileRoutes.put("/", zValidator("json", profileSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [existing] = await db
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.tenantId, tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(sellerProfiles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(sellerProfiles.id, existing.id))
      .returning();
    return c.json({ data: updated });
  }

  const [created] = await db
    .insert(sellerProfiles)
    .values({ ...body, tenantId })
    .returning();
  return c.json({ data: created }, 201);
});
