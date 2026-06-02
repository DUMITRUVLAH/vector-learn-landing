/**
 * SET-802: Locale / timezone settings per user.
 *
 * GET  /api/settings/locale  — returns { language, timezone } for current user
 * PATCH /api/settings/locale — updates language + timezone on user row
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth, getAuthUser } from "../middleware/requireAuth";
import type { AuthVariables } from "../middleware/requireAuth";

export const localeSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

const localeSchema = z.object({
  language: z.enum(["ro", "en", "ru"]).optional(),
  timezone: z.string().max(64).optional(),
});

// ─── GET /api/settings/locale ─────────────────────────────────────────────────

localeSettingsRoutes.get("/", requireAuth, async (c) => {
  const user = getAuthUser(c as never);
  const [row] = await db
    .select({ language: users.language, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, user.userId));

  return c.json({
    language: row?.language ?? "ro",
    timezone: row?.timezone ?? "Europe/Bucharest",
  });
});

// ─── PATCH /api/settings/locale ───────────────────────────────────────────────

localeSettingsRoutes.patch(
  "/",
  requireAuth,
  zValidator("json", localeSchema),
  async (c) => {
    const user = getAuthUser(c as never);
    const body = c.req.valid("json");

    const updates: { language?: string; timezone?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.language !== undefined) updates.language = body.language;
    if (body.timezone !== undefined) updates.timezone = body.timezone;

    await db.update(users).set(updates).where(eq(users.id, user.userId));

    return c.json({ ok: true, language: body.language, timezone: body.timezone });
  }
);
