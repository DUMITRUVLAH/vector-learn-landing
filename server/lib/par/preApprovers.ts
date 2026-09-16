/**
 * Pre-aprobarea de proiect — semnătura cerută ÎNAINTEA lanțului DOA.
 *
 * Problema reală (Iulian + Cristina, proiectul LED 3/Youth Maker club, 16.09.2026): cererile depuse
 * de asistentul de proiect plecau direct la finanțe. Managerul de proiect le regăsea abia în listă,
 * „plătite sau respinse" — adică o linie de buget greșită se descoperea DUPĂ plată, când corectura
 * nu mai e o semnătură, ci o operațiune contabilă.
 *
 * Aici se rezolvă prin lanț, nu prin disciplină: proiectul își desemnează pre-aprobatorii, iar la
 * depunere lanțul primește un nivel nou în față, pe numele lor. Restul mașinăriei (blocare
 * secvențială, inbox, digest, PDF) nu știe că pasul e „de pre-aprobare" — e un pas ca oricare, deci
 * nu are cum să se comporte altfel decât pașii deja verificați.
 *
 * Două decizii care se văd în cod:
 *   - **un singur nivel, în paralel**: ecranul de administrare bifează oameni, nu îi ordonează, deci
 *     lanțul nu inventează o ordine pe care nimeni n-a scris-o. Toți semnează, în ce ordine vor.
 *   - **pas pe NUME, nu pe rol**: un pas atribuit explicit e propria lui autoritate (VF-002), deci un
 *     om cu rol `finance` (Cristina) poate pre-aproba fără să primească dreptul general de aprobare
 *     pe toate cererile organizației.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parProjectPreApprovers } from "../../db/schema/par";
import type { ApprovalStep } from "./doa";

/** Eticheta pasului. Un rol, nu un nume — vezi `slotRoleLabel` din doa.ts. */
export const PRE_APPROVAL_LABEL = "Pre-aprobare proiect";

/** True pentru „relation/table does not exist" — tabela poate rămâne în urma codului la deploy. */
function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /par_project_pre_approvers.*does not exist|relation .*does not exist|no such table/i.test(msg);
}

/**
 * Pre-aprobatorii unui proiect. Lista goală = proiect fără pre-aprobare (comportamentul de până
 * acum). Dacă tabela lipsește încă pe baza live, răspunsul e tot lista goală: o depunere nu are
 * voie să pice pentru că o migrare a întârziat — aceeași plasă ca la `projectApprovers.ts`.
 */
export async function getProjectPreApprovers(tenantId: string, projectId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ userId: parProjectPreApprovers.userId })
      .from(parProjectPreApprovers)
      .where(and(eq(parProjectPreApprovers.tenantId, tenantId), eq(parProjectPreApprovers.projectId, projectId)));
    return rows.map((r) => r.userId);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

/** projectId → Set<userId>, pentru ecranele care listează toate proiectele deodată. */
export async function getPreApproverMap(tenantId: string): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  try {
    const rows = await db
      .select({ projectId: parProjectPreApprovers.projectId, userId: parProjectPreApprovers.userId })
      .from(parProjectPreApprovers)
      .where(eq(parProjectPreApprovers.tenantId, tenantId));
    for (const r of rows) {
      let set = map.get(r.projectId);
      if (!set) { set = new Set(); map.set(r.projectId, set); }
      set.add(r.userId);
    }
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  return map;
}

/** E omul ăsta pre-aprobator pe VREUN proiect? Deschide inboxul de aprobare cui n-are rolul. */
export async function isPreApprover(tenantId: string, userId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: parProjectPreApprovers.id })
      .from(parProjectPreApprovers)
      .where(and(eq(parProjectPreApprovers.tenantId, tenantId), eq(parProjectPreApprovers.userId, userId)))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

/** Înlocuiește lista de pre-aprobatori a unui proiect (acțiune de par_admin). */
export async function setProjectPreApprovers(
  tenantId: string,
  projectId: string,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds)];
  await db.transaction(async (tx) => {
    await tx
      .delete(parProjectPreApprovers)
      .where(and(eq(parProjectPreApprovers.tenantId, tenantId), eq(parProjectPreApprovers.projectId, projectId)));
    if (unique.length > 0) {
      await tx.insert(parProjectPreApprovers).values(
        unique.map((userId) => ({ tenantId, projectId, userId })),
      );
    }
  });
}

/**
 * PUR: lanțul DOA cu nivelul de pre-aprobare pus în față.
 *
 * Trei reguli, toate în direcția „nicio semnătură nu se pierde, niciuna nu se cere de două ori":
 *
 *   1. **solicitantul nu se pre-aprobă singur** — a semnat deja la pasul 0, depunând. E exact
 *      varianta pe care Iulian o propusese manual („am putea face PAR-uri de pe contul meu"): când
 *      cererea e chiar a lui, nivelul de pre-aprobare nu mai are ce adăuga. Dacă el era singurul
 *      pre-aprobator, lanțul rămâne cel DOA, neatins.
 *   2. **un om semnează o dată** — dacă un pre-aprobator e ținut și pe un pas DOA de mai târziu,
 *      pasul acela pinuit se scoate: semnătura lui e deja colectată, mai devreme, pe aceeași cerere.
 *      Pașii pe ROL nu se ating niciodată (acolo nu se știe cine va semna).
 *   3. **pașii DOA se decalează cu un nivel**, păstrându-și ordinea relativă și grupările paralele —
 *      numerotarea rămâne 1..N fără găuri în față, iar `submitPAR` blochează tot ce e peste minim.
 */
export function withProjectPreApproval(
  chain: ApprovalStep[],
  preApproverUserIds: readonly string[],
  requestorUserId: string,
): ApprovalStep[] {
  const eligible = [...new Set(preApproverUserIds)].filter((id) => id !== requestorUserId);
  if (eligible.length === 0) return chain;

  const preApproverSet = new Set(eligible);
  const shifted = chain
    .filter((step) => !(step.approverUserId != null && preApproverSet.has(step.approverUserId)))
    .map((step) => ({ ...step, step: step.step + 1 }));

  const preSteps: ApprovalStep[] = eligible.map((userId) => ({
    step: 1,
    approverRoleLabel: PRE_APPROVAL_LABEL,
    approverUserId: userId,
    approverParRole: null,
  }));

  return [...preSteps, ...shifted];
}
