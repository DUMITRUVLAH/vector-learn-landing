/**
 * Oamenii modulului de task-uri: cine se AFIȘEAZĂ și cui i se poate ATRIBUI un task.
 *
 * Două întrebări diferite, deliberat separate (ca în sursa din HR365):
 * - afișarea (`listPeople`) include și conturile dezactivate — un task atribuit cuiva plecat
 *   trebuie să-i arate numele, nu o bulină anonimă;
 * - atribuirea (`listAssignable`) oferă doar oameni activi, cu relația față de cel care caută
 *   (eu → coechipierii → restul organizației), ca selectorul să-i pună pe cei apropiați primii.
 *
 * Sursa lua funcția (`job_title`) din profilul HR. Aici, funcția există doar dacă organizația
 * folosește Pontajul (`pontaj_profiles.job_title`); altfel interfața arată emailul.
 */
import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema/users";
import { pontajProfiles } from "../../db/schema/pontaj";
import { taskBoardMembers } from "../../db/schema/tasks";
import type { TaskContext } from "./access";

/** Conturile care nu fac muncă în workspace (părinți, elevi din produsul Learn). */
const NON_STAFF_ROLES = ["student", "parent"] as const;

export interface PersonDto {
  user_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  avatar_url: string | null;
  is_board_member: boolean;
  is_active: boolean;
  relation?: "self" | "teammate" | "company";
}

function displayName(name: string | null, email: string | null): string {
  return name?.trim() || email?.split("@")[0] || "Coleg";
}

/** Toți oamenii workspace-ului, pentru afișare — inclusiv cei dezactivați. */
export async function listPeople(tenantId: string): Promise<PersonDto[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      jobTitle: pontajProfiles.jobTitle,
    })
    .from(users)
    .leftJoin(pontajProfiles, and(eq(pontajProfiles.userId, users.id), eq(pontajProfiles.tenantId, tenantId)))
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({
    user_id: r.id,
    full_name: displayName(r.name, r.email),
    job_title: r.jobTitle ?? null,
    email: r.email,
    avatar_url: r.avatarUrl ?? null,
    is_board_member: false,
    is_active: r.isActive && !r.deletedAt,
  }));
}

/** Id-urile oamenilor activi din workspace — pentru validarea responsabililor și a aprobatorilor. */
export async function activeStaffIds(tenantId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        inArray(users.id, [...new Set(candidateIds)]),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        notInArray(users.role, [...NON_STAFF_ROLES]),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Cui îi poate atribui apelantul un task: oameni activi, cu relația față de el. */
export async function listAssignable(ctx: TaskContext, boardId: string | null): Promise<PersonDto[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      jobTitle: pontajProfiles.jobTitle,
    })
    .from(users)
    .leftJoin(pontajProfiles, and(eq(pontajProfiles.userId, users.id), eq(pontajProfiles.tenantId, ctx.tenantId)))
    .where(
      and(
        eq(users.tenantId, ctx.tenantId),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        notInArray(users.role, [...NON_STAFF_ROLES]),
      ),
    )
    .orderBy(asc(users.name));

  const members = new Set<string>();
  if (boardId) {
    const memberRows = await db
      .select({ userId: taskBoardMembers.userId })
      .from(taskBoardMembers)
      .where(and(eq(taskBoardMembers.tenantId, ctx.tenantId), eq(taskBoardMembers.boardId, boardId)));
    for (const m of memberRows) members.add(m.userId);
  }

  const rank = { self: 0, teammate: 1, company: 2 } as const;
  return rows
    .map((r): PersonDto => {
      const relation = r.id === ctx.userId ? "self" : ctx.teammateIds.has(r.id) ? "teammate" : "company";
      return {
        user_id: r.id,
        full_name: displayName(r.name, r.email),
        job_title: r.jobTitle ?? null,
        email: r.email,
        avatar_url: r.avatarUrl ?? null,
        is_board_member: members.has(r.id),
        is_active: true,
        relation,
      };
    })
    .sort((a, b) => rank[a.relation ?? "company"] - rank[b.relation ?? "company"] || a.full_name.localeCompare(b.full_name, "ro"));
}
