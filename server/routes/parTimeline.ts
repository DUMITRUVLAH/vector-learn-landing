/**
 * PAR-110: Timeline / audit log endpoint
 *
 * Routes:
 *   GET /api/par/:id/timeline  → chronological audit events with actor names resolved
 *
 * CORE: backlog/par/PAR-CORE.md §4 (state machine), §9 (audit)
 * Mounted in server/app.ts: app.route("/api/par", parTimelineRoutes)
 *   Must be registered BEFORE the generic /api/par (more specific path).
 */
import { Hono } from "hono";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parAudit, parRequests } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parTimelineRoutes = new Hono<{ Variables: AuthVariables }>();
parTimelineRoutes.use("*", requireAuth);

// ─── GET /api/par/:id/timeline ──────────────────────────────────────────────
// Returns all par_audit rows for the given PAR, chronologically,
// with actor display name resolved from the users table.

parTimelineRoutes.get("/:id/timeline", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  // Verify the PAR exists and the caller can see it
  const [par] = await db
    .select({
      id: parRequests.id,
      requestedByUserId: parRequests.requestedByUserId,
      tenantId: parRequests.tenantId,
    })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return c.json({ error: "not_found" }, 404);

  // Roles gate: requestors can only view their own PAR timeline; elevated roles see all
  const roles = await getUserPARRoles(user.id, tenantId);
  const hasElevatedRole = roles.some((r) =>
    ["approver", "finance", "par_admin"].includes(r)
  );
  if (!hasElevatedRole && par.requestedByUserId !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }

  // Fetch all audit rows for this PAR, chronological
  const auditRows = await db
    .select()
    .from(parAudit)
    .where(and(eq(parAudit.parId, parId), eq(parAudit.tenantId, tenantId)))
    .orderBy(asc(parAudit.createdAt));

  if (auditRows.length === 0) {
    return c.json({ timeline: [], total: 0 });
  }

  // Resolve actor names — batch lookup of distinct actor user IDs
  const actorIds = [
    ...new Set(
      auditRows
        .map((r) => r.actorUserId)
        .filter((id): id is string => id !== null)
    ),
  ];

  const actorMap: Record<string, string> = {};
  if (actorIds.length > 0) {
    // Drizzle: inArray import is needed — use a manual loop to avoid import hassle on small sets
    // (actor sets are small — typically < 10 users per PAR)
    const actorUsers = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    for (const u of actorUsers) {
      if (actorIds.includes(u.id)) {
        actorMap[u.id] = u.name ?? u.email ?? u.id;
      }
    }
  }

  const timeline = auditRows.map((row) => ({
    id: row.id,
    event: row.event,
    detail: row.detail ?? null,
    diff: row.diff ?? null,
    actor_user_id: row.actorUserId ?? null,
    actor_name: row.actorUserId ? (actorMap[row.actorUserId] ?? row.actorUserId) : "System",
    created_at: row.createdAt,
  }));

  return c.json({ timeline, total: timeline.length });
});
