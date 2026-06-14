/**
 * SPLIT-002: requireApp(kind) middleware
 *
 * Composable middleware that verifies the current session belongs to a tenant
 * with the expected `app_kind` ('learn' or 'business').
 *
 * Usage:
 *   router.use(requireAuth, requireApp('business'), myHandler)
 *
 * If the tenant's app_kind doesn't match → 403 { error: "wrong_app" }.
 * Caches the tenant on context as "tenant" for downstream handlers.
 *
 * IMPORTANT: must be applied AFTER requireAuth (needs c.get("user")).
 */
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants, type Tenant } from "../db/schema";
import type { AuthVariables } from "./requireAuth";

export type AppKind = "learn" | "business";

export type AppVariables = AuthVariables & {
  tenant: Tenant;
};

export function requireApp(kind: AppKind): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      // requireAuth should have blocked this, but guard defensively
      return c.json({ error: "unauthenticated" }, 401);
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
    });

    if (!tenant) {
      return c.json({ error: "tenant_not_found" }, 500);
    }

    if (tenant.appKind !== kind) {
      return c.json({ error: "wrong_app" }, 403);
    }

    // Cache tenant for downstream use — avoids a second DB round-trip
    c.set("tenant", tenant);
    await next();
  };
}
