/**
 * INT-901: Middleware that accepts X-API-Key header as an alternative to
 * session-cookie auth. Sets the same `user` / `sessionToken` variables as
 * requireAuth so that route handlers need not change.
 *
 * Flow:
 *   1. Extract the key from the "X-API-Key" request header.
 *   2. Look up the `api_keys` row by prefix (first 8 chars).
 *   3. bcrypt compare full key against stored hash.
 *   4. If valid and not revoked → load the tenant's first admin user → set
 *      c.set("user", ...) and continue.
 *   5. Update `last_used_at` in background (fire-and-forget, don't block response).
 */

import type { Context, MiddlewareHandler } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { apiKeys, users } from "../db/schema";
import type { AuthVariables } from "./requireAuth";

const API_KEY_HEADER = "X-API-Key";

/**
 * Middleware: allow requests authenticated via X-API-Key header.
 * Suitable as a drop-in alternative or complement to requireAuth.
 */
export const requireApiKey: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const rawKey = c.req.header(API_KEY_HEADER);
  if (!rawKey || rawKey.length < 8) {
    return c.json({ error: "unauthenticated" }, 401);
  }

  const prefix = rawKey.slice(0, 8);

  // Find non-revoked key by prefix
  const keyRow = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)),
  });

  if (!keyRow) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  // Constant-time comparison against stored hash
  const valid = await bcrypt.compare(rawKey, keyRow.keyHash);
  if (!valid) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  // Load the tenant's admin user to populate AuthVariables
  const adminUser = await db.query.users.findFirst({
    where: and(eq(users.tenantId, keyRow.tenantId), eq(users.role, "admin")),
  });

  if (!adminUser) {
    // Fallback: load any user for this tenant
    const anyUser = await db.query.users.findFirst({
      where: eq(users.tenantId, keyRow.tenantId),
    });
    if (!anyUser) {
      return c.json({ error: "tenant_not_found" }, 401);
    }
    c.set("user", anyUser);
  } else {
    c.set("user", adminUser);
  }

  // Use the key id as a pseudo-session token for traceability
  c.set("sessionToken", `apikey:${keyRow.id}`);

  // Fire-and-forget: update last_used_at
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRow.id))
    .catch(() => {
      // non-critical — don't block the response
    });

  await next();
};

/**
 * Middleware that accepts EITHER session cookie OR X-API-Key header.
 * Try session first; fall back to API key.
 */
export const requireAuthOrApiKey: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  // If session cookie is present, delegate to requireAuth-style logic
  const { getCookie } = await import("hono/cookie");
  const { SESSION_COOKIE, getSessionUser } = await import("../auth/session");
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const result = await getSessionUser(token);
    if (result) {
      c.set("user", result.user);
      c.set("sessionToken", token);
      await next();
      return;
    }
  }

  // Try X-API-Key
  await requireApiKey(c, next);
};

export function getAuthUser(c: Context<{ Variables: AuthVariables }>) {
  const user = c.get("user");
  if (!user) throw new Error("requireApiKey not applied");
  return user;
}
