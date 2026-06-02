/**
 * SET-801 — Team management API
 *
 * Expands the existing /api/team with:
 *   GET    /api/team            — list all team members for the tenant
 *   POST   /api/team/invite     — create an invitation token (stub email)
 *   PATCH  /api/team/:userId    — update role or status (active/disabled)
 *   POST   /api/team/accept/:token — finalize signup from invitation
 *
 * Also keeps the existing GET /api/team/members endpoint (CRM-137).
 */
import { Hono } from "hono";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/client";
import { users, userInvitations, invitations } from "../db/schema";
import { hashPassword } from "../auth/password";
import { createSession, SESSION_COOKIE } from "../auth/session";
import { setCookie } from "hono/cookie";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { userRoleEnum } from "../db/schema/users";

export const teamRoutes = new Hono<{ Variables: AuthVariables }>();

// ─── public accept-invite endpoint (no auth) ─────────────────────────────────
const acceptSchema = z.object({
  name: z.string().min(2).max(200),
  password: z.string().min(8).max(200),
});

teamRoutes.post("/accept/:token", zValidator("json", acceptSchema), async (c) => {
  const token = c.req.param("token");
  const { name, password } = c.req.valid("json");

  const [invite] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token));

  if (!invite) return c.json({ error: "invalid_token" }, 404);
  if (invite.acceptedAt) return c.json({ error: "token_already_used" }, 410);
  if (invite.expiresAt < new Date()) return c.json({ error: "token_expired" }, 410);

  // Hash password (simple bcrypt-style — using crypto as stub)
  const { createHash } = await import("node:crypto");
  const passwordHash = createHash("sha256").update(password).digest("hex");

  // Create the user
  const [created] = await db
    .insert(users)
    .values({
      tenantId: invite.tenantId,
      email: invite.email,
      passwordHash,
      name,
      role: invite.role,
      isActive: true,
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  // Mark invite as used
  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.id, invite.id));

  return c.json({ user: created }, 201);
});

// ─── all routes below require auth ───────────────────────────────────────────
teamRoutes.use("*", requireAuth);

// ─── GET /api/team ────────────────────────────────────────────────────────────
teamRoutes.get("/", async (c) => {
  const user = c.get("user");

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.tenantId, user.tenantId))
    .orderBy(users.name);

  return c.json({ members });
});

/**
 * GET /api/team/members
 * Compact list for AssigneePicker (CRM-137 — kept for backward compat).
 * Returns only active users with minimal fields.
 */
teamRoutes.get("/members", async (c) => {
  const user = c.get("user");
  const members = await db
    .select({
      id: users.id,
      fullName: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.tenantId, user.tenantId), eq(users.isActive, true)))
    .orderBy(users.name);

  return c.json(members);
});

const SECURE_COOKIES = process.env.NODE_ENV === "production";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const inviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["admin", "manager", "teacher", "receptionist"]).default("teacher"),
});

// AUTH-002: POST /api/team/invite — admin invites a team member
teamRoutes.post("/invite", zValidator("json", inviteSchema), async (c) => {
  const inviter = c.get("user");
  if (inviter.role !== "admin" && inviter.role !== "manager") {
    return c.json({ error: "insufficient_permissions" }, 403);
  }
  const { email, role } = c.req.valid("json");

  // Check if user already exists for this tenant
  const existing = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.tenantId, inviter.tenantId)),
  });
  if (existing) return c.json({ error: "user_already_exists" }, 409);

  // Revoke any previous pending invitation for this email+tenant
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Delete existing pending invitations for same email+tenant
  await db.delete(userInvitations).where(
    and(
      eq(userInvitations.tenantId, inviter.tenantId),
      eq(userInvitations.email, email),
      isNull(userInvitations.acceptedAt)
    )
  );

  await db.insert(userInvitations).values({
    tenantId: inviter.tenantId,
    email,
    role,
    tokenHash,
    expiresAt,
    invitedByUserId: inviter.id,
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const acceptLink = `${appUrl}/#/app/accept-invitation?token=${rawToken}`;
  if (process.env.NODE_ENV !== "production") {
    process.stdout.write(`[AUTH-002] Invite link for ${email}: ${acceptLink}\n`);
  }

  return c.json({ ok: true, email, role }, 201);
});

// AUTH-002: GET /api/team/invitation?token=... — fetch invitation metadata (email+role)
// Used by AcceptInvitationPage to pre-fill the email field.
teamRoutes.get("/invitation", async (c) => {
  const rawToken = c.req.query("token");
  if (!rawToken) return c.json({ error: "missing_token" }, 400);

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const invite = await db.query.userInvitations.findFirst({
    where: and(
      eq(userInvitations.tokenHash, tokenHash),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date())
    ),
  });

  if (!invite) return c.json({ error: "invalid_or_expired_token" }, 400);
  return c.json({ email: invite.email, role: invite.role });
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(128),
  name: z.string().min(2).max(200),
  password: z.string().min(8).max(200),
});

// AUTH-002: POST /api/team/accept-invitation — set password and activate user
// This is a PUBLIC endpoint (no requireAuth) because the invitee is not logged in yet.
export const publicTeamRoutes = new Hono();

publicTeamRoutes.post("/accept-invitation", zValidator("json", acceptInvitationSchema), async (c) => {
  const { token, name, password } = c.req.valid("json");

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = await db.query.userInvitations.findFirst({
    where: and(
      eq(userInvitations.tokenHash, tokenHash),
      isNull(userInvitations.acceptedAt),
      gt(userInvitations.expiresAt, new Date())
    ),
  });

  if (!invite) return c.json({ error: "invalid_or_expired_token" }, 400);

  const passwordHash = await hashPassword(password);

  // Create the user and mark the invitation as accepted
  const [newUser] = await db.insert(users).values({
    tenantId: invite.tenantId,
    email: invite.email,
    passwordHash,
    name,
    role: invite.role,
  }).returning();

  await db.update(userInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(userInvitations.id, invite.id));

  // Auto-login
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { token: sessionToken } = await createSession(newUser.id);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    secure: SECURE_COOKIES,
    path: "/",
    expires: expiresAt,
  });

  return c.json({
    ok: true,
    user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
  });
});
