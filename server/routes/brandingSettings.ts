/**
 * SET-803: Branding settings routes.
 *
 * GET  /api/settings/branding        — get tenant logo + colors
 * PUT  /api/settings/branding        — update logo_url and/or branding_json
 * POST /api/settings/branding/logo   — upload logo as base64 (multipart/form-data)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema";
import { requireAuth, getAuthUser } from "../middleware/requireAuth";

export const brandingSettingsRoutes = new Hono();

/** Validates a CSS hex color string (#RRGGBB) */
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const brandingSchema = z.object({
  logoUrl: z.string().max(500).optional(),
  brandingJson: z
    .object({
      primaryColor: z
        .string()
        .regex(hexColorRegex, "primaryColor must be a valid #RRGGBB hex color")
        .optional(),
      accentColor: z
        .string()
        .regex(hexColorRegex, "accentColor must be a valid #RRGGBB hex color")
        .optional(),
    })
    .optional(),
});

// ─── GET /api/settings/branding ──────────────────────────────────────────────

brandingSettingsRoutes.get("/", requireAuth, async (c) => {
  const user = getAuthUser(c as never);
  const [tenant] = await db
    .select({
      logoUrl: tenants.logoUrl,
      brandingJson: tenants.brandingJson,
    })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId));

  return c.json({
    logoUrl: tenant?.logoUrl ?? null,
    brandingJson: tenant?.brandingJson ?? null,
  });
});

// ─── PUT /api/settings/branding ──────────────────────────────────────────────

brandingSettingsRoutes.put(
  "/",
  requireAuth,
  zValidator("json", brandingSchema),
  async (c) => {
    const user = getAuthUser(c as never);
    const body = c.req.valid("json");

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl;
    if (body.brandingJson !== undefined) updates.brandingJson = body.brandingJson;

    await db.update(tenants).set(updates).where(eq(tenants.id, user.tenantId));

    return c.json({ ok: true });
  }
);

// ─── POST /api/settings/branding/logo ────────────────────────────────────────

brandingSettingsRoutes.post("/logo", requireAuth, async (c) => {
  const user = getAuthUser(c as never);
  let body: FormData;
  try {
    body = await c.req.formData();
  } catch {
    return c.json({ error: "invalid_form_data" }, 400);
  }

  const file = body.get("file");
  if (!file || typeof file === "string") {
    return c.json({ error: "missing_file" }, 400);
  }

  const fileObj = file as File;

  // Validate MIME type
  const allowed = ["image/png", "image/jpeg", "image/svg+xml"];
  if (!allowed.includes(fileObj.type)) {
    return c.json({ error: "invalid_file_type" }, 400);
  }

  // Validate size (max 2MB)
  if (fileObj.size > 2 * 1024 * 1024) {
    return c.json({ error: "file_too_large" }, 400);
  }

  // Convert to base64 data URL
  const buffer = await fileObj.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const logoUrl = `data:${fileObj.type};base64,${base64}`;

  await db
    .update(tenants)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(tenants.id, user.tenantId));

  return c.json({ logoUrl });
});
