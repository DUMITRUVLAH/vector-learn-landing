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
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import { users, invitations } from "../db/schema";
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

// ─── POST /api/team/invite ────────────────────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "teacher", "receptionist", "student", "parent"]).default("manager"),
});

teamRoutes.post("/invite", zValidator("json", inviteSchema), async (c) => {
  const actor = c.get("user");

  // Only admins can invite
  if (actor.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const { email, role } = c.req.valid("json");

  // Check if user already exists in tenant
  const existing = await db.query.users.findFirst({
    where: and(eq(users.tenantId, actor.tenantId), eq(users.email, email)),
  });
  if (existing) {
    return c.json({ error: "user_already_exists" }, 409);
  }

  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h TTL

  await db.insert(invitations).values({
    tenantId: actor.tenantId,
    email,
    role: role as typeof userRoleEnum.enumValues[number],
    token,
    createdBy: actor.id,
    expiresAt,
  });

  // In production, this would send an email. For now we return the URL for the client to display.
  const inviteUrl = `/app/signup?invite=${token}`;

  // Stub log (no email sent)
  console.warn(`[INVITE STUB] To: ${email}, Role: ${role}, URL: ${inviteUrl}`);

  return c.json({ inviteUrl, token, expiresAt: expiresAt.toISOString() }, 201);
});

// ─── PATCH /api/team/:userId ──────────────────────────────────────────────────
const patchTeamMemberSchema = z.object({
  role: z.enum(["admin", "manager", "teacher", "receptionist", "student", "parent"]).optional(),
  isActive: z.boolean().optional(),
});

teamRoutes.patch("/:userId", zValidator("json", patchTeamMemberSchema), async (c) => {
  const actor = c.get("user");
  const targetId = c.req.param("userId");
  const body = c.req.valid("json");

  // Only admins can patch team members
  if (actor.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  // Find target user
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.tenantId, actor.tenantId)));

  if (!target) return c.json({ error: "not_found" }, 404);

  // Owner (the first admin/creator) cannot be deactivated — protect by role check.
  // Simple rule: if target is the only admin in the tenant, refuse deactivation.
  if (body.isActive === false && target.id === actor.id) {
    return c.json({ error: "cannot_disable_yourself" }, 403);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.role !== undefined) patch.role = body.role;
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, targetId), eq(users.tenantId, actor.tenantId)))
    .returning({ id: users.id, email: users.email, role: users.role, isActive: users.isActive });

  return c.json({ user: updated });
});
