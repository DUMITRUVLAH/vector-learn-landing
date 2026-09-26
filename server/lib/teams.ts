/**
 * Echipele workspace-ului — un singur concept, folosit de PAR și de managerul de task-uri.
 *
 * Tabelele sunt `par_teams` / `par_team_members` (s-au născut în PAR, VM5-22). Managerul de
 * task-uri le refolosește în loc să-și facă un al doilea fel de „echipă": altfel întrebarea
 * „în ce echipă sunt?" ar avea două răspunsuri. Ce ÎNSEAMNĂ apartenența decide fiecare modul:
 *   - PAR: coechipierii își văd cererile între ei (`server/lib/par/teamScope.ts`);
 *   - Task-uri: un board cu `visibility = 'team'` e deschis membrilor echipei lui, iar
 *     coechipierii apar primii în selectorul de responsabili (`server/lib/tasks/access.ts`).
 *
 * Aici stă doar administrarea (listare, creare, membri), comună celor două seturi de rute:
 * `/api/par/teams` (administratorul PAR) și `/api/tasks/teams` (administratorul workspace-ului).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parTeamMembers, parTeams } from "../db/schema/par";
import { users } from "../db/schema/users";

export interface TeamMemberDto {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface TeamRow {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

/** Echipele date, fiecare cu oamenii ei — o singură interogare pentru membri, nu una per echipă. */
export async function teamsWithMembers(
  tenantId: string,
  teams: TeamRow[],
): Promise<Array<TeamRow & { members: TeamMemberDto[] }>> {
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

/** Toate echipele workspace-ului (active și inactive), cu membri, în ordine alfabetică. */
export async function listWorkspaceTeams(tenantId: string): Promise<Array<TeamRow & { members: TeamMemberDto[] }>> {
  const rows = await db
    .select({ id: parTeams.id, name: parTeams.name, active: parTeams.active, createdAt: parTeams.createdAt })
    .from(parTeams)
    .where(eq(parTeams.tenantId, tenantId))
    .orderBy(asc(parTeams.name));
  return teamsWithMembers(tenantId, rows);
}

/**
 * Echipele ACTIVE + câți oameni au — pentru selectorul de echipă al unui board, unde numărul
 * arată consecința alegerii („Marketing · 8 persoane" = 8 oameni capătă acces).
 */
export async function selectableTeams(tenantId: string): Promise<Array<{ teamId: string; name: string; memberCount: number }>> {
  const rows = await db
    .select({
      teamId: parTeams.id,
      name: parTeams.name,
      memberCount: sql<number>`count(${parTeamMembers.userId})::int`,
    })
    .from(parTeams)
    .leftJoin(parTeamMembers, eq(parTeamMembers.teamId, parTeams.id))
    .where(and(eq(parTeams.tenantId, tenantId), eq(parTeams.active, true)))
    .groupBy(parTeams.id, parTeams.name)
    .orderBy(asc(parTeams.name));
  return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount) }));
}

/** Există echipa, e a workspace-ului și e activă? */
export async function isActiveTeamOfTenant(teamId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: parTeams.id })
    .from(parTeams)
    .where(and(eq(parTeams.id, teamId), eq(parTeams.tenantId, tenantId), eq(parTeams.active, true)))
    .limit(1);
  return Boolean(row);
}

/** Echipele ACTIVE din care face parte omul. */
export async function activeTeamIdsOf(userId: string, tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ teamId: parTeamMembers.teamId })
    .from(parTeamMembers)
    .innerJoin(parTeams, eq(parTeams.id, parTeamMembers.teamId))
    .where(and(eq(parTeamMembers.tenantId, tenantId), eq(parTeamMembers.userId, userId), eq(parTeams.active, true)));
  return rows.map((r) => r.teamId);
}

/** Inserție idempotentă: re-adăugarea cuiva deja în echipă nu e o eroare. Întoarce cine a intrat. */
export async function addTeamMembers(tenantId: string, teamId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  // Doar oameni din ACEST workspace: o echipă care trece granița tenantului ar deschide datele
  // unei organizații altcuiva.
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
