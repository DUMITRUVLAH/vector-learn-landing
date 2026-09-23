/**
 * Completările făcute de FINANȚE după ce cererea a fost semnată.
 *
 * Cerută de managerul financiar (Violeta Bordeniuc, 22.09.2026): „posibilitatea de a edita post
 * semnare: linia de buget, adăugare descriere dacă e nevoie și inserare de acte adiționale la
 * atașament. După semnare și plată nu mai putem modifica sumele însă."
 *
 * Deci: o cerere semnată NU se mai redeschide la editare, dar dosarul ei se poate COMPLETA —
 * și doar de finanțe, doar pe câmpurile care nu schimbă banii:
 *
 *   ✔ cod bugetar (linia de buget) + nota de lângă el — corectura tipică de la finanțe, cheltuiala
 *     se pune pe linia potrivită fără să se anuleze și să se refacă cererea;
 *   ✔ descrierea utilizării finale (secțiunea 11) — ce s-a cumpărat, în clar, pentru contabilitate;
 *   ✔ nota anexelor (secțiunea 13) — unde se trec actele adiționale adăugate la dosar;
 *   ✘ sume, linii, monedă, beneficiar, IBAN, termene, urgență — NICIODATĂ pe calea asta. Ele sunt
 *     ce a semnat aprobatorul; dacă se schimbă, cererea trebuie retrasă și re-semnată.
 *
 * Lista albă e aici, într-un modul pur, ca să poată fi testată fără bază de date ȘI ca ruta să nu
 * aibă două adevăruri despre ce se poate schimba. Orice câmp nou din `updateParSchema` e implicit
 * INTERZIS după semnare — se adaugă aici explicit doar dacă e la fel de inofensiv pentru bani.
 */

/** Statusurile în care semnăturile există deja, iar cererea e (sau a fost) la finanțe. */
export const FINANCE_STAGE_STATUSES = [
  "approved",
  "in_finance",
  "reapproval_required",
  "paid",
] as const;

export type FinanceStageStatus = (typeof FINANCE_STAGE_STATUSES)[number];

export function isFinanceStageStatus(status: string | null | undefined): boolean {
  return !!status && (FINANCE_STAGE_STATUSES as readonly string[]).includes(status);
}

/**
 * Cine are dreptul: rolul PAR de finanțe. `par_admin` intră cu el pentru că e administratorul
 * modulului — aceeași pereche e deja folosită pentru atașamentele de la etapa de finanțe
 * (server/routes/parAttachments.ts). Solicitantul și aprobatorul NU intră, nici pe cererea lor.
 */
export function hasFinanceRole(roles: readonly string[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.includes("finance") || roles.includes("par_admin");
}

export function canFinanceAmend(params: {
  roles: readonly string[] | null | undefined;
  status: string | null | undefined;
}): boolean {
  return hasFinanceRole(params.roles) && isFinanceStageStatus(params.status);
}

/** Cheile din corpul PATCH pe care finanțele le pot trimite după semnare. */
export const FINANCE_AMENDABLE_FIELDS = [
  "budget_code_id",
  "budget_code_note",
  "end_use",
  "attachments_note",
] as const;

export type FinanceAmendableField = (typeof FINANCE_AMENDABLE_FIELDS)[number];

/** Eticheta omenească a câmpului, pentru mesajul de refuz și pentru jurnal. */
export const FINANCE_FIELD_LABELS: Record<string, string> = {
  budget_code_id: "linia de buget",
  budget_code_note: "nota liniei de buget",
  end_use: "descrierea utilizării finale",
  attachments_note: "nota anexelor",
};

/** Aceleași câmpuri, pentru formularul tipărit — care e în engleză, cap-coadă. */
export const FINANCE_FIELD_LABELS_EN: Record<string, string> = {
  budget_code_id: "budget line",
  budget_code_note: "budget line note",
  end_use: "end-use description",
  attachments_note: "attachments note",
};

/** Coloana din `par_requests` → câmpul din corpul cererii (jurnalul scrie coloane, nu câmpuri). */
export const AMENDED_COLUMN_TO_FIELD: Record<string, string> = {
  budgetCodeId: "budget_code_id",
  budgetCodeNote: "budget_code_note",
  endUse: "end_use",
  attachmentsNote: "attachments_note",
  attachmentsPresent: "attachments_note",
};

/**
 * Câmpurile atinse de o completare, citite din `diff`-ul salvat în jurnal. Întoarce chei
 * (`budget_code_id`), nu etichete: fiecare ecran alege limba în care le scrie.
 */
export function amendedFields(diffJson: string | null | undefined): string[] {
  if (!diffJson) return [];
  try {
    const parsed = JSON.parse(diffJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return [];
    return [...new Set(Object.keys(parsed).map((col) => AMENDED_COLUMN_TO_FIELD[col] ?? col))];
  } catch {
    // Un rând vechi cu diff nevalid nu are voie să strice deschiderea cererii.
    return [];
  }
}

/** Etichetele acelorași câmpuri, în română (fișă, jurnal) sau engleză (formularul tipărit). */
export function amendedFieldLabels(
  diffJson: string | null | undefined,
  lang: "ro" | "en" = "ro"
): string[] {
  const labels = lang === "en" ? FINANCE_FIELD_LABELS_EN : FINANCE_FIELD_LABELS;
  return amendedFields(diffJson).map((f) => labels[f] ?? f);
}

/**
 * Împarte corpul cererii în „ce are voie" și „ce e blocat după semnare".
 *
 * `sentKeys` sunt cheile trimise CU ADEVĂRAT de client (din corpul BRUT). Corpul validat nu e o
 * sursă bună pentru întrebarea „ce a vrut să schimbe": zod rulează `.transform()` și pe câmpurile
 * absente, iar `payee_name`/`payee_bank` au o curățare de text lipit — deci ele apar în obiectul
 * validat cu `null` chiar dacă nimeni nu le-a atins. Prima rulare a probei end-to-end (22.09.2026)
 * a picat exact așa: o completare curată a liniei de buget era refuzată pentru „modificarea"
 * beneficiarului, pe care formularul nici nu-l trimisese. Valorile se iau tot din corpul validat
 * (cu normalizările lui), doar lista de chei vine din cel brut.
 *
 * Fără `sentKeys`, regula e cea simplă: `undefined` = neatins, `null` = schimbare explicită la gol.
 */
export function splitFinanceAmendment<T extends Record<string, unknown>>(
  body: T,
  sentKeys?: readonly string[]
): { amendment: Partial<T>; blocked: string[] } {
  return splitAmendment(body, FINANCE_AMENDABLE_FIELDS, sentKeys);
}

/**
 * Aceeași împărțire, pe o listă albă dată. O folosește și verificatorul solicitantului
 * (`requesterVerifier.ts`), care are propria listă — dar aceeași capcană cu cheile brute.
 */
export function splitAmendment<T extends Record<string, unknown>>(
  body: T,
  allowedFields: readonly string[],
  sentKeys?: readonly string[]
): { amendment: Partial<T>; blocked: string[] } {
  const amendment: Partial<T> = {};
  const blocked: string[] = [];
  const allowed = allowedFields;
  const keys = sentKeys ?? Object.keys(body);

  for (const key of keys) {
    const value = body[key as keyof T];
    if (!allowed.includes(key)) {
      // Un câmp interzis rămâne interzis și când vine gol: clientul tot l-a trimis. (Când lista de
      // chei e dedusă din corpul validat, `undefined` înseamnă în schimb „neatins".)
      if (sentKeys || value !== undefined) blocked.push(key);
      continue;
    }
    if (value === undefined) continue;
    amendment[key as keyof T] = value as T[keyof T];
  }

  return { amendment, blocked };
}

/** Fraza pe care o citește omul de la finanțe când a trimis un câmp interzis. */
export function blockedFieldsMessage(blocked: readonly string[]): string {
  const labels = blocked.map((f) => FINANCE_FIELD_LABELS[f] ?? f);
  return `După semnare se pot completa doar linia de buget, descrierea și nota anexelor. Nu se mai pot modifica: ${labels.join(", ")}.`;
}
