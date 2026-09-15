/**
 * VM5-22: echipa — CU CINE lucrezi, nu CE ai voie să atingi.
 *
 * Cererea owner-ului (15.09.2026): „Cristina și Iulian să fie în aceeași echipă la ATIC și să vadă
 * PAR-urile, statutele și ce trimite celălalt, la fel și ciornele." Regula de proiect existentă
 * (VM5-02, `visibility.ts`) acoperea doar jumătate: arăta cererile TRIMISE ale tuturor colegilor de
 * pe proiect, deci prea mult (toată organizația e pe aceleași proiecte) și prea puțin (ciornele
 * rămâneau invizibile, exact cele pe care le preiei când colegul lipsește).
 *
 * Echipa e un grup EXPLICIT, făcut de administrator. Ce aduce:
 *   - vezi cererile coechipierilor în ORICE stare, ciorna inclusă;
 * Ce NU aduce — deliberat, ca echipa să nu devină o portiță de drepturi:
 *   - NU extinde aria: rămâi limitat la proiectele/plătitorii care ți-au fost alocați, deci un
 *     coechipier dintr-un plătitor la care n-ai acces îți rămâne invizibil (regula e aplicată de
 *     apelanți: `visibility.ts` și lista din `routes/par.ts`, ca lista și fișa să spună la fel);
 *   - NU dă dreptul de a aproba, de a plăti sau de a EDITA cererea altcuiva — scrierea rămâne la
 *     autor (și la administratorul workspace-ului), exact ca înainte;
 *   - NU descoperă rechizitele beneficiarului (IBAN/IDNP): lista le maschează pentru oricine nu e
 *     autor sau rol elevat, la fel ca la colegii de proiect.
 */
import { and, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/client";
import { parTeamMembers, parTeams } from "../../db/schema/par";

/**
 * Ceilalți oameni cu care utilizatorul împarte cel puțin o echipă ACTIVĂ. Fără el însuși și fără
 * duplicate (doi colegi în două echipe comune apar o dată).
 */
export async function teammateUserIds(userId: string, tenantId: string): Promise<string[]> {
  const mine = alias(parTeamMembers, "my_team_membership");
  const rows = await db
    .select({ userId: parTeamMembers.userId })
    .from(parTeamMembers)
    .innerJoin(mine, eq(mine.teamId, parTeamMembers.teamId))
    .innerJoin(parTeams, eq(parTeams.id, parTeamMembers.teamId))
    .where(
      and(
        eq(parTeamMembers.tenantId, tenantId),
        eq(mine.tenantId, tenantId),
        eq(mine.userId, userId),
        eq(parTeams.active, true),
        ne(parTeamMembers.userId, userId),
      ),
    );
  return [...new Set(rows.map((r) => r.userId))];
}

/** Împart o echipă activă cu autorul cererii? */
export async function sharesTeamWith(
  viewerId: string,
  authorId: string | null | undefined,
  tenantId: string,
): Promise<boolean> {
  if (!authorId || authorId === viewerId) return false;
  const mine = alias(parTeamMembers, "my_team_membership");
  const [row] = await db
    .select({ id: parTeamMembers.id })
    .from(parTeamMembers)
    .innerJoin(mine, eq(mine.teamId, parTeamMembers.teamId))
    .innerJoin(parTeams, eq(parTeams.id, parTeamMembers.teamId))
    .where(
      and(
        eq(parTeamMembers.tenantId, tenantId),
        eq(parTeamMembers.userId, authorId),
        eq(mine.tenantId, tenantId),
        eq(mine.userId, viewerId),
        eq(parTeams.active, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}
