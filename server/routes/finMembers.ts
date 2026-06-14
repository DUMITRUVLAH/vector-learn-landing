/**
 * CORE-002: FinDesk members management
 * CRUD for fin_members + invitation flow.
 * CORE: backlog/fin/FIN-CORE.md §2 (role matrix, rule #7)
 * Mounted in server/app.ts: app.route("/api/fin/members", finMembersRoutes)
 *
 * Routes:
 *   GET    /api/fin/members                → list members (owner only)
 *   POST   /api/fin/members                → add existing user as member (owner only)
 *   PATCH  /api/fin/members/:id            → change role (owner only; last-owner guard)
 *   DELETE /api/fin/members/:id            → remove member (owner only; last-owner guard)
 *   POST   /api/fin/members/invite         → invite by email (owner only; reuse userInvitations)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { finMembers } from "../db/schema/finCore";
import { finOrgProfile } from "../db/schema/finCore";
import { users } from "../db/schema/users";
import { userInvitations } from "../db/schema/userInvitations";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireFinRole } from "../middleware/requireFinRole";
import { createHash } from "crypto";

export const finMembersRoutes = new Hono<{ Variables: AuthVariables }>();
finMembersRoutes.use("*", requireAuth);

// ─── Validation ────────────────────────────────────────────────────────────────

const finRoleValues = ["owner", "accountant", "cfo", "viewer"] as const;

const addMemberSchema = z.object({
  userId: z.string().uuid("user_id must be a UUID"),
  role: z.enum(finRoleValues).default("viewer"),
});

const updateMemberSchema = z.object({
  role: z.enum(finRoleValues),
});

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(finRoleValues).default("viewer"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Count remaining owners in the tenant — used for last-owner guard */
async function countOwners(tenantId: string): Promise<number> {
  const rows = await db
    .select({ id: finMembers.id })
    .from(finMembers)
    .where(and(eq(finMembers.tenantId, tenantId), eq(finMembers.role, "owner")));
  return rows.length;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/fin/members/me — return current user's FinDesk membership + org profile.
 * Used by FinLayout to determine role + company name without an owner-level list query.
 * Returns 403 if the current user is not a fin member.
 * CORE-004
 */
finMembersRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const member = await db
    .select({
      id: finMembers.id,
      role: finMembers.role,
      permissions: finMembers.permissions,
      userId: finMembers.userId,
    })
    .from(finMembers)
    .leftJoin(users, eq(finMembers.userId, users.id))
    .where(and(eq(finMembers.tenantId, user.tenantId), eq(finMembers.userId, user.id)))
    .limit(1);

  if (member.length === 0) {
    return c.json({ error: "not_a_fin_member" }, 403);
  }

  const profileRows = await db
    .select()
    .from(finOrgProfile)
    .where(eq(finOrgProfile.tenantId, user.tenantId))
    .limit(1);

  return c.json({ member: member[0], profile: profileRows[0] ?? null });
});

/** GET /api/fin/members — list members of the tenant */
finMembersRoutes.get(
  "/",
  requireFinRole("owner"),
  async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
        id: finMembers.id,
        userId: finMembers.userId,
        role: finMembers.role,
        permissions: finMembers.permissions,
        createdAt: finMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(finMembers)
      .leftJoin(users, eq(finMembers.userId, users.id))
      .where(eq(finMembers.tenantId, user.tenantId));

    return c.json({ members: rows });
  }
);

/** POST /api/fin/members — add an existing platform user as a FinDesk member */
finMembersRoutes.post(
  "/",
  requireFinRole("owner"),
  zValidator("json", addMemberSchema),
  async (c) => {
    const user = c.get("user");
    const { userId, role } = c.req.valid("json");

    // Verify target user belongs to the same tenant
    const targetUser = await db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.tenantId, user.tenantId)),
    });
    if (!targetUser) {
      return c.json({ error: "user_not_found_in_tenant" }, 404);
    }

    // Check if already a member
    const existing = await db.query.finMembers.findFirst({
      where: and(
        eq(finMembers.tenantId, user.tenantId),
        eq(finMembers.userId, userId)
      ),
    });
    if (existing) {
      return c.json({ error: "already_a_member", memberId: existing.id }, 409);
    }

    const [member] = await db
      .insert(finMembers)
      .values({ tenantId: user.tenantId, userId, role })
      .returning();

    return c.json({ member }, 201);
  }
);

/** PATCH /api/fin/members/:id — update a member's role */
finMembersRoutes.patch(
  "/:id",
  requireFinRole("owner"),
  zValidator("json", updateMemberSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const { role } = c.req.valid("json");

    // Locate the member in this tenant
    const member = await db.query.finMembers.findFirst({
      where: and(eq(finMembers.id, id), eq(finMembers.tenantId, user.tenantId)),
    });
    if (!member) return c.json({ error: "member_not_found" }, 404);

    // Last-owner guard: if downgrading an owner, ensure there's another owner
    if (member.role === "owner" && role !== "owner") {
      const ownerCount = await countOwners(user.tenantId);
      if (ownerCount <= 1) {
        return c.json({ error: "cannot_demote_last_owner" }, 400);
      }
    }

    const [updated] = await db
      .update(finMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(finMembers.id, id), eq(finMembers.tenantId, user.tenantId)))
      .returning();

    return c.json({ member: updated });
  }
);

/** DELETE /api/fin/members/:id — remove a member from the workspace */
finMembersRoutes.delete(
  "/:id",
  requireFinRole("owner"),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();

    const member = await db.query.finMembers.findFirst({
      where: and(eq(finMembers.id, id), eq(finMembers.tenantId, user.tenantId)),
    });
    if (!member) return c.json({ error: "member_not_found" }, 404);

    // Last-owner guard
    if (member.role === "owner") {
      const ownerCount = await countOwners(user.tenantId);
      if (ownerCount <= 1) {
        return c.json({ error: "cannot_delete_last_owner" }, 400);
      }
    }

    await db
      .delete(finMembers)
      .where(and(eq(finMembers.id, id), eq(finMembers.tenantId, user.tenantId)));

    return c.json({ ok: true });
  }
);

/** POST /api/fin/members/invite — invite a new user by email */
finMembersRoutes.post(
  "/invite",
  requireFinRole("owner"),
  zValidator("json", inviteSchema),
  async (c) => {
    const user = c.get("user");
    const { email, role } = c.req.valid("json");

    // Check if already a member by email
    const existingUser = await db.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.tenantId, user.tenantId)),
    });
    if (existingUser) {
      // Already exists — just add as member if not already
      const existingMember = await db.query.finMembers.findFirst({
        where: and(
          eq(finMembers.tenantId, user.tenantId),
          eq(finMembers.userId, existingUser.id)
        ),
      });
      if (!existingMember) {
        const [member] = await db
          .insert(finMembers)
          .values({ tenantId: user.tenantId, userId: existingUser.id, role })
          .returning();
        return c.json({ member, invited: false, note: "user_added_directly" }, 201);
      }
      return c.json({ error: "already_a_member" }, 409);
    }

    // Create invitation token (reuse userInvitations pattern)
    const token = crypto.randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

    await db.insert(userInvitations).values({
      tenantId: user.tenantId,
      email,
      role: "teacher", // platform role — FinDesk role assigned on accept
      tokenHash,
      expiresAt,
      invitedByUserId: user.id,
    });

    // In production: send email with invite link. Here: return token for testing.
    // TODO: integrate with email provider (COMM module)
    return c.json({
      ok: true,
      invited: true,
      email,
      finRole: role,
      // token only returned in test/dev environments
      ...(process.env.NODE_ENV !== "production" ? { token } : {}),
    }, 201);
  }
);
