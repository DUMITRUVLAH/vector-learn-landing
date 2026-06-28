/**
 * SPLIT-003: Business Suite authentication routes
 *
 * Separate login flow for Business Suite (app_kind = 'business').
 * Mounted at /api/business (see server/app.ts).
 *
 * Routes:
 *   POST /api/business/auth/login   — business login (validates app_kind)
 *   POST /api/business/auth/logout  — invalidate session
 *   GET  /api/business/auth/me      — current user info (business)
 */
import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants, users } from "../db/schema";
import { verifyPassword } from "../auth/password";
import { createSession, revokeSession, getSessionUser, SESSION_COOKIE } from "../auth/session";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { checkRateLimit, recordFailure, clearRateLimit, rateLimitKey } from "../lib/rateLimit";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

const SECURE_COOKIES = process.env.NODE_ENV === "production";

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: SECURE_COOKIES,
    path: "/",
    expires: expiresAt,
  });
}

export const businessAuthRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * POST /api/business/auth/login
 * Validates email+password AND that tenant.app_kind === 'business'.
 * Returns 403 { error: "wrong_app" } if the user belongs to a 'learn' tenant.
 */
businessAuthRoutes.post("/auth/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  // SEC-02: durable brute-force throttle, keyed by (email + IP). Check before touching the DB.
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? undefined;
  const rlKey = rateLimitKey(body.email, ip);
  const rl = await checkRateLimit(rlKey);
  if (rl.limited) {
    c.header("Retry-After", String(rl.retryAfterSec));
    return c.json({ error: "too_many_attempts", retryAfterSec: rl.retryAfterSec }, 429);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });

  if (!user || !user.passwordHash) {
    await recordFailure(rlKey);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    await recordFailure(rlKey);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 500);
  }

  // SPLIT-003: enforce Business Suite — reject CRM/learn users
  if (tenant.appKind !== "business") {
    return c.json({ error: "wrong_app" }, 403);
  }

  // SET-801: disabled accounts
  if (user.isActive === false) {
    return c.json({ error: "account_disabled" }, 401);
  }

  // Valid credentials + allowed app → clear the throttle bucket.
  await clearRateLimit(rlKey);

  const ipAddress = ip ?? null;
  const userAgent = c.req.header("user-agent") ?? null;

  const { token, expiresAt } = await createSession(user.id, {
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, appKind: tenant.appKind },
  });
});

/**
 * POST /api/business/auth/logout
 */
businessAuthRoutes.post("/auth/logout", requireAuth, async (c) => {
  const token = c.get("sessionToken");
  await revokeSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/**
 * GET /api/business/auth/me
 * Returns current user + tenant. Useful for SPA to hydrate after reload.
 */
businessAuthRoutes.get("/auth/me", requireAuth, async (c) => {
  const user = c.get("user");
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 500);

  // Optionally: also enforce app_kind here so a learn user can't GET /api/business/auth/me
  if (tenant.appKind !== "business") {
    return c.json({ error: "wrong_app" }, 403);
  }

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, appKind: tenant.appKind },
  });
});
