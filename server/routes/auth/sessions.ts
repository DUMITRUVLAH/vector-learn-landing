/**
 * AUTH-004: Session management routes.
 *
 * GET    /api/auth/sessions              — list all active sessions for current user
 * DELETE /api/auth/sessions/:id          — revoke a specific session by ID
 * DELETE /api/auth/sessions?except=current — revoke all sessions except the current one
 */

import { Hono } from "hono";
import { eq, and, ne } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";
import { requireAuth, type AuthVariables } from "../../middleware/requireAuth";
import { SESSION_COOKIE } from "../../auth/session";

export const sessionMgmtRoutes = new Hono<{ Variables: AuthVariables }>();

// GET /api/auth/sessions — list active (non-expired) sessions for the authenticated user
sessionMgmtRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const currentToken = getCookie(c, SESSION_COOKIE) ?? "";

  const allSessions = await db.query.sessions.findMany({
    where: eq(sessions.userId, user.id),
  });

  // Filter out expired sessions (don't delete them here — keep it read-only)
  const now = Date.now();
  const activeSessions = allSessions
    .filter((s) => s.expiresAt.getTime() > now)
    .map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.token === currentToken,
    }));

  return c.json({ sessions: activeSessions });
});

// DELETE /api/auth/sessions/:id — revoke a specific session by UUID
sessionMgmtRoutes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const currentToken = getCookie(c, SESSION_COOKIE) ?? "";

  // Find the session and confirm it belongs to this user (tenant safety)
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, id), eq(sessions.userId, user.id)),
  });
  if (!session) return c.json({ error: "session_not_found" }, 404);

  if (session.token === currentToken) {
    // Revoking your own current session is allowed (= logout behavior)
    // Front-end should redirect to login after this.
  }

  await db.delete(sessions).where(eq(sessions.id, id));
  return c.json({ ok: true });
});

// DELETE /api/auth/sessions?except=current — revoke all sessions except the current one
sessionMgmtRoutes.delete("/", requireAuth, async (c) => {
  const user = c.get("user");
  const except = c.req.query("except");
  const currentToken = getCookie(c, SESSION_COOKIE) ?? "";

  if (except === "current") {
    // Delete all sessions for this user EXCEPT the one we're calling from
    const currentSession = await db.query.sessions.findFirst({
      where: eq(sessions.token, currentToken),
    });
    if (currentSession) {
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSession.id)));
    } else {
      // Fallback: delete all
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }
  } else {
    // Delete all sessions (full logout from all devices)
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }

  return c.json({ ok: true });
});
