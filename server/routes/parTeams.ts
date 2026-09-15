/**
 * VM5-22: echipe PAR — cine lucrează cu cine, ca să-și vadă cererile între ei.
 *
 *   GET    /api/par/teams/my                 → echipele mele + coechipierii (orice membru PAR)
 *   GET    /api/par/teams                    → toate echipele workspace-ului (par_admin)
 *   POST   /api/par/teams                    → creează echipă (par_admin)
 *   PATCH  /api/par/teams/:id                → redenumește / (dez)activează (par_admin)
 *   DELETE /api/par/teams/:id                → șterge echipa (par_admin)
 *   POST   /api/par/teams/:id/members        → adaugă un om în echipă (par_admin)
 *   DELETE /api/par/teams/:id/members/:userId → scoate-l (par_admin)
 *
 * Ce ÎNSEAMNĂ apartenența la o echipă e descris într-un singur loc: `server/lib/par/teamScope.ts`.
 * Aici e doar administrarea ei. Fiecare schimbare de compoziție se scrie în jurnalul de audit:
 * echipa lărgește cine vede cererile cuiva, deci „cine a băgat pe cine, și când" trebuie să aibă
 * răspuns — la fel ca la delegări.
 *
 * Montat în server/app.ts: app.route("/api/par/teams", parTeamsRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parTeamMembers, parTeams } from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { teammateUserIds } from "../lib/par/teamScope";
import { writeAuditLog } from "../lib/auditLogger";
import { clientIp } from "../lib/clientIp";

export const parTeamsRoutes = new Hono<{ Variables: AuthVariables }>();
parTeamsRoutes.use("*", requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TeamMemberDto {
  userId: string;
  name: string | null;
  email: string | null;
}

/** Echipele cerute, fiecare cu oamenii ei — o singură interogare pentru membri, nu una per echipă. */
async function withMembers(
  tenantId: string,
  teams: { id: string; name: string; active: boolean; createdAt: Date }[],
): Promise<Array<{ id: string; name: string; active: boolean; createdAt: Date; members: TeamMemberDto[] }>> {
  if (teams.length === 0) return [];
  const rows = await db
    .select({
      teamId: parTeamMembers.teamId,
      userId: parTeamMembers.userId,
      name: users.name,
      email: users.email,
    })
    .from(parTeamMembers)
    .leftJoin(users, eq(users.id, parTeamMembers.userId))
    .where(and(eq(parTeamMembers.tenantId, tenantId), inArray(parTeamMembers.teamId, teams.map((t) => t.id))))
    .orderBy(asc(users.name));
  const byTeam = new Map<string, TeamMemberDto[]>();
  for (const row of rows) {
    const list = byTeam.get(row.teamId) ?? [];
    list.push({ userId: row.userId, name: row.name ?? null, email: row.email ?? null });
    byTeam.set(row.teamId, list);
  }
  return teams.map((t) => ({ ...t, members: byTeam.get(t.id) ?? [] }));
}

/**
 * GET /my — ce vede un om obișnuit: echipele lui și coechipierii.
 *
 * Înregistrată ÎNAINTEA rutelor cu `:id`: „my" nu e un UUID. Ecranul de cereri o folosește ca să
 * știe dacă să arate deloc fila „Ale echipei" și ca să pună un nume lângă cererea colegului.
 */
parTeamsRoutes.get("/my", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const myTeams = await db
    .select({ id: parTeams.id, name: parTeams.name, active: parTeams.active, createdAt: parTeams.createdAt })
    .from(parTeams)
    .innerJoin(parTeamMembers, eq(parTeamMembers.teamId, parTeams.id))
    .where(and(eq(parTeams.tenantId, tenantId), eq(parTeams.active, true), eq(parTeamMembers.userId, user.id)))
    .orderBy(asc(parTeams.name));
  const teams = await withMembers(tenantId, myTeams);
  return c.json({ teams, teammateIds: await teammateUserIds(user.id, tenantId) });
});

parTeamsRoutes.get("/", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({ id: parTeams.id, name: parTeams.name, active: parTeams.active, createdAt: parTeams.createdAt })
    .from(parTeams)
    .where(eq(parTeams.tenantId, tenantId))
    .orderBy(asc(parTeams.name));
  return c.json({ teams: await withMembers(tenantId, rows) });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(200),
  /** Opțional: oamenii cu care pornește echipa, ca administratorul să n-o compună în doi pași. */
  user_ids: z.array(z.string().uuid()).max(100).optional(),
});

parTeamsRoutes.post("/", requirePARRole("par_admin"), zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { name, user_ids } = c.req.valid("json");

  const [existing] = await db
    .select({ id: parTeams.id })
    .from(parTeams)
    .where(and(eq(parTeams.tenantId, tenantId), eq(parTeams.name, name)))
    .limit(1);
  if (existing) {
    return c.json({ error: "duplicate_name", detail: "Există deja o echipă cu numele ăsta." }, 409);
  }

  const [team] = await db.insert(parTeams).values({ tenantId, name }).returning();
  const memberIds = await addMembers(tenantId, team.id, user_ids ?? []);
  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "par_team_created",
    targetType: "par_team",
    targetId: team.id,
    newValue: { name: team.name, members: memberIds },
    ipAddress: clientIp(c),
  });
  return c.json({ team: { ...team, members: (await withMembers(tenantId, [team]))[0].members } }, 201);
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  active: z.boolean().optional(),
});

parTeamsRoutes.patch("/:id", requirePARRole("par_admin"), zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "not_found" }, 404);
  const patch = c.req.valid("json");
  if (patch.name === undefined && patch.active === undefined) {
    return c.json({ error: "nothing_to_update" }, 400);
  }
  const [updated] = await db
    .update(parTeams)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "par_team_updated",
    targetType: "par_team",
    targetId: updated.id,
    newValue: { name: updated.name, active: updated.active },
    ipAddress: clientIp(c),
  });
  return c.json({ team: updated });
});

parTeamsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "not_found" }, 404);
  const [deleted] = await db
    .delete(parTeams)
    .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, tenantId)))
    .returning({ id: parTeams.id, name: parTeams.name });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "par_team_deleted",
    targetType: "par_team",
    targetId: deleted.id,
    oldValue: { name: deleted.name },
    ipAddress: clientIp(c),
  });
  return c.json({ ok: true });
});

const addMemberSchema = z.object({ user_id: z.string().uuid() });

parTeamsRoutes.post("/:id/members", requirePARRole("par_admin"), zValidator("json", addMemberSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "not_found" }, 404);
  const { user_id } = c.req.valid("json");

  const [team] = await db
    .select({ id: parTeams.id })
    .from(parTeams)
    .where(and(eq(parTeams.id, id), eq(parTeams.tenantId, tenantId)))
    .limit(1);
  if (!team) return c.json({ error: "not_found" }, 404);

  // Doar oameni din ACEST workspace: o echipă care trece granița tenantului ar arăta cererile
  // unei organizații altcuiva.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, user_id), eq(users.tenantId, tenantId)))
    .limit(1);
  if (!target) return c.json({ error: "not_a_member", detail: "Utilizatorul nu face parte din organizație." }, 400);

  const added = await addMembers(tenantId, id, [user_id]);
  if (added.length > 0) {
    await writeAuditLog({
      tenantId,
      actorId: user.id,
      actionType: "par_team_member_added",
      targetType: "par_team",
      targetId: id,
      newValue: { userId: user_id },
      ipAddress: clientIp(c),
    });
  }
  return c.json({ ok: true, added: added.length > 0 });
});

parTeamsRoutes.delete("/:id/members/:userId", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { id, userId } = c.req.param();
  if (!UUID_RE.test(id) || !UUID_RE.test(userId)) return c.json({ error: "not_found" }, 404);
  const [removed] = await db
    .delete(parTeamMembers)
    .where(and(eq(parTeamMembers.tenantId, tenantId), eq(parTeamMembers.teamId, id), eq(parTeamMembers.userId, userId)))
    .returning({ id: parTeamMembers.id });
  if (!removed) return c.json({ error: "not_found" }, 404);
  await writeAuditLog({
    tenantId,
    actorId: user.id,
    actionType: "par_team_member_removed",
    targetType: "par_team",
    targetId: id,
    oldValue: { userId },
    ipAddress: clientIp(c),
  });
  return c.json({ ok: true });
});

/** Inserție idempotentă: re-adăugarea cuiva deja în echipă nu e o eroare. Întoarce cine a intrat. */
async function addMembers(tenantId: string, teamId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const valid = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, [...new Set(userIds)])));
  if (valid.length === 0) return [];
  const inserted = await db
    .insert(parTeamMembers)
    .values(valid.map((u) => ({ tenantId, teamId, userId: u.id })))
    .onConflictDoNothing()
    .returning({ userId: parTeamMembers.userId });
  return inserted.map((r) => r.userId);
}
