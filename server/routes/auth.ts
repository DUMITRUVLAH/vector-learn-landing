import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../db/client";
import { tenants, users, sessions, passwordResetTokens, twoFactorSettings } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, revokeSession, SESSION_COOKIE } from "../auth/session";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { twoFactorRoutes } from "./auth/twoFactor";
import { sessionMgmtRoutes } from "./auth/sessions";
import {
  getGoogleConfig,
  generateState,
  generateCodeVerifier,
  codeChallengeFromVerifier,
  buildAuthUrl,
  exchangeCode,
  fetchUserInfo,
} from "../auth/google";

const signupSchema = z.object({
  tenantName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  name: z.string().min(2).max(200),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
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

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
  const existingEmail = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (existingEmail) {
    return c.json({ error: "email_taken" }, 409);
  }

  let slug = slugify(body.tenantName) || `org-${Math.random().toString(36).slice(2, 8)}`;
  let attempt = 0;
  while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
    attempt += 1;
    slug = `${slugify(body.tenantName)}-${attempt}`;
    if (attempt > 50) return c.json({ error: "slug_collision" }, 500);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({ name: body.tenantName, slug, plan: "starter" })
    .returning();

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: body.email,
      passwordHash,
      name: body.name,
      role: "admin",
    })
    .returning();

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, institutionType: tenant.institutionType },
  });
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const user = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (!user) {
    return c.json({ error: "invalid_credentials" }, 401);
  }
  // Google-only accounts have no local password hash — they must use Google
  // sign-in. Return the generic error to avoid leaking which accounts exist.
  if (!user.passwordHash) {
    return c.json({ error: "invalid_credentials" }, 401);
  }
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 500);

  // AUTH-004: check if 2FA is enabled for this user
  const tfRow = await db.query.twoFactorSettings.findFirst({
    where: eq(twoFactorSettings.userId, user.id),
  });
  const has2FA = !!(tfRow && tfRow.enabledAt);

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;

  if (has2FA) {
    // Create a pending session — user must verify TOTP next
    const { token, expiresAt } = await createSession(user.id, {
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
      twoFactorPending: true,
    });
    setSessionCookie(c, token, expiresAt);
    return c.json({ requiresTwoFactor: true });
  }

  const { token, expiresAt } = await createSession(user.id, {
    ipAddress: ipAddress ?? undefined,
    userAgent: userAgent ?? undefined,
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, institutionType: tenant.institutionType },
  });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const token = c.get("sessionToken");
  await revokeSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 500);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, institutionType: tenant.institutionType },
  });
});

// AUTH-001: In-memory rate limiter for forgot-password (email → [timestamps])
const resetRateLimitMap = new Map<string, number[]>();
const RESET_LIMIT = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const attempts = (resetRateLimitMap.get(email) ?? []).filter(
    (t) => now - t < RESET_WINDOW_MS
  );
  resetRateLimitMap.set(email, attempts);
  if (attempts.length >= RESET_LIMIT) return true;
  attempts.push(now);
  resetRateLimitMap.set(email, attempts);
  return false;
}

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(200),
});

// POST /api/auth/forgot-password — generates a one-time reset token and
// sends an email (stubbed via console.log in non-production). Always returns
// 200 even if the email doesn't exist (anti-enumeration).
authRoutes.post("/forgot-password", zValidator("json", forgotPasswordSchema), async (c) => {
  const { email } = c.req.valid("json");

  if (isRateLimited(email)) {
    return c.json({ error: "too_many_requests" }, 429, {
      "Retry-After": String(Math.ceil(RESET_WINDOW_MS / 1000)),
    });
  }

  // Always respond 200 — never reveal whether the email exists.
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) return c.json({ ok: true });

  // Delete any previous unused tokens for this user.
  await db.delete(passwordResetTokens).where(
    and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt))
  );

  // Generate token: raw = 64 hex chars; stored as SHA-256 hash.
  const rawToken = randomBytes(32).toString("hex"); // 64 hex chars
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const resetLink = `${appUrl}/#/app/reset?token=${rawToken}`;

  // In production, plug in a real email provider (Resend/Postmark).
  // For now the link is written to stdout (non-sensitive in dev; reset tokens expire in 1h).
  if (process.env.NODE_ENV !== "production") {
    process.stdout.write(`[AUTH-001] Reset link for ${email}: ${resetLink}\n`);
  }

  return c.json({ ok: true });
});

// POST /api/auth/reset-password — validates the token and sets a new password.
authRoutes.post("/reset-password", zValidator("json", resetPasswordSchema), async (c) => {
  const { token, newPassword } = c.req.valid("json");

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const record = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });

  if (!record) {
    return c.json({ error: "invalid_or_expired_token" }, 400);
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password and mark token as used in one go.
  await db.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  // Invalidate all existing sessions for this user.
  await db.delete(sessions).where(eq(sessions.userId, record.userId));

  // Create a fresh session so the user is logged in immediately after reset.
  const { token: newSessionToken, expiresAt } = await createSession(record.userId);
  setSessionCookie(c, newSessionToken, expiresAt);

  return c.json({ ok: true });
});

// AUTH-003: PATCH /api/auth/profile — update current user's profile fields
const profileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional().nullable(),
  language: z.enum(["ro", "en", "ru"]).optional(),
  timezone: z.string().max(64).optional(),
  avatarUrl: z.string().url().max(2048).optional().nullable(),
});

authRoutes.patch("/profile", requireAuth, zValidator("json", profileSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Only update provided fields (partial update).
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.language !== undefined) patch.language = body.language;
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  if (body.avatarUrl !== undefined) patch.avatarUrl = body.avatarUrl;

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(users).set(patch).where(eq(users.id, user.id));
  }

  const updated = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  return c.json({
    user: {
      id: updated!.id,
      email: updated!.email,
      name: updated!.name,
      role: updated!.role,
      phone: updated!.phone,
      language: updated!.language,
      timezone: updated!.timezone,
      avatarUrl: updated!.avatarUrl,
    },
  });
});

// AUTH-003: POST /api/auth/change-password — change password (requires current password)
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

authRoutes.post("/change-password", requireAuth, zValidator("json", changePasswordSchema), async (c) => {
  const currentUser = c.get("user");
  const { currentPassword, newPassword } = c.req.valid("json");

  // Fetch fresh user (with latest passwordHash).
  const userRow = await db.query.users.findFirst({ where: eq(users.id, currentUser.id) });
  if (!userRow) return c.json({ error: "user_not_found" }, 404);

  const valid = await verifyPassword(currentPassword, userRow.passwordHash);
  if (!valid) return c.json({ error: "invalid_current_password" }, 401);

  const newPasswordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newPasswordHash, updatedAt: new Date() }).where(eq(users.id, currentUser.id));

  // Invalidate all sessions (including the current one — user must log in fresh).
  await db.delete(sessions).where(eq(sessions.userId, currentUser.id));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// AUTH-003: POST /api/auth/export-data — GDPR Art. 15 data portability
authRoutes.post("/export-data", requireAuth, async (c) => {
  const user = c.get("user");
  // In a real implementation this would queue an async job and email a ZIP.
  // For now: collect basic user data and return it directly as a JSON export.
  const userRow = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  const exportData = {
    exportedAt: new Date().toISOString(),
    user: {
      id: userRow!.id,
      email: userRow!.email,
      name: userRow!.name,
      role: userRow!.role,
      createdAt: userRow!.createdAt,
    },
    note: "Full export (including lessons, payments, notes) is queued and will be emailed within 24h.",
  };
  return c.json({ ok: true, data: exportData });
});

// AUTH-003: POST /api/auth/delete-account — GDPR Art. 17 right to erasure (soft-delete)
authRoutes.post("/delete-account", requireAuth, zValidator("json", z.object({
  password: z.string().min(1).max(200),
})), async (c) => {
  const user = c.get("user");
  const { password } = c.req.valid("json");

  const userRow = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!userRow) return c.json({ error: "user_not_found" }, 404);

  const valid = await verifyPassword(password, userRow.passwordHash);
  if (!valid) return c.json({ error: "invalid_password" }, 401);

  // Soft-delete: set deleted_at, revoke all sessions.
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));

  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, message: "Contul a fost marcat pentru ștergere. Va fi anonimizat complet în 30 de zile." });
});

// AUTH-003: POST /api/auth/cancel-delete — cancel account deletion (within 30 days)
authRoutes.post("/cancel-delete", requireAuth, async (c) => {
  const user = c.get("user");
  await db.update(users).set({ deletedAt: null }).where(eq(users.id, user.id));
  return c.json({ ok: true });
});

// Repairs seeded demo accounts that still carry the legacy "$placeholder$"
// passwordHash (rows seeded before seed.ts hashed real passwords). Fresh seeds
// no longer need this. In NON-production it runs freely (local/dev convenience).
// In production it requires the DEMO_RESET_SECRET env var to be set AND matched
// via the `x-demo-reset-secret` header, so prod's already-seeded demo row can be
// repaired once without exposing a public password-reset. It only ever touches
// rows whose hash is still the placeholder sentinel — never a real account.
authRoutes.post("/__dev__/setup-demo-password", async (c) => {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    const secret = process.env.DEMO_RESET_SECRET;
    if (!secret || c.req.header("x-demo-reset-secret") !== secret) {
      return c.json({ error: "not_available" }, 403);
    }
  }
  const passwordHash = await hashPassword("demo123456");
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.passwordHash, "$placeholder$"))
    .returning({ id: users.id });
  return c.json({ updated: updated.length, password: "demo123456" });
});

// AUTH-005: Google Sign-In (OAuth 2.0 / OIDC) ───────────────────────────────
const G_STATE_COOKIE = "vl_g_state";
const G_VERIFIER_COOKIE = "vl_g_verifier";
const G_COOKIE_PATH = "/api/auth/google";
const OAUTH_COOKIE_TTL_S = 600; // 10 min — the round-trip to Google is short

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

// GET /api/auth/google — start the flow: mint state + PKCE, then redirect.
authRoutes.get("/google", async (c) => {
  const config = getGoogleConfig();
  if (!config) {
    return c.redirect(`${appUrl()}/#/business/login?error=google_not_configured`);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFromVerifier(codeVerifier);

  const cookieOpts = {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: SECURE_COOKIES,
    path: G_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_TTL_S,
  };
  setCookie(c, G_STATE_COOKIE, state, cookieOpts);
  setCookie(c, G_VERIFIER_COOKIE, codeVerifier, cookieOpts);

  return c.redirect(buildAuthUrl(config, state, codeChallenge));
});

// GET /api/auth/google/callback — Google redirects back here with ?code&state.
authRoutes.get("/google/callback", async (c) => {
  const config = getGoogleConfig();
  if (!config) {
    return c.redirect(`${appUrl()}/#/business/login?error=google_not_configured`);
  }

  const fail = (reason: string) =>
    c.redirect(`${appUrl()}/#/business/login?error=${reason}`);

  // The user may have denied consent, or Google may send an error param.
  if (c.req.query("error")) return fail("google_denied");

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, G_STATE_COOKIE);
  const codeVerifier = getCookie(c, G_VERIFIER_COOKIE);

  // Clear the one-time cookies regardless of outcome.
  deleteCookie(c, G_STATE_COOKIE, { path: G_COOKIE_PATH });
  deleteCookie(c, G_VERIFIER_COOKIE, { path: G_COOKIE_PATH });

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return fail("google_state_mismatch");
  }

  let profile;
  try {
    const tokens = await exchangeCode(config, code, codeVerifier);
    profile = await fetchUserInfo(tokens.access_token);
  } catch {
    return fail("google_failed");
  }

  if (!profile.email || !profile.emailVerified) {
    return fail("google_email_unverified");
  }

  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("cf-connecting-ip") ??
    undefined;
  const userAgent = c.req.header("user-agent") ?? undefined;

  // 1) Already linked by Google id → straight login.
  let user = await db.query.users.findFirst({
    where: eq(users.googleId, profile.sub),
  });

  // 2) Existing account with the same email → link Google to it.
  if (!user) {
    const byEmail = await db.query.users.findFirst({
      where: eq(users.email, profile.email),
    });
    if (byEmail) {
      await db
        .update(users)
        .set({ googleId: profile.sub, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id));
      user = { ...byEmail, googleId: profile.sub };
    }
  }

  // 3) Brand-new user → create a fresh tenant + admin account (owner's choice).
  if (!user) {
    const baseName = profile.name || profile.email.split("@")[0];
    let slug = slugify(baseName) || `org-${Math.random().toString(36).slice(2, 8)}`;
    let attempt = 0;
    while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
      attempt += 1;
      slug = `${slugify(baseName)}-${attempt}`;
      if (attempt > 50) return fail("google_failed");
    }
    const [tenant] = await db
      .insert(tenants)
      // This is the Business Suite app — a new Google sign-up must land on a "business"
      // tenant, else BusinessGuardPage (/api/business/auth/me) rejects it as wrong_app
      // and bounces the user straight back to the login screen.
      .values({ name: baseName, slug, plan: "starter", appKind: "business" })
      .returning();
    const [created] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: profile.email,
        passwordHash: null,
        name: profile.name,
        role: "admin",
        googleId: profile.sub,
        authProvider: "google",
        avatarUrl: profile.picture ?? null,
      })
      .returning();
    user = created;
  }

  // Google verifies the email itself, so we skip the app's 2FA gate here and
  // issue a full session directly.
  const { token, expiresAt } = await createSession(user.id, { ipAddress, userAgent });
  setSessionCookie(c, token, expiresAt);

  return c.redirect(`${appUrl()}/#/business/fin/`);
});

// AUTH-004: mount 2FA and session-management sub-routes
authRoutes.route("/2fa", twoFactorRoutes);
authRoutes.route("/sessions", sessionMgmtRoutes);
