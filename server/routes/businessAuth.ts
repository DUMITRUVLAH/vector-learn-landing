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
import { recordLoginEvent } from "../lib/loginEvents";
import { applyDefaultsToTenant, getModuleDefaults } from "../lib/platformModules";

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

  // PLATFORM-001: ce module primește un workspace NOU e decis din Consola Platformă,
  // nu hardcodat aici. Implicitele lipsă = modul activ (fail-open, vezi lib/platformModules).
  const moduleDefaults = await getModuleDefaults();

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
    // Oglindim implicitele și la nivel de payer, ca `requireModuleEntitlement` (care verifică
    // per entitate juridică) să spună același lucru ca `tenant_modules`. Un singur set de
    // implicite, două locuri de citire — nu două sisteme concurente.
    await tx.insert(parPayerModules).values([
      { tenantId: t.id, payerId: payer.id, moduleKey: "findesk", enabled: moduleDefaults.findesk !== false, updatedByUserId: u.id },
      { tenantId: t.id, payerId: payer.id, moduleKey: "par", enabled: moduleDefaults.par !== false, updatedByUserId: u.id },
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

  // Drepturile de modul ale workspace-ului nou, din implicitele platformei.
  await applyDefaultsToTenant(tenant.id, user.id);

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;
  const { token, expiresAt } = await createSession(user.id, {
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });
  setSessionCookie(c, token, expiresAt);
  await recordLoginEvent(c, {
    email, success: true, app: "business", method: "signup",
    userId: user.id, tenantId: tenant.id,
  });

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

  // PLATFORM-001: fiecare ieșire de mai jos scrie un `login_event`. Eșecurile pe un email
  // inexistent sunt exact ce vrem să vedem în istoric (încercări repetate), deci se
  // înregistrează și ele, cu userId/tenantId null.
  const fail = async (reason: string, status: 401 | 403 | 500) => {
    await recordLoginEvent(c, {
      email: body.email, success: false, app: "business", method: "password",
      userId: user?.id ?? null, tenantId: user?.tenantId ?? null, failureReason: reason,
    });
    return c.json({ error: reason }, status);
  };

  if (!user || !user.passwordHash) {
    return fail("invalid_credentials", 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return fail("invalid_credentials", 401);
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });

  if (!tenant) {
    return fail("tenant_not_found", 500);
  }

  // SPLIT-003: enforce Business Suite — reject CRM/learn users
  if (tenant.appKind !== "business") {
    return fail("wrong_app", 403);
  }

  // SET-801: disabled accounts
  if (user.isActive === false) {
    return fail("account_disabled", 401);
  }

  // PLATFORM-001: workspace suspendat din Consola Platformă (ex. client neplătitor).
  // Nu ștergem nimic — se reactivează dintr-un singur click.
  if (tenant.status === "suspended") {
    return fail("workspace_suspended", 403);
  }

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;

  const { token, expiresAt } = await createSession(user.id, {
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });
  setSessionCookie(c, token, expiresAt);
  await recordLoginEvent(c, {
    email: user.email, success: true, app: "business", method: "password",
    userId: user.id, tenantId: tenant.id,
  });

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

  // PLATFORM-001: suspendarea trebuie să taie și sesiunile DEJA deschise, nu doar
  // login-urile viitoare — altfel un client suspendat rămâne înăuntru încă 30 de zile.
  // Shell-ul tratează 403 pe /auth/me ca „neautentificat" și redirecționează la login.
  if (tenant.status === "suspended") {
    return c.json({ error: "workspace_suspended" }, 403);
  }

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, appKind: tenant.appKind },
  });
});
