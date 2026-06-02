/**
 * SET-802: Notification preferences routes.
 *
 * GET  /api/settings/notifications — get prefs for current user (defaults=true)
 * PUT  /api/settings/notifications — update prefs in batch
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import {
  notificationPreferences,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "../db/schema/notificationPreferences";
import { requireAuth } from "../middleware/requireAuth";
import { getAuthUser } from "../middleware/requireAuth";

export const notificationSettingsRoutes = new Hono();

// ─── GET /api/settings/notifications ─────────────────────────────────────────

notificationSettingsRoutes.get("/", requireAuth, async (c) => {
  const user = getAuthUser(c as never);
  const userId = user.id;
  const tenantId = user.tenantId;

  // Fetch stored prefs
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.tenantId, tenantId)
      )
    );

  // Build map from stored rows; default = true for all categories
  const prefsMap: Record<NotificationCategory, boolean> = {
    system: true,
    marketing: true,
    alerts: true,
    lessons: true,
  };

  for (const row of rows) {
    prefsMap[row.category as NotificationCategory] = row.enabled;
  }

  // system is always true — enforce at read
  prefsMap.system = true;

  return c.json({
    preferences: Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((cat) => [cat, prefsMap[cat]])
    ),
  });
});

// ─── PUT /api/settings/notifications ─────────────────────────────────────────

const updateSchema = z.object({
  system: z.boolean().optional(),
  marketing: z.boolean().optional(),
  alerts: z.boolean().optional(),
  lessons: z.boolean().optional(),
});

notificationSettingsRoutes.put(
  "/",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const user = getAuthUser(c as never);
    const userId = user.id;
    const tenantId = user.tenantId;
    const body = c.req.valid("json");

    // system cannot be set to false
    if (body.system === false) {
      return c.json(
        { error: "system notifications cannot be disabled" },
        400
      );
    }

    // Upsert each provided category
    const updates: NotificationCategory[] = (
      Object.keys(body) as NotificationCategory[]
    ).filter((k) => body[k as keyof typeof body] !== undefined && k !== "system");

    for (const category of updates) {
      const enabled = body[category as keyof typeof body] as boolean;

      // Check if row exists
      const existing = await db
        .select({ id: notificationPreferences.id })
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.category, category as never)
          )
        );

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set({ enabled, updatedAt: new Date() })
          .where(
            and(
              eq(notificationPreferences.userId, userId),
              eq(notificationPreferences.category, category as never)
            )
          );
      } else {
        await db.insert(notificationPreferences).values({
          tenantId,
          userId,
          category: category as never,
          enabled,
        });
      }
    }

    return c.json({ ok: true });
  }
);
