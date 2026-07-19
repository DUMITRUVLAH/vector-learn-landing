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
import { setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants, users, finMembers } from "../db/schema";
import { parPayers, parPayerModules, parPayerMembers } from "../db/schema/par";
import { verifyPassword, hashPassword } from "../auth/password";
import { createSession, revokeSession, SESSION_COOKIE } from "../auth/session";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

const signupSchema = z.object({
  tenantName: z.string().min(2).max(200),
  name: z.string().min(2).max(200),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

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
 * POST /api/business/auth/signup — self-serve: create a brand-new BUSINESS workspace (appKind
 * "business") with the signer as its admin, then log them in. Distinct from /api/auth/signup,
 * which mints a "learn" tenant. The new admin gets implicit par_admin, so they land in onboarding.
 */
businessAuthRoutes.post("/auth/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
  // Store + look up emails lowercased (matches the invite/Google convention) so "Bob@x" and
  // "bob@x" can't create two separate workspaces for the same person.
  const email = body.email.trim().toLowerCase();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "email_taken" }, 409);

  let slug = slugify(body.tenantName) || "org";
  let attempt = 0;
  while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
    attempt += 1;
    slug = `${slugify(body.tenantName) || "org"}-${attempt}`;
    if (attempt > 50) return c.json({ error: "slug_collision" }, 500);
  }

  const passwordHash = await hashPassword(body.password);

  // One transaction: a partial workspace (tenant with no owner/payer) is never left behind.
  // Bootstrap mirrors /api/auth/google/create-workspace so the new admin can actually use FinDesk
  // (GET /api/fin/members/me needs a fin_members row) and PAR (payer + payer membership).
  const { tenant, user } = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tenants)
      .values({ name: body.tenantName, slug, plan: "starter", appKind: "business" })
      .returning();
    const [u] = await tx
      .insert(users)
      .values({ tenantId: t.id, email, passwordHash, name: body.name, role: "admin" })
      .returning();
    const [payer] = await tx
      .insert(parPayers)
      .values({ tenantId: t.id, name: body.tenantName, legalName: body.tenantName })
      .returning();
    await tx.insert(parPayerModules).values([
      { tenantId: t.id, payerId: payer.id, moduleKey: "findesk", enabled: true, updatedByUserId: u.id },
      { tenantId: t.id, payerId: payer.id, moduleKey: "par", enabled: false, updatedByUserId: u.id },
    ]);
    await tx.insert(parPayerMembers).values({ tenantId: t.id, payerId: payer.id, userId: u.id });
    // Workspace creator is the FinDesk owner too; best-effort so a missing table never fails signup.
    try {
      await tx.insert(finMembers).values({ tenantId: t.id, userId: u.id, role: "owner" });
    } catch (e) {
      console.warn("[business/signup] fin_members owner insert skipped:", e instanceof Error ? e.message : e);
    }
    return { tenant: t, user: u };
  });

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
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
 * POST /api/business/auth/login
 * Validates email+password AND that tenant.app_kind === 'business'.
 * Returns 403 { error: "wrong_app" } if the user belongs to a 'learn' tenant.
 */
businessAuthRoutes.post("/auth/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  const user = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });

  if (!user || !user.passwordHash) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
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

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
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
