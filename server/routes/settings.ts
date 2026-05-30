/**
 * CRM-135: Settings routes for round-robin auto-assign configuration.
 *
 * GET  /api/settings/rr-assign  → { enabled, userIds, rrIndex, nextUser }
 * PATCH /api/settings/rr-assign → { enabled, userIds } — admin/manager only
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const settingsRoutes = new Hono<{ Variables: AuthVariables }>();

settingsRoutes.use("/*", requireAuth);

const rrAssignPatchSchema = z.object({
  enabled: z.boolean(),
  userIds: z.array(z.string().uuid()).max(50),
});

/** GET /api/settings/rr-assign — returns current round-robin config for the tenant */
settingsRoutes.get("/rr-assign", async (c) => {
  const { tenantId } = c.get("user");

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  const rrUserIds = Array.isArray(tenant.rrUserIds) ? tenant.rrUserIds as string[] : [];
  const rrIndex = tenant.rrIndex ?? 0;

  // Find the next user in rotation for display
  let nextUser: { id: string; name: string } | null = null;
  if (tenant.rrEnabled && rrUserIds.length > 0) {
    const nextUserId = rrUserIds[rrIndex % rrUserIds.length];
    const userRow = await db.query.users.findFirst({
      where: and(eq(users.id, nextUserId), eq(users.tenantId, tenantId)),
    });
    if (userRow) nextUser = { id: userRow.id, name: userRow.name };
  }

  return c.json({
    enabled: tenant.rrEnabled,
    userIds: rrUserIds,
    rrIndex,
    nextUser,
  });
});

/** PATCH /api/settings/rr-assign — update round-robin config; admin or manager only */
settingsRoutes.patch("/rr-assign", zValidator("json", rrAssignPatchSchema), async (c) => {
  const user = c.get("user");
  const { tenantId, role } = user;

  // Only admin and manager can configure round-robin
  if (role !== "admin" && role !== "manager") {
    return c.json({ error: "forbidden" }, 403);
  }

  const { enabled, userIds } = c.req.valid("json");

  // Validate that all provided user IDs belong to this tenant
  if (userIds.length > 0) {
    const tenantUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId));
    const tenantUserIds = new Set(tenantUsers.map((u) => u.id));
    const invalidIds = userIds.filter((id) => !tenantUserIds.has(id));
    if (invalidIds.length > 0) {
      return c.json({ error: "invalid_user_ids", invalidIds }, 400);
    }
  }

  const [updated] = await db
    .update(tenants)
    .set({
      rrEnabled: enabled,
      rrUserIds: userIds,
      // Reset index when the user list changes
      rrIndex: 0,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning({
      id: tenants.id,
      rrEnabled: tenants.rrEnabled,
      rrUserIds: tenants.rrUserIds,
      rrIndex: tenants.rrIndex,
    });

  return c.json(updated);
});
