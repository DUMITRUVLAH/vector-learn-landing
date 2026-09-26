/**
 * Ce primește omul când acceptă o invitație — într-un singur loc.
 *
 * Invitația se poate accepta pe ȘASE căi (parolă, Google pe același workspace, Google cu mutare
 * din workspace-ul gol, Google cont nou, „alătură-te" cu link lipit, „alătură-te" dintr-un click).
 * Până la invitațiile CRM, fiecare cale scria singură rândul `par_members`; o a doua fel de
 * invitație ar fi trebuit copiată de șase ori, iar prima cale uitată ar fi dat un om care
 * acceptă și nu primește nimic. Deci: căile apelează funcțiile de aici, iar ele decid după
 * `invite.module`.
 *
 *  - `par` — rolul PAR (`par_members`) + organizațiile pe care le vede (payer scope). Neschimbat.
 *  - `crm` — rolul de workspace (`users.role`) și dreptul de a intra în CRM. Contul se reactivează:
 *    o invitație trimisă cuiva scos anterior e decizia explicită a administratorului de a-l primi
 *    înapoi.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parMembers, type parInvites } from "../../db/schema/par";
import { users } from "../../db/schema/users";
import { crmUserPermissions } from "../../db/schema/crmUserPermissions";
import { grantInvitePayerScope } from "../par/inviteScope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type InviteRow = typeof parInvites.$inferSelect;

/** Rolurile de workspace pe care le poate da o invitație CRM, de la cel mai mic la cel mai mare. */
export const CRM_INVITE_ROLES = ["receptionist", "teacher", "manager", "admin"] as const;
export type CrmInviteRole = (typeof CRM_INVITE_ROLES)[number];

/** Etichetele din ecranul „Echipă" — și din emailul de invitație, ca omul să știe ce primește. */
export const CRM_ROLE_LABELS: Record<CrmInviteRole, string> = {
  admin: "Administrator",
  manager: "Manager vânzări",
  teacher: "Agent vânzări",
  receptionist: "Operator",
};

/** Rangul unui rol de workspace; `student`/`parent`/necunoscut = sub orice rol de lucru. */
export function roleRank(role: string): number {
  return CRM_INVITE_ROLES.indexOf(role as CrmInviteRole);
}

export function inviteModule(invite: Pick<InviteRow, "module">): "par" | "crm" {
  return invite.module === "crm" ? "crm" : "par";
}

/** Unde ajunge omul imediat după acceptare. */
export function inviteLandingPath(invite: Pick<InviteRow, "module">): "/business/par" | "/business/crm" {
  return inviteModule(invite) === "crm" ? "/business/crm" : "/business/par";
}

/**
 * Rolul cu care se CREEAZĂ contul unui invitat nou. PAR: „teacher" (neprivilegiat; accesul PAR stă
 * în `par_members`). CRM: rolul ales de administrator.
 */
export function newUserRoleForInvite(invite: Pick<InviteRow, "module" | "workspaceRole">): CrmInviteRole {
  if (inviteModule(invite) === "crm" && roleRank(invite.workspaceRole ?? "") >= 0) {
    return invite.workspaceRole as CrmInviteRole;
  }
  return "teacher";
}

/** Rolul afișat invitatului (pagina de acceptare, ecranul Google „alătură-te"). */
export function inviteRoleKey(invite: Pick<InviteRow, "module" | "parRole" | "workspaceRole">): string {
  return inviteModule(invite) === "crm" ? `crm:${invite.workspaceRole ?? "teacher"}` : (invite.parRole ?? "requestor");
}

/**
 * Acordă ce promite invitația, în tranzacția care o consumă. Idempotentă: re-rulată pe același om
 * nu dublează nimic.
 */
export async function grantInviteAccess(
  tx: Tx,
  invite: InviteRow,
  user: { id: string; role: string },
): Promise<void> {
  if (inviteModule(invite) === "crm") {
    const invitedRole = newUserRoleForInvite(invite);
    // Nu retrogradăm pe nimeni printr-o invitație: un admin invitat ca agent rămâne admin.
    const role = roleRank(user.role) >= roleRank(invitedRole) ? user.role : invitedRole;
    await tx
      .update(users)
      .set({ role: role as typeof users.$inferInsert.role, isActive: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    // Un „scos din CRM" anterior e o retragere explicită a lui `crm.access`; invitația o anulează.
    await tx
      .delete(crmUserPermissions)
      .where(
        and(
          eq(crmUserPermissions.tenantId, invite.tenantId),
          eq(crmUserPermissions.userId, user.id),
          eq(crmUserPermissions.permission, "crm.access"),
        ),
      );
    return;
  }

  // PAR — ce făcea fiecare cale de acceptare, înainte să fie adunat aici.
  if (!invite.parRole) return;
  const existing = await tx.query.parMembers.findFirst({
    where: and(
      eq(parMembers.tenantId, invite.tenantId),
      eq(parMembers.userId, user.id),
      eq(parMembers.role, invite.parRole),
    ),
  });
  if (!existing) {
    await tx.insert(parMembers).values({ tenantId: invite.tenantId, userId: user.id, role: invite.parRole });
  }
  await grantInvitePayerScope(tx, invite, user.id);
}
