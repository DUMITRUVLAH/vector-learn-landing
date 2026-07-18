import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../db/client";
import { tenants, users, sessions, passwordResetTokens, twoFactorSettings, finMembers } from "../db/schema";
import { parInvites, parMembers, parPayerMembers, parPayerModules, parPayers } from "../db/schema/par";
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
import { hashInviteToken } from "../lib/par/invites";
import { grantInvitePayerScope } from "../lib/par/inviteScope";
import { encrypt, decrypt } from "../lib/crypto";

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

// ──────────────────────────────────────────────────────────────────────────────
// SHELL-503: PAR invite redemption routes (public — no requireAuth)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/invite-info?token=<raw-token>
 * Returns {email, parRole, orgName} for a valid (not accepted, not expired) invite.
 * 404 if not found or already accepted, 410 if expired.
 * 404 if the inviting tenant no longer exists (P4 — deleted/dangling tenant).
 * Does NOT leak the tokenHash.
 */
authRoutes.get("/invite-info", async (c) => {
  const rawToken = c.req.query("token");
  if (!rawToken) return c.json({ error: "missing_token" }, 400);

  const tokenHash = hashInviteToken(rawToken);

  const invite = await db.query.parInvites.findFirst({
    where: eq(parInvites.tokenHash, tokenHash),
  });

  if (!invite) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  if (invite.acceptedAt !== null) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  if (invite.expiresAt < new Date()) {
    return c.json({ error: "invite_expired" }, 410);
  }

  // P4: fail explicitly if the inviting tenant was deleted.
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  });
  if (!tenant) {
    return c.json({ error: "invite_not_found" }, 404);
  }

  return c.json({
    email: invite.email,
    parRole: invite.parRole,
    orgName: tenant.name,
  });
});

/**
 * POST /api/auth/accept-invite
 * Body: {token, name, password}
 *
 * Security properties (SHELL-503 adversarial review):
 *   P1 — never mints a session without authentication. Existing users must supply
 *        their correct password; google-only accounts must use the Google path.
 *   P2 — email lookup is scoped to the invite's tenant (users.tenantId + users.email
 *        composite unique). Email always stored/compared lowercase. No cross-tenant 409.
 *   P3 — token consumption is atomic: UPDATE…WHERE accepted_at IS NULL RETURNING id
 *        inside a db.transaction(); if zero rows come back the token is already used.
 *        All writes (create user, create par_members, mark accepted) are in the txn.
 *   P4 — fails explicitly if the inviting tenant was deleted.
 *   parRole comes ONLY from the invite row, never from the request body.
 */
const acceptInviteSchema = z.object({
  token: z.string().min(1).max(256),
  name: z.string().min(2).max(200),
  // Min 8 chars consistent with /signup
  password: z.string().min(8).max(200),
});

authRoutes.post("/accept-invite", zValidator("json", acceptInviteSchema), async (c) => {
  const { token, name, password } = c.req.valid("json");
  const tokenHash = hashInviteToken(token);

  // Pre-flight: find the invite (outside txn — cheap read, lets us return clean errors
  // for "not found" vs "expired" before locking anything).
  const invite = await db.query.parInvites.findFirst({
    where: eq(parInvites.tokenHash, tokenHash),
  });

  if (!invite) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  if (invite.acceptedAt !== null) {
    return c.json({ error: "invite_not_found" }, 404);
  }
  if (invite.expiresAt < new Date()) {
    return c.json({ error: "invite_expired" }, 410);
  }

  // P4: fail if the inviting tenant was deleted.
  const inviteTenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  });
  if (!inviteTenant) {
    return c.json({ error: "invite_not_found" }, 404);
  }

  const emailLower = invite.email.toLowerCase();

  // P2: scope lookup to the invite's tenant (users unique on (tenantId, email)).
  const existingUser = await db.query.users.findFirst({
    where: and(
      eq(users.tenantId, invite.tenantId),
      eq(users.email, emailLower)
    ),
  });

  // P1: existing user MUST authenticate — we cannot mint a session for them without proof.
  if (existingUser) {
    if (!existingUser.passwordHash) {
      // Google-only account — cannot accept via password; use the Google path instead.
      return c.json({ error: "use_google_signin" }, 409);
    }
    const passwordOk = await verifyPassword(password, existingUser.passwordHash);
    if (!passwordOk) {
      return c.json({ error: "wrong_password" }, 401);
    }
  }

  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("cf-connecting-ip") ??
    undefined;
  const userAgent = c.req.header("user-agent") ?? undefined;

  // P3: wrap all mutations in a transaction + atomic token consumption.
  // The UPDATE…WHERE accepted_at IS NULL is the critical one-time gate; if another
  // concurrent request already claimed it, the RETURNING is empty → we abort.
  type UserRow = typeof users.$inferSelect;
  let targetUser!: UserRow;

  try {
    await db.transaction(async (tx) => {
      // Atomically claim the token: UPDATE only if not yet consumed.
      const claimed = await tx
        .update(parInvites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(parInvites.id, invite.id), isNull(parInvites.acceptedAt)))
        .returning({ id: parInvites.id });

      if (claimed.length === 0) {
        // Another request already claimed it (race) — treat as already used.
        throw new Error("INVITE_ALREADY_CONSUMED");
      }

      if (existingUser) {
        // Existing same-tenant user — already authenticated above.
        targetUser = existingUser;
      } else {
        // Brand-new user on the invite's tenant.
        // P2: email may exist on OTHER tenants — that's fine; composite unique allows it.
        const passwordHash = await hashPassword(password);
        const [created] = await tx
          .insert(users)
          .values({
            tenantId: invite.tenantId,
            email: emailLower,
            passwordHash,
            name,
            // NON-privileged role; PAR access is via par_members.role, not users.role.
            role: "teacher",
            authProvider: "password",
          })
          .returning();
        targetUser = created;
      }

      // Idempotent par_members insert: check-then-insert inside the txn.
      // (No unique index on the table, so no ON CONFLICT — manual guard.)
      const existingMembership = await tx.query.parMembers.findFirst({
        where: and(
          eq(parMembers.tenantId, invite.tenantId),
          eq(parMembers.userId, targetUser.id),
          eq(parMembers.role, invite.parRole)
        ),
      });
      if (!existingMembership) {
        await tx.insert(parMembers).values({
          tenantId: invite.tenantId,
          userId: targetUser.id,
          // parRole comes ONLY from the invite row — never from request body.
          role: invite.parRole,
        });
      }
      await grantInvitePayerScope(tx, invite, targetUser.id);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "INVITE_ALREADY_CONSUMED") {
      return c.json({ error: "invite_not_found" }, 404);
    }
    throw err; // unexpected — let Hono's error handler return 500
  }

  // Mint session only after the transaction has committed.
  const { token: sessionToken, expiresAt } = await createSession(targetUser.id, {
    ipAddress,
    userAgent,
  });
  setSessionCookie(c, sessionToken, expiresAt);

  return c.json({
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    },
  });
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
// SHELL-503: carries the raw invite token through the OAuth round-trip.
const G_INVITE_COOKIE = "vl_g_invite";
const G_COOKIE_PATH = "/api/auth/google";
const OAUTH_COOKIE_TTL_S = 600; // 10 min — the round-trip to Google is short

// SHELL-504: a Google sign-in that resolves to neither an existing account NOR a valid invite
// MUST NOT silently spawn a new admin tenant (that was the "everyone becomes admin" bug). Instead
// we hold the *verified* Google identity in this short-lived encrypted cookie and send the user to
// a "create a workspace or join one" choice screen (/#/business/welcome). The user only ever gets
// a tenant/role through an explicit choice. TTL is generous so they can read the screen + decide.
const G_PENDING_COOKIE = "vl_g_pending";
const G_PENDING_TTL_S = 1800; // 30 min

interface PendingGoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/** Read + decrypt the pending-Google-identity cookie. Returns null if absent/tampered/invalid. */
function readPendingGoogle(c: Parameters<typeof getCookie>[0]): PendingGoogleIdentity | null {
  const raw = getCookie(c, G_PENDING_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decrypt(raw)) as PendingGoogleIdentity;
    if (!parsed.sub || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}

// GET /api/auth/google — start the flow: mint state + PKCE, then redirect.
// SHELL-503: accept optional ?invite=<token> — stash it in a short-lived cookie
// so the callback can link the new user to the inviting tenant instead of
// creating a fresh one.
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

  // SHELL-503: if an invite token was passed as ?invite=, stash it in a cookie
  // so the callback can look it up after Google verifies the email.
  const inviteToken = c.req.query("invite");
  if (inviteToken) {
    setCookie(c, G_INVITE_COOKIE, inviteToken, cookieOpts);
  }

  return c.redirect(buildAuthUrl(config, state, codeChallenge));
});

// GET /api/auth/google/callback — Google redirects back here with ?code&state.
// SHELL-503: if a G_INVITE_COOKIE is present and the invite email matches the
// Google profile email, the new user is linked to the inviting tenant + role
// instead of creating a fresh tenant. Existing users on the same tenant get
// the par_members row idempotently. Users on a different tenant are left alone
// (single-tenant model) and proceed with normal login.
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

  // Read + clear all one-time cookies regardless of outcome.
  const inviteRawToken = getCookie(c, G_INVITE_COOKIE) ?? null;
  deleteCookie(c, G_STATE_COOKIE, { path: G_COOKIE_PATH });
  deleteCookie(c, G_VERIFIER_COOKIE, { path: G_COOKIE_PATH });
  deleteCookie(c, G_INVITE_COOKIE, { path: G_COOKIE_PATH });

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

  // SHELL-503: resolve a pending invite if one was carried through the OAuth round-trip.
  // We validate it here (tokenHash lookup, not-accepted, not-expired, email match).
  type ParInviteRow = typeof parInvites.$inferSelect;
  let resolvedInvite: ParInviteRow | null = null;
  if (inviteRawToken) {
    const inviteHash = hashInviteToken(inviteRawToken);
    const invite = await db.query.parInvites.findFirst({
      where: eq(parInvites.tokenHash, inviteHash),
    });
    if (
      invite &&
      invite.acceptedAt === null &&
      invite.expiresAt > new Date() &&
      // Security: the invite email MUST match the Google profile email (case-insensitive).
      // If they differ, ignore the invite entirely — do NOT grant a role to a different email.
      invite.email.toLowerCase() === profile.email.toLowerCase()
    ) {
      resolvedInvite = invite;
    }
    // If the invite is invalid / mismatched, we silently drop it and fall through
    // to normal Google sign-in behaviour (no error — the user still logs in).
  }

  // ── Standard Google identity resolution (cases 1 & 2) ───────────────────────

  // 1) Already linked by Google id → straight login.
  let user = await db.query.users.findFirst({
    where: eq(users.googleId, profile.sub),
  });

  // 2) Existing account with the same email → link Google to it.
  // P2: lowercase profile.email for comparison (emails stored lowercase).
  if (!user) {
    const byEmail = await db.query.users.findFirst({
      where: eq(users.email, profile.email.toLowerCase()),
    });
    if (byEmail) {
      await db
        .update(users)
        .set({ googleId: profile.sub, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id));
      user = { ...byEmail, googleId: profile.sub };
    }
  }

  // ── SHELL-503: invite-aware branching for existing users ────────────────────
  // P3 (Google path): wrap in a transaction with atomic token consumption.
  // If the token was already consumed concurrently, silently ignore (don't error —
  // the user is authenticated; just proceed with normal login without the invite role).
  if (user && resolvedInvite) {
    if (user.tenantId === resolvedInvite.tenantId) {
      // Same tenant — add par_members role + atomically consume the invite token.
      try {
        await db.transaction(async (tx) => {
          const claimed = await tx
            .update(parInvites)
            .set({ acceptedAt: new Date() })
            .where(and(eq(parInvites.id, resolvedInvite!.id), isNull(parInvites.acceptedAt)))
            .returning({ id: parInvites.id });

          if (claimed.length === 0) throw new Error("INVITE_ALREADY_CONSUMED");

          const existingMember = await tx.query.parMembers.findFirst({
            where: and(
              eq(parMembers.tenantId, resolvedInvite!.tenantId),
              eq(parMembers.userId, user!.id),
              eq(parMembers.role, resolvedInvite!.parRole)
            ),
          });
          if (!existingMember) {
            await tx.insert(parMembers).values({
              tenantId: resolvedInvite!.tenantId,
              userId: user!.id,
              role: resolvedInvite!.parRole,
            });
          }
          await grantInvitePayerScope(tx, resolvedInvite!, user!.id);
        });
      } catch (err: unknown) {
        // Silently ignore a race on the token — user is still authenticated.
        const msg = err instanceof Error ? err.message : "";
        if (msg !== "INVITE_ALREADY_CONSUMED") throw err;
      }
    }
    // Different tenant: single-tenant model — skip role-linking, proceed with normal login.
  }

  // This is the Business Suite repo, so anyone who reaches here via Google must
  // end up on a "business" tenant — otherwise BusinessGuardPage (/api/business/auth/me)
  // rejects the brand-new session as wrong_app and bounces them back to /business/login,
  // which looks exactly like "Google sign-in doesn't work". Brand-new sign-ups (case 3
  // below) already create a business tenant; here we promote the tenant of an existing
  // account that was linked above but still carries the schema default appKind "learn".
  if (user) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
    });
    if (tenant && tenant.appKind !== "business") {
      await db
        .update(tenants)
        .set({ appKind: "business", updatedAt: new Date() })
        .where(eq(tenants.id, tenant.id));
    }

    // Existing tenant admins that were never added as a FinDesk member also hit
    // "Acces restricționat" on /business/fin/ (GET /api/fin/members/me → 403).
    // If this user is the tenant admin and has no fin_members row yet, seed them
    // as owner so the workspace they administer is reachable. Non-admins are left
    // alone — they only see FinDesk once an owner adds them.
    if (user.role === "admin") {
      const existingMember = await db.query.finMembers.findFirst({
        where: and(
          eq(finMembers.tenantId, user.tenantId),
          eq(finMembers.userId, user.id)
        ),
      });
      if (!existingMember) {
        await db
          .insert(finMembers)
          .values({ tenantId: user.tenantId, userId: user.id, role: "owner" });
      }
    }
  }

  // ── Case 3: Brand-new user (no existing account by googleId or email) ────────
  if (!user) {
    // SHELL-503: if there's a valid invite, link the new user to the inviting tenant
    // instead of creating a fresh standalone tenant.
    if (resolvedInvite) {
      // P4: fail explicitly if the inviting tenant was deleted.
      const inviteTenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, resolvedInvite.tenantId),
      });
      if (!inviteTenant) return fail("google_failed");

      // Ensure the invite tenant is a business tenant (needed for BusinessGuardPage).
      if (inviteTenant.appKind !== "business") {
        await db
          .update(tenants)
          .set({ appKind: "business", updatedAt: new Date() })
          .where(eq(tenants.id, inviteTenant.id));
      }

      // P3: atomic transaction — consume token + create user + create par_members.
      // P2: store email lowercased.
      type UserRow2 = typeof users.$inferSelect;
      let inviteUser!: UserRow2;
      try {
        await db.transaction(async (tx) => {
          const claimed = await tx
            .update(parInvites)
            .set({ acceptedAt: new Date() })
            .where(and(eq(parInvites.id, resolvedInvite!.id), isNull(parInvites.acceptedAt)))
            .returning({ id: parInvites.id });

          if (claimed.length === 0) throw new Error("INVITE_ALREADY_CONSUMED");

          const [created] = await tx
            .insert(users)
            .values({
              tenantId: inviteTenant.id,
              // P2: lowercase email on every insert.
              email: profile.email.toLowerCase(),
              passwordHash: null,
              name: profile.name ?? profile.email.split("@")[0],
              // NON-privileged role — PAR access is via par_members, not users.role.
              role: "teacher",
              googleId: profile.sub,
              authProvider: "google",
              avatarUrl: profile.picture ?? null,
            })
            .returning();
          inviteUser = created;

          // Link to the inviting org's PAR module with the invited role.
          // (Fresh insert — no duplicate check needed; user was just created.)
          await tx.insert(parMembers).values({
            tenantId: inviteTenant.id,
            userId: created.id,
            role: resolvedInvite!.parRole,
          });
          await grantInvitePayerScope(tx, resolvedInvite!, created.id);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "INVITE_ALREADY_CONSUMED") return fail("google_failed");
        throw err;
      }
      user = inviteUser;

      // Issue session and redirect to PAR area (not FinDesk, since this user was invited for PAR).
      const { token, expiresAt } = await createSession(user.id, { ipAddress, userAgent });
      setSessionCookie(c, token, expiresAt);
      return c.redirect(`${appUrl()}/#/business/par`);
    }

    // SHELL-504: No existing account AND no valid invite. DO NOT silently create a new
    // admin tenant (the old behavior made every un-invited Google sign-in an admin of a
    // fresh empty workspace — looked like "I became admin / nothing happened"). Instead,
    // stash the *verified* Google identity in an encrypted cookie and send the user to a
    // choice screen where they EXPLICITLY pick "create a workspace" or "join with an invite".
    const pending: PendingGoogleIdentity = {
      sub: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name ?? profile.email.split("@")[0],
      picture: profile.picture ?? null,
    };
    setCookie(c, G_PENDING_COOKIE, encrypt(JSON.stringify(pending)), {
      httpOnly: true,
      sameSite: "Lax",
      secure: SECURE_COOKIES,
      path: "/api/auth/google",
      maxAge: G_PENDING_TTL_S,
    });
    return c.redirect(`${appUrl()}/#/business/welcome`);
  }

  // Google verifies the email itself, so we skip the app's 2FA gate here and
  // issue a full session directly.
  const { token, expiresAt } = await createSession(user.id, { ipAddress, userAgent });
  setSessionCookie(c, token, expiresAt);

  return c.redirect(`${appUrl()}/#/business/fin/`);
});

// ── SHELL-504: Google "create or join" completion (after a no-invite Google sign-in) ─────────
// The /business/welcome screen reads these. All three rely on the encrypted G_PENDING_COOKIE
// holding the Google-verified identity; without it they 401 (the user must (re)authenticate).

/** GET /api/auth/google/pending — identity to greet the user on the choice screen (or 401). */
authRoutes.get("/google/pending", async (c) => {
  const pending = readPendingGoogle(c);
  if (!pending) return c.json({ error: "no_pending_identity" }, 401);
  return c.json({ email: pending.email, name: pending.name });
});

const createWorkspaceSchema = z.object({ name: z.string().min(2).max(200).optional() });

/** POST /api/auth/google/create-workspace — EXPLICIT new-workspace creation (user becomes admin). */
authRoutes.post("/google/create-workspace", zValidator("json", createWorkspaceSchema), async (c) => {
  const pending = readPendingGoogle(c);
  if (!pending) return c.json({ error: "no_pending_identity" }, 401);
  const { name } = c.req.valid("json");

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? undefined;
  const userAgent = c.req.header("user-agent") ?? undefined;

  const baseName = (name?.trim() || pending.name || pending.email.split("@")[0]);
  let slug = slugify(baseName) || `org-${Math.random().toString(36).slice(2, 8)}`;
  let attempt = 0;
  while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
    attempt += 1;
    slug = `${slugify(baseName)}-${attempt}`;
    if (attempt > 50) return c.json({ error: "slug_exhausted" }, 500);
  }
  const [tenant] = await db
    .insert(tenants)
    // Business Suite app → new workspace must be a "business" tenant (BusinessGuardPage gate).
    .values({ name: baseName, slug, plan: "starter", appKind: "business" })
    .returning();
  const [created] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: pending.email,
      passwordHash: null,
      name: pending.name,
      role: "admin", // creator owns the workspace they explicitly created
      googleId: pending.sub,
      authProvider: "google",
      avatarUrl: pending.picture,
    })
    .returning();
  const [payer] = await db.insert(parPayers).values({
    tenantId: tenant.id,
    name: baseName,
    legalName: baseName,
  }).returning();
  await db.insert(parPayerModules).values([
    { tenantId: tenant.id, payerId: payer.id, moduleKey: "findesk", enabled: true, updatedByUserId: created.id },
    { tenantId: tenant.id, payerId: payer.id, moduleKey: "par", enabled: false, updatedByUserId: created.id },
  ]);
  await db.insert(parPayerMembers).values({ tenantId: tenant.id, payerId: payer.id, userId: created.id });
  // Workspace creator is the FinDesk owner too (else GET /api/fin/members/me 403s → "Acces
  // restricționat"). Best-effort: never fail workspace creation if the FinDesk table is absent.
  try {
    await db.insert(finMembers).values({ tenantId: tenant.id, userId: created.id, role: "owner" });
  } catch (e) {
    console.warn("[google/create-workspace] fin_members owner insert skipped:", e instanceof Error ? e.message : e);
  }

  deleteCookie(c, G_PENDING_COOKIE, { path: "/api/auth/google" });
  const { token, expiresAt } = await createSession(created.id, { ipAddress, userAgent });
  setSessionCookie(c, token, expiresAt);
  return c.json({ ok: true, redirect: "/#/business/fin/" });
});

const joinWithInviteSchema = z.object({ token: z.string().min(1).max(500) });

/** POST /api/auth/google/join — join an existing workspace from the choice screen using an invite
 *  link/token. Strict email match: the invite's email MUST equal the Google identity's email. */
authRoutes.post("/google/join", zValidator("json", joinWithInviteSchema), async (c) => {
  const pending = readPendingGoogle(c);
  if (!pending) return c.json({ error: "no_pending_identity" }, 401);
  // Accept either a raw token or a full invite URL/hash containing ?token=… .
  const rawInput = c.req.valid("json").token.trim();
  const token = (rawInput.match(/token=([^&\s]+)/)?.[1] ?? rawInput);

  const invite = await db.query.parInvites.findFirst({ where: eq(parInvites.tokenHash, hashInviteToken(token)) });
  if (!invite) return c.json({ error: "invite_not_found" }, 404);
  if (invite.acceptedAt !== null) return c.json({ error: "invite_not_found" }, 404);
  if (invite.expiresAt < new Date()) return c.json({ error: "invite_expired" }, 410);
  // Strict email match (owner's choice): the invite email must equal the verified Google email.
  if (invite.email.toLowerCase() !== pending.email.toLowerCase()) {
    return c.json({ error: "email_mismatch" }, 403);
  }
  const inviteTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, invite.tenantId) });
  if (!inviteTenant) return c.json({ error: "invite_not_found" }, 404);
  if (inviteTenant.appKind !== "business") {
    await db.update(tenants).set({ appKind: "business", updatedAt: new Date() }).where(eq(tenants.id, inviteTenant.id));
  }

  const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? undefined;
  const userAgent = c.req.header("user-agent") ?? undefined;

  type UserRow3 = typeof users.$inferSelect;
  let joinedUser!: UserRow3;
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(parInvites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(parInvites.id, invite.id), isNull(parInvites.acceptedAt)))
        .returning({ id: parInvites.id });
      if (claimed.length === 0) throw new Error("INVITE_ALREADY_CONSUMED");

      // The invite email == Google email; reuse an existing same-tenant account or create one.
      const existing = await tx.query.users.findFirst({
        where: and(eq(users.tenantId, invite.tenantId), eq(users.email, pending.email.toLowerCase())),
      });
      if (existing) {
        joinedUser = existing;
        // Link googleId if this account was created by password and is now using Google.
        if (!existing.googleId) {
          await tx.update(users).set({ googleId: pending.sub, authProvider: "google" }).where(eq(users.id, existing.id));
        }
      } else {
        const [u] = await tx
          .insert(users)
          .values({
            tenantId: invite.tenantId,
            email: pending.email.toLowerCase(),
            passwordHash: null,
            name: pending.name,
            role: "teacher", // NON-privileged; PAR access is via par_members, not users.role
            googleId: pending.sub,
            authProvider: "google",
            avatarUrl: pending.picture,
          })
          .returning();
        joinedUser = u;
      }

      const member = await tx.query.parMembers.findFirst({
        where: and(
          eq(parMembers.tenantId, invite.tenantId),
          eq(parMembers.userId, joinedUser.id),
          eq(parMembers.role, invite.parRole)
        ),
      });
      if (!member) {
        await tx.insert(parMembers).values({ tenantId: invite.tenantId, userId: joinedUser.id, role: invite.parRole });
      }
      await grantInvitePayerScope(tx, invite, joinedUser.id);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INVITE_ALREADY_CONSUMED") {
      return c.json({ error: "invite_not_found" }, 404);
    }
    throw err;
  }

  deleteCookie(c, G_PENDING_COOKIE, { path: "/api/auth/google" });
  const { token: sessionToken, expiresAt } = await createSession(joinedUser.id, { ipAddress, userAgent });
  setSessionCookie(c, sessionToken, expiresAt);
  return c.json({ ok: true, redirect: "/#/business/par" });
});

// AUTH-004: mount 2FA and session-management sub-routes
authRoutes.route("/2fa", twoFactorRoutes);
authRoutes.route("/sessions", sessionMgmtRoutes);
