/**
 * ITPARK-501: Letter templates for confirmation letters
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 *
 * 5 types of confirmation letters:
 *   letter_no_adjustments    — scrisoare că nu există ajustări
 *   letter_address           — scrisoare privind adresa juridică
 *   letter_no_subdivisions   — scrisoare că nu există subdiviziuni
 *   letter_activity          — scrisoare privind obiectul de activitate
 *   letter_solvency          — scrisoare privind solvabilitatea
 *
 * All letters are pre-filled from engagement data.
 * CRITICAL: NO "XXX" or "Numele Prenumele" placeholders — all must be real values.
 * Default date: today (ISO format)
 */

import type { ItparkEngagement } from "@/lib/api/itparkEngagements";

export interface LetterData {
  kind: string;
  title: string;
  /** Pre-filled text content — no placeholders */
  body: string;
  /** Date of the letter (ISO date string, default today) */
  date: string;
  /** Signatory (from engagement administrator / audit firm) */
  signatory: string;
  /** Position of signatory */
  signatoryPosition: string;
}

/** Format period for letter text */
function fmtPeriod(start: string, end: string): string {
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("ro-MD", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Today in ISO format (YYYY-MM-DD) */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * generateLetterBody(kind, engagement) — generate pre-filled letter body
 *
 * All values come from the engagement object.
 * If a required field is missing, a safe fallback is used (never XXX or placeholder).
 */
export function generateLetterBodies(
  engagement: Pick<
    ItparkEngagement,
    | "residentName"
    | "idno"
    | "periodStart"
    | "periodEnd"
    | "legalAddress"
    | "subdivisionAddresses"
    | "vatPayer"
    | "mitpContractNo"
    | "mitpContractDate"
    | "auditFirmName"
    | "reportingYear"
  >
): Record<string, LetterData> {
  const {
    residentName,
    idno,
    periodStart,
    periodEnd,
    legalAddress,
    subdivisionAddresses,
    mitpContractNo,
    mitpContractDate,
    auditFirmName,
    reportingYear,
  } = engagement;

  const period = fmtPeriod(periodStart, periodEnd);
  const addr = legalAddress || "adresă juridică nespecificată";
  const contractRef = mitpContractNo
    ? `nr. ${mitpContractNo}${mitpContractDate ? ` din ${new Date(mitpContractDate).toLocaleDateString("ro-MD")}` : ""}`
    : "contract MITP";
  const today = todayISO();
  const signatory = auditFirmName || residentName;

  return {
    letter_no_adjustments: {
      kind: "letter_no_adjustments",
      title: "Scrisoare privind absența ajustărilor",
      date: today,
      signatory,
      signatoryPosition: "Administrator",
      body: `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT, în temeiul ${contractRef}, declar că în perioada ${period} nu au fost efectuate ajustări ale veniturilor din vânzări raportate în Anexa 3 la raportul de audit.\n\nToate veniturile eligibile reflectate în raport reprezintă tranzacții reale și complete, fără ajustări retroactive sau reclasificări efectuate ulterior perioadei de audit.\n\nPrezenta scrisoare este emisă pentru a fi anexată la dosarul de verificare MITP pentru ${reportingYear}.`,
    },

    letter_address: {
      kind: "letter_address",
      title: "Scrisoare privind adresa juridică",
      date: today,
      signatory,
      signatoryPosition: "Administrator",
      body: `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT, confirm că în perioada ${period} adresa juridică înregistrată a societății a fost:\n\n${addr}\n\nAceastă adresă a rămas neschimbată pe parcursul întregii perioade de audit și corespunde datelor din Registrul de Stat al Persoanelor Juridice.\n\nPrezenta scrisoare este emisă pentru a fi anexată la dosarul de verificare MITP pentru ${reportingYear}.`,
    },

    letter_no_subdivisions: {
      kind: "letter_no_subdivisions",
      title: "Scrisoare privind absența subdiviziunilor",
      date: today,
      signatory,
      signatoryPosition: "Administrator",
      body: subdivisionAddresses
        ? `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT, confirm că în perioada ${period} societatea a deținut subdiviziuni la următoarele adrese:\n\n${subdivisionAddresses}\n\nActivitățile desfășurate la aceste adrese au fost în mod exclusiv de natură eligibilă IT Park, conform ${contractRef}.\n\nPrezenta scrisoare este emisă pentru a fi anexată la dosarul de verificare MITP pentru ${reportingYear}.`
        : `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT, declar că în perioada ${period} societatea nu a deținut subdiviziuni, filiale sau reprezentanțe suplimentare față de sediul juridic principal înregistrat.\n\nToate activitățile au fost desfășurate exclusiv la sediul înregistrat: ${addr}.\n\nPrezenta scrisoare este emisă pentru a fi anexată la dosarul de verificare MITP pentru ${reportingYear}.`,
    },

    letter_activity: {
      kind: "letter_activity",
      title: "Scrisoare privind obiectul de activitate",
      date: today,
      signatory,
      signatoryPosition: "Administrator",
      body: `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT în temeiul ${contractRef}, confirm că în perioada ${period} obiectul principal de activitate al societății a constat exclusiv în prestarea de servicii eligibile regimului IT Park, conform codurilor CAEM declarate și înregistrate.\n\nActivitățile desfășurate au respectat cerințele Legii nr. 77 din 21 aprilie 2016 cu privire la parcurile de tehnologii ale informației și condițiile contractului de rezidență.\n\nPrezenta scrisoare este emisă pentru a fi anexată la dosarul de verificare MITP pentru ${reportingYear}.`,
    },

    letter_solvency: {
      kind: "letter_solvency",
      title: "Scrisoare privind solvabilitatea",
      date: today,
      signatory,
      signatoryPosition: "Administrator",
      body: `Subsemnatul, ${residentName} (IDNO ${idno}), rezident al Parcului Tehnologic IT, declar că în perioada ${period} societatea nu s-a aflat în niciuna din situațiile prevăzute de legislație care ar afecta statutul de rezident IT Park:\n\n• Nu s-a aflat în stare de insolvabilitate sau faliment;\n• Nu a inițiat procedura de lichidare voluntară sau forțată;\n• Nu a fost supusă restructurării judiciare;\n• Nu a suspendat activitatea de bază;\n• Nu au fost inițiate proceduri legale cu impact semnificativ asupra activității.\n\nSocietatea și-a îndeplinit toate obligațiile fiscale și contractuale pe parcursul perioadei de audit.\n\nPrezenta scrisoare este emisă în conformitate cu art. 18 alin. (1) din Legea nr. 77/2016 și este destinată dosarului de verificare MITP pentru ${reportingYear}.`,
    },
  };
}
