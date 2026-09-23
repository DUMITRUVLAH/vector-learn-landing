/**
 * Verificatorul solicitantului — primul care vede cererea, înaintea oricărui aprobator.
 *
 * Cererea owner-ului (23.09.2026, ATIC): „Iulian m-a rugat ca mereu să aprobe de la colegele sale
 * Cristina Onicov și Marina Certan PAR-urile înainte să ajungă la aprobatori, și el să le poată
 * modifica sau întoarce — singur să schimbe budget line și alte modificări — și deja mai departe
 * se duc la aprobatorii workspace-ului."
 *
 * De ce pe OM și nu pe proiect: pre-aprobarea de proiect (`preApprovers.ts`, 16.09) cere semnătura
 * pe TOATE cererile unui proiect. Pe LED 3/Youth Maker club depun și Cristina Sîrbu și finanțele —
 * cereri pe care Iulian nu le-a cerut. Verificatorul e relația „șef direct": setată pe profilul
 * fiecărui om (Administrare PAR → Membri), valabilă pe orice proiect ar depune el.
 *
 * Ce aduce, în ordine:
 *   1. **un pas nou în fața lanțului**, pe numele verificatorului — înaintea pre-aprobării de proiect
 *      și a matricei DOA. Restul mașinăriei (blocare, inbox, digest, PDF) îl tratează ca pe orice
 *      pas pe nume, deci nu are cum să se comporte altfel decât pașii deja verificați;
 *   2. **corectura pe loc**, cât timp pasul lui e deschis: linia de buget, evenimentul, descrierea,
 *      data necesară. Niciun aprobator n-a semnat încă, deci toți vor semna varianta corectată;
 *   3. **întoarcerea** — „Cere modificări", care există deja pentru orice pas pe nume.
 *
 * Ce NU aduce, deliberat: sume, linii, monedă, beneficiar, proiect. Ele schimbă ce s-a semnat la
 * depunere și, pentru sume/proiect, și cine trebuie să semneze mai departe (banda DOA). Pentru ele
 * verificatorul întoarce cererea, iar solicitantul o re-trimite — lanțul se reface corect singur.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parMemberProfiles, parMembers } from "../../db/schema/par";
import { users } from "../../db/schema/users";
import type { ApprovalStep } from "./doa";
import { accessibleProjectIds, mayAccessPayer, mayAccessProject } from "./projectScope";

/** Eticheta pasului. Un rol, nu un nume — vezi `slotRoleLabel` din doa.ts. */
export const VERIFIER_LABEL = "Verificare";

/** True pentru „coloana/relația nu există" — coloana poate rămâne în urma codului la deploy. */
function isMissingSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /verifier_user_id.*does not exist|column .*does not exist|relation .*does not exist|no such (table|column)/i.test(
    msg
  );
}

/**
 * Verificatorul setat pentru acest solicitant, dacă încă poate semna.
 *
 * `null` când: nu e setat; e chiar solicitantul (nu se verifică singur); verificatorul nu mai e
 * membru PAR (i s-au retras rolurile — un pas pe numele lui ar bloca cererea pentru totdeauna).
 * Dacă coloana lipsește încă pe baza live, răspunsul e tot `null`: o depunere nu are voie să pice
 * pentru că o migrare a întârziat — aceeași plasă ca la `preApprovers.ts`.
 */
export async function getRequesterVerifier(tenantId: string, requesterUserId: string): Promise<string | null> {
  try {
    const [profile] = await db
      .select({ verifierUserId: parMemberProfiles.verifierUserId })
      .from(parMemberProfiles)
      .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.userId, requesterUserId)));
    const verifierUserId = profile?.verifierUserId ?? null;
    if (!verifierUserId || verifierUserId === requesterUserId) return null;
    const [member] = await db
      .select({ id: parMembers.id })
      .from(parMembers)
      .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, verifierUserId)))
      .limit(1);
    return member ? verifierUserId : null;
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

/** Verifică omul ăsta cererile cuiva? Deschide inboxul de aprobare cui n-are rolul de aprobator. */
export async function isVerifierOfAnyone(tenantId: string, userId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: parMemberProfiles.id })
      .from(parMemberProfiles)
      .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.verifierUserId, userId)))
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    if (isMissingSchema(err)) return false;
    throw err;
  }
}

async function tenantRoleOf(tenantId: string, userId: string): Promise<string | undefined> {
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  return u?.role ?? undefined;
}

/** Poate verificatorul deschide cererea asta? Aceeași arie ca rutele de aprobare. */
export async function verifierCanReachPar(
  tenantId: string,
  verifierUserId: string,
  par: { projectId: string | null; payerId: string | null }
): Promise<boolean> {
  const role = await tenantRoleOf(tenantId, verifierUserId);
  return par.projectId
    ? mayAccessProject(verifierUserId, tenantId, par.projectId, role)
    : mayAccessPayer(verifierUserId, tenantId, par.payerId, role);
}

/**
 * Proiectele la care ajunge solicitantul, dar verificatorul NU. Lista goală = verificatorul
 * acoperă tot. Se verifică la SALVAREA configurării, nu la depunere: altfel greșeala ar ieși la
 * iveală abia pe o cerere reală, blocată pe un pas pe care omul lui nu-l poate deschide.
 * `null` în loc de listă = solicitantul e fără restricție (admin), iar verificatorul nu.
 */
export async function verifierScopeGap(
  tenantId: string,
  verifierUserId: string,
  requesterUserId: string
): Promise<string[] | null> {
  const [verifierRole, requesterRole] = await Promise.all([
    tenantRoleOf(tenantId, verifierUserId),
    tenantRoleOf(tenantId, requesterUserId),
  ]);
  const [verifierProjects, requesterProjects] = await Promise.all([
    accessibleProjectIds(verifierUserId, tenantId, verifierRole),
    accessibleProjectIds(requesterUserId, tenantId, requesterRole),
  ]);
  if (verifierProjects === null) return [];
  if (requesterProjects === null) return null;
  const covered = new Set(verifierProjects);
  return requesterProjects.filter((id) => !covered.has(id));
}

/**
 * PUR: lanțul cu pasul de verificare pus în față.
 *
 * Reguli:
 *   - fără verificator, ori verificatorul e solicitantul → lanțul rămâne neatins;
 *   - dacă verificatorul e ținut pe nume pe PRIMUL nivel al lanțului (pre-aprobator de proiect,
 *     aprobator pe primul pas DOA), rândul acela se scoate: semnătura lui de verificare vine
 *     imediat înaintea lui, pe aceeași cerere, deci n-ar adăuga nimic;
 *   - pe un nivel MAI TÂRZIU rândul lui rămâne: acolo semnează ca autoritate DOA (director, plafon
 *     mare). Scos, ar urca în locul lui un nivel inferior ca semnătură finală — ordinea DOA s-ar
 *     inversa, iar plafonul de aprobare al celui rămas ar bloca cererea (revizie 23.09.2026);
 *   - pașii pe ROL nu se ating (acolo nu se știe cine va semna);
 *   - restul se decalează cu un nivel, păstrându-și ordinea și grupările paralele.
 *
 * Verificatorul stă SINGUR pe primul nivel, nu în paralel cu pre-aprobatorii de proiect: el poate
 * corecta cererea, iar o semnătură pusă în paralel, înaintea corecturii, ar rămâne pe o variantă
 * care nu mai există.
 */
export function withRequesterVerification(
  chain: ApprovalStep[],
  verifierUserId: string | null,
  requesterUserId: string
): ApprovalStep[] {
  if (!verifierUserId || verifierUserId === requesterUserId) return chain;
  const firstLevel = chain.length ? Math.min(...chain.map((s) => s.step)) : null;
  const shifted = chain
    .filter((step) => !(step.step === firstLevel && step.approverUserId === verifierUserId))
    .map((step) => ({ ...step, step: step.step + 1 }));
  return [
    { step: 1, approverRoleLabel: VERIFIER_LABEL, approverUserId: verifierUserId, approverParRole: null },
    ...shifted,
  ];
}

// ─── Corectura făcută de verificator ─────────────────────────────────────────

/** Cheile din corpul PATCH pe care verificatorul le poate schimba cât timp pasul lui e deschis. */
export const VERIFIER_AMENDABLE_FIELDS = [
  "budget_code_id",
  "budget_code_note",
  "event_id",
  "end_use",
  "date_needed",
] as const;

export const VERIFIER_FIELD_LABELS: Record<string, string> = {
  budget_code_id: "linia de buget",
  budget_code_note: "nota liniei de buget",
  event_id: "evenimentul",
  end_use: "descrierea utilizării finale",
  date_needed: "data necesară",
};

/** Aceleași câmpuri, pentru formularul tipărit — care e în engleză, cap-coadă. */
export const VERIFIER_FIELD_LABELS_EN: Record<string, string> = {
  budget_code_id: "budget line",
  budget_code_note: "budget line note",
  event_id: "event",
  end_use: "end-use description",
  date_needed: "date needed",
};

/** Coloana din `par_requests` → câmpul din corpul cererii (jurnalul scrie coloane). */
const VERIFIER_COLUMN_TO_FIELD: Record<string, string> = {
  budgetCodeId: "budget_code_id",
  budgetCodeNote: "budget_code_note",
  eventId: "event_id",
  endUse: "end_use",
  dateNeeded: "date_needed",
};

/** Etichetele câmpurilor atinse de o corectură, citite din `diff`-ul salvat în jurnal. */
export function verifierAmendedFieldLabels(diffJson: string | null | undefined, lang: "ro" | "en" = "ro"): string[] {
  if (!diffJson) return [];
  const labels = lang === "en" ? VERIFIER_FIELD_LABELS_EN : VERIFIER_FIELD_LABELS;
  try {
    const parsed = JSON.parse(diffJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return [];
    const fields = [...new Set(Object.keys(parsed).map((col) => VERIFIER_COLUMN_TO_FIELD[col] ?? col))];
    return fields.map((f) => labels[f] ?? f);
  } catch {
    // Un rând vechi cu diff nevalid nu are voie să strice deschiderea cererii.
    return [];
  }
}

/** Fraza pe care o citește verificatorul când a trimis un câmp pe care nu-l poate schimba. */
export function verifierBlockedMessage(blocked: readonly string[]): string {
  const labels = blocked.map((f) => VERIFIER_FIELD_LABELS[f] ?? f);
  return (
    "La verificare se pot corecta linia de buget, evenimentul, descrierea și data necesară. " +
    `Pentru ${labels.join(", ")} întoarce cererea solicitantului („Cere modificări").`
  );
}

interface StepLike {
  id: string;
  step: number;
  approverUserId: string | null;
  approverRoleLabel: string | null;
  decision: string;
  locked: boolean;
}

/** Pasul de verificare DESCHIS al acestui om pe cerere (nesemnat, deblocat), dacă există. */
export function openVerifierStep<T extends StepLike>(steps: readonly T[], userId: string): T | null {
  return (
    steps.find(
      (s) =>
        s.step > 0 &&
        s.approverRoleLabel === VERIFIER_LABEL &&
        s.approverUserId === userId &&
        s.decision === "pending" &&
        !s.locked
    ) ?? null
  );
}

/**
 * Poate omul ăsta corecta cererea ACUM? Patru condiții, toate necesare:
 *   - cererea așteaptă aprobare (după semnături, corectura e a finanțelor — `postSignatureEdit.ts`);
 *   - pasul lui de verificare e deschis (după ce a semnat, cererea e deja la alții);
 *   - NIMENI altcineva n-a semnat încă (în afară de solicitant, la pasul 0). Eticheta pasului e
 *     text liber în matricea DOA: un pas DOA numit tot „Verificare", deschis după ce altcineva a
 *     semnat, n-are voie să rescrie o cerere deja semnată (revizie 23.09.2026);
 *   - e ÎNCĂ verificatorul solicitantului. Dacă administratorul l-a schimbat între timp, pasul
 *     rămas pe numele lui îl lasă să semneze sau să întoarcă, dar nu să rescrie cererea.
 */
export function canVerifierAmend(params: {
  status: string | null | undefined;
  steps: readonly StepLike[];
  userId: string;
  currentVerifierUserId: string | null;
}): boolean {
  if (params.status !== "pending_approval") return false;
  if (!params.currentVerifierUserId || params.currentVerifierUserId !== params.userId) return false;
  const mine = openVerifierStep(params.steps, params.userId);
  if (!mine) return false;
  return params.steps.every((s) => s.step === 0 || s.id === mine.id || s.decision === "pending");
}
