/**
 * PAR-003: PAR settings per tenant
 * GET/PATCH /api/par/settings — par_admin
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { parSettings } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, uploadOrgLogo } from "../lib/par/orgLogo";

export const parSettingsRoutes = new Hono<{ Variables: AuthVariables }>();
parSettingsRoutes.use("*", requireAuth);

const settingsSchema = z.object({
  microPurchaseThresholdCents: z.number().int().positive().optional(),
  defaultCurrency: z.string().length(3).optional(),
  orgLegalName: z.string().max(300).optional().nullable(),
  orgLogoUrl: z.string().url().max(1000).optional().nullable(),
  pdfHelpUrl: z.string().url().max(1000).optional().nullable(),
  requestNoPrefix: z.string().min(1).max(20).optional(),
  onboardingComplete: z.boolean().optional(),
  enforceThreeWayMatch: z.boolean().optional(),
  // VM5-19: pragul anual per prestator, în bani (MDL). 0 = regula e oprită.
  tenderThresholdCents: z.number().int().min(0).max(1_000_000_000).optional(),
});

/** GET /api/par/settings */
parSettingsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [settings] = await db
    .select()
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));

  if (!settings) {
    // Return defaults if not yet configured
    return c.json({
      microPurchaseThresholdCents: 1000000,
      defaultCurrency: "MDL",
      orgLegalName: null,
      orgLogoUrl: null,
      pdfHelpUrl: null,
      requestNoPrefix: "PAR",
      onboardingComplete: false,
      enforceThreeWayMatch: false,
      tenderThresholdCents: 0,
    });
  }

  return c.json(settings);
});

/** PATCH /api/par/settings */
parSettingsRoutes.patch(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", settingsSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    // Upsert
    const existing = await db
      .select({ id: parSettings.id })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));

    if (existing.length > 0) {
      const [row] = await db
        .update(parSettings)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(parSettings.tenantId, tenantId))
        .returning();
      return c.json(row);
    } else {
      // PARQA-012: spread the whole body over the defaults so EVERY provided field persists on the
      // first insert. The previous hand-listed value set silently dropped onboardingComplete,
      // enforceThreeWayMatch (and any future field) — a new tenant's first PATCH that set only one
      // of those created the row without it (insert-branch drift vs the update branch).
      const [row] = await db
        .insert(parSettings)
        .values({
          tenantId,
          microPurchaseThresholdCents: 1000000,
          defaultCurrency: "MDL",
          requestNoPrefix: "PAR",
          ...body,
        })
        .returning();
      return c.json(row, 201);
    }
  }
);

/**
 * POST /api/par/settings/logo — încarcă logoul organizației.
 *
 * De ce nu ajunge câmpul de URL: el cere ca omul să aibă deja fișierul găzduit undeva public.
 * Aici fișierul pleacă din calculatorul lui, ajunge în bucket-ul public `org-branding` și URL-ul
 * rezultat se scrie singur în setări — același câmp, aceeași coloană, doar că acum se poate și
 * completa. Detaliile (de ce bucket public, de ce doar PNG/JPEG) stau în `lib/par/orgLogo.ts`.
 */
parSettingsRoutes.post("/logo", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "Se aștepta un fișier (multipart/form-data)." }, 400);
  }

  const file = form.get("file") as File | null;
  if (!file) return c.json({ error: "Niciun fișier trimis." }, 400);
  if (file.size > LOGO_MAX_BYTES) {
    return c.json({ error: "Fișier prea mare (max 1 MB)." }, 413);
  }
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    // pdfmake desenează doar PNG și JPEG; un SVG acceptat aici ar dispărea tăcut de pe acte.
    return c.json({ error: "Format neacceptat. Încarcă un PNG sau un JPG." }, 415);
  }

  let logoUrl: string;
  try {
    logoUrl = await uploadOrgLogo(tenantId, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return c.json({ error: "Logoul nu a putut fi salvat. Încearcă din nou." }, 503);
  }

  // Aceeași upsert ca la PATCH: tenantul poate să nu aibă încă rândul de setări.
  const existing = await db
    .select({ id: parSettings.id })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));

  if (existing.length > 0) {
    await db
      .update(parSettings)
      .set({ orgLogoUrl: logoUrl, updatedAt: new Date() })
      .where(eq(parSettings.tenantId, tenantId));
  } else {
    await db.insert(parSettings).values({
      tenantId,
      microPurchaseThresholdCents: 1000000,
      defaultCurrency: "MDL",
      requestNoPrefix: "PAR",
      orgLogoUrl: logoUrl,
    });
  }

  return c.json({ logoUrl });
});
