import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { parPayerMembers, parProjectMembers, parProjects } from "../../db/schema/par";

/**
 * Returns null for a tenant owner/manager (unrestricted) and otherwise the projects the
 * person was explicitly assigned to or inherited through a payer assignment. Keeping this in one place prevents list endpoints from
 * accidentally leaking projects when a new screen is added.
 */
export async function accessibleProjectIds(userId: string, tenantId: string, tenantRole?: string): Promise<string[] | null> {
  if (tenantRole === "admin" || tenantRole === "manager") return null;
  const [directRows, payerRows] = await Promise.all([
    db.select({ projectId: parProjectMembers.projectId }).from(parProjectMembers)
      .where(and(eq(parProjectMembers.tenantId, tenantId), eq(parProjectMembers.userId, userId))),
    db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers)
      .where(and(eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, userId))),
  ]);
  const ids = new Set(directRows.map((row) => row.projectId));
  const payerIds = payerRows.map((row) => row.payerId);
  if (payerIds.length) {
    const inherited = await db.select({ id: parProjects.id }).from(parProjects).where(and(
      eq(parProjects.tenantId, tenantId), inArray(parProjects.payerId, payerIds), eq(parProjects.active, true),
    ));
    inherited.forEach((row) => ids.add(row.id));
  }
  return [...ids];
}

export async function mayAccessProject(userId: string, tenantId: string, projectId: string | null | undefined, tenantRole?: string): Promise<boolean> {
  if (!projectId) return true;
  const ids = await accessibleProjectIds(userId, tenantId, tenantRole);
  return ids === null || ids.includes(projectId);
}

export async function accessiblePayerIds(
  userId: string,
  tenantId: string,
  tenantRole?: string,
  /** Proiectele deja calculate de apelant — vezi `accessibleScopes`. */
  precomputedProjects?: string[] | null
): Promise<string[] | null> {
  if (tenantRole === "admin" || tenantRole === "manager") return null;
  const [direct, projects] = await Promise.all([
    db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers).where(and(
      eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, userId),
    )),
    precomputedProjects !== undefined
      ? Promise.resolve(precomputedProjects)
      : accessibleProjectIds(userId, tenantId, tenantRole),
  ]);
  const ids = new Set(direct.map((row) => row.payerId));
  if (projects?.length) {
    const inherited = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
      eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projects),
    ));
    inherited.forEach((row) => { if (row.payerId) ids.add(row.payerId); });
  }
  return [...ids];
}

export async function mayAccessPayer(userId: string, tenantId: string, payerId: string | null | undefined, tenantRole?: string): Promise<boolean> {
  if (!payerId) return false;
  const ids = await accessiblePayerIds(userId, tenantId, tenantRole);
  return ids === null || ids.includes(payerId);
}


/**
 * Ambele arii, calculate o singură dată.
 *
 * PERF (audit 2026-08-29): tiparul `Promise.all([accessibleProjectIds(…), accessiblePayerIds(…)])`
 * apărea în opt rute — dar `accessiblePayerIds` apelează INTERN `accessibleProjectIds`, deci
 * paralelizarea rula aceleași două-trei interogări de două ori. Pe pagina de rapoarte, unde zece
 * cereri pleacă simultan, asta însemna zeci de interogări de autorizare duplicate, împinse prin
 * trei conexiuni. Aici se calculează proiectele o dată și se dau mai departe.
 */
export async function accessibleScopes(
  userId: string,
  tenantId: string,
  tenantRole?: string
): Promise<{ projects: string[] | null; payers: string[] | null }> {
  const projects = await accessibleProjectIds(userId, tenantId, tenantRole);
  const payers = await accessiblePayerIds(userId, tenantId, tenantRole, projects);
  return { projects, payers };
}
