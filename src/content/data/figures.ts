import type { Source } from "../blog/types";

/**
 * Cifrele citate în articole, într-un singur loc.
 *
 * Regula pe care o impune acest fișier: **o cifră nu poate ajunge în text fără sursa ei.** Blocul
 * `figureTable` referă cifrele prin `id`, iar randarea atașează automat sursa la subsolul
 * articolului. Deci „am scris 74% și am uitat de unde” nu e o greșeală de disciplină, e imposibilă.
 *
 * Al doilea lucru pe care îl impune: `scope`. O cifră FBI descrie Statele Unite, nu Moldova; o cifră
 * EBA descrie Spațiul Economic European; o cifră a Poliției RM din 2020 descrie 2020. Cel mai
 * frecvent mod de a minți cu o cifră adevărată este să-i tai domeniul de aplicare, așa că domeniul
 * merge cu ea peste tot.
 */

/** Cât de tare susține sursa cifra. Nu e o culoare de severitate, e o etichetă de proveniență. */
export type Evidence =
  /** Raport sau act al unei autorități, care măsoară ce spune că măsoară. */
  | "oficial"
  /** Cifră raportată de o autoritate, dar dependentă de cât s-a raportat (subestimare probabilă). */
  | "raportat"
  /** Cercetare sau măsurătoare proprie, cu metodă declarată. */
  | "propriu";

export type Figure = {
  id: string;
  /** Ce măsoară exact. Nu titlul articolului din care vine. */
  label: string;
  /** Valoarea, deja formatată, cu unitatea ei. Formatarea rămâne decizie editorială, nu de randare. */
  value: string;
  /** Cui i se aplică: teritoriu, perioadă, populație. Fără asta, cifra e o armă. */
  scope: string;
  evidence: Evidence;
  source: Source;
  /** Ce NU spune cifra. Apare sub ea, nu într-o notă de subsol. */
  caveat?: string;
};

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  oficial: "Oficial",
  raportat: "Raportat",
  propriu: "Propriu",
};

export const EVIDENCE_MEANING: Record<Evidence, string> = {
  oficial: "Publicată de o autoritate, în raportul ei propriu.",
  raportat: "Publicată de o autoritate, dar numără doar cazurile raportate ei.",
  propriu: "Măsurată de noi, cu metoda descrisă în articol.",
};

const IC3_2025: Source = {
  label: "FBI — Internet Crime Complaint Center, raportul anual 2025",
  url: "https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf",
  checked: "2026-08-29",
  locator: "Tabelele „By Complaint Count” și „By Complaint Loss”, rândul BEC",
};

const EBA_ECB_2025: Source = {
  label: "EBA & BCE — Report on Payment Fraud (EBA/REP/2025/40), decembrie 2025",
  url: "https://www.eba.europa.eu/sites/default/files/2025-12/1709846a-84d9-47cf-86a0-b155efb34d66/EBA%20and%20ECB%20Report%20on%20Payment%20Fraud.pdf",
  checked: "2026-08-29",
  locator: "Secțiunea privind transferurile credit și manipularea plătitorului",
};

const POLITIA_MD_2020: Source = {
  label: "Poliția Republicii Moldova — „Atenție la frauda «BEC Fraud»”, 4 noiembrie 2020 (arhivă)",
  url: "https://web.archive.org/web/20241101145254/https://politia.md/ro/content/atentie-la-frauda-bec-fraud",
  checked: "2026-08-29",
  locator: "Paragraful cu bilanțul pe 9 luni ale anului 2020",
};

const POLITIA_RO_2017: Source = {
  label: "Poliția Română — Recomandări pentru prevenirea Business E-mail Compromise Fraud (2017)",
  url: "https://politiaromana.ro/ro/comunicate/recomandari-pentru-prevenirea-business-e-mail-compromise-fraud",
  checked: "2026-08-29",
};

const EUROPOL_EFECTA: Source = {
  label: "Europol — European Financial and Economic Crime Threat Assessment",
  url: "https://www.europol.europa.eu/cms/sites/default/files/documents/The%20Other%20Side%20of%20the%20Coin%20-%20Analysis%20of%20Financial%20and%20Economic%20Crime%20(EN).pdf",
  checked: "2026-08-29",
  locator: "Secțiunea Business Email Compromise / payment diversion fraud",
};

const REG_UE_2024_886: Source = {
  label: "Regulamentul (UE) 2024/886 — verificarea beneficiarului la transferurile credit",
  url: "https://eur-lex.europa.eu/legal-content/RO/TXT/?uri=CELEX%3A32024R0886",
  checked: "2026-08-29",
  locator: "Articolul 5c, inclusiv alineatul (9) privind termenele de conformare",
};

const BNM_SEPA: Source = {
  label: "BNM — Republica Moldova s-a conectat la SEPA (6 octombrie 2025)",
  url: "https://www.bnm.md/en/content/today-republic-moldova-connected-sepa-fast-secure-and-low-cost-euro-payments-just-european",
  checked: "2026-08-29",
};

const FIGURES: Figure[] = [
  {
    id: "ic3-bec-loss-2025",
    label: "Pierderi raportate din compromiterea emailului de business (BEC)",
    value: "3,05 miliarde USD",
    scope: "Plângeri primite de FBI IC3 în 2025, majoritatea din Statele Unite",
    evidence: "raportat",
    source: IC3_2025,
    caveat:
      "Numără doar ce a fost raportat la IC3. O firmă care își recuperează banii prin bancă și nu depune plângere nu apare aici.",
  },
  {
    id: "ic3-bec-complaints-2025",
    label: "Număr de plângeri BEC",
    value: "24.768 în 2025",
    scope: "FBI IC3, 2025 (21.442 în 2024)",
    evidence: "raportat",
    source: IC3_2025,
  },
  {
    id: "eba-manipulation-share-2024",
    label: "Cât din valoarea transferurilor frauduloase vine din manipularea plătitorului",
    value: "74% în 2024",
    scope: "Spațiul Economic European, transferuri credit (65% în 2023)",
    evidence: "oficial",
    source: EBA_ECB_2025,
    caveat:
      "„Manipularea plătitorului” înseamnă că plata a fost autorizată corect, de omul potrivit — doar că spre contul greșit. Nu e o spargere de cont.",
  },
  {
    id: "eba-loss-borne-by-user-2024",
    label: "Cât din pierderile pe transferuri credit rămân la client, nu la bancă",
    value: "circa 85%",
    scope: "Spațiul Economic European, 2024",
    evidence: "oficial",
    source: EBA_ECB_2025,
    caveat: "Cifra descrie SEE. În Moldova nu există o statistică publică echivalentă.",
  },
  {
    id: "eba-total-payment-fraud-2024",
    label: "Valoarea totală a fraudei de plăți raportate",
    value: "4,2 miliarde EUR",
    scope: "Spațiul Economic European, 2024 (din care 2,5 miliarde pe transferuri credit)",
    evidence: "oficial",
    source: EBA_ECB_2025,
  },
  {
    id: "politia-md-bec-2020",
    label: "Cazuri de fraudă de tip BEC documentate în Republica Moldova",
    value: "16 cazuri, dintre care 5 tentative de substituire a rechizitelor bancare",
    scope: "Primele 9 luni ale anului 2020 — singura cifră publică moldovenească pe care am găsit-o",
    evidence: "raportat",
    source: POLITIA_MD_2020,
    caveat:
      "Are șase ani și pagina originală a Poliției nu mai răspunde; linkul duce la arhivă. Nu o folosi ca imagine a zilei de azi.",
  },
  {
    id: "politia-md-bec-2020-prejudiciu",
    label: "Prejudiciul din acele cazuri",
    value: "circa 167.148 EUR și 34.082 USD",
    scope: "Republica Moldova, primele 9 luni ale anului 2020",
    evidence: "raportat",
    source: POLITIA_MD_2020,
  },
  {
    id: "politia-ro-sesizari",
    label: "Sesizări oficiale de fraudă BEC înregistrate de Poliția Română",
    value: "peste 150",
    scope: "România, cumulat din 2016 până la comunicatul din 2017",
    evidence: "raportat",
    source: POLITIA_RO_2017,
  },
  {
    id: "vop-termen-non-euro",
    label: "De când băncile din statele UE din afara zonei euro trebuie să verifice beneficiarul",
    value: "9 iulie 2027",
    scope: "Uniunea Europeană (9 octombrie 2025 pentru statele din zona euro)",
    evidence: "oficial",
    source: REG_UE_2024_886,
    caveat:
      "Obligația privește prestatorii de servicii de plată din UE. Republica Moldova nu e stat membru, deci nu îi este opozabilă.",
  },
  {
    id: "moldova-sepa",
    label: "Data conectării Republicii Moldova la SEPA",
    value: "6 octombrie 2025",
    scope: "Republica Moldova, plăți în euro",
    evidence: "oficial",
    source: BNM_SEPA,
    caveat:
      "Apartenența la SEPA nu aduce cu ea verificarea obligatorie a beneficiarului — sunt lucruri diferite.",
  },
];

const BY_ID = new Map(FIGURES.map((f) => [f.id, f]));

export function figureById(id: string): Figure | undefined {
  return BY_ID.get(id);
}

/** Cifrele cerute, în ordinea cerută. Un id inexistent e sărit; testul de corpus îl prinde. */
export function figuresByIds(ids: string[]): Figure[] {
  return ids.map((id) => BY_ID.get(id)).filter((f): f is Figure => Boolean(f));
}

export function allFigureIds(): string[] {
  return FIGURES.map((f) => f.id);
}

/** Sursele cifrelor folosite, deduplicate după URL. */
export function sourcesOfFigures(ids: string[]): Source[] {
  const seen = new Map<string, Source>();
  for (const f of figuresByIds(ids)) if (!seen.has(f.source.url)) seen.set(f.source.url, f.source);
  return [...seen.values()];
}

/** Sume în text: 12500 → „12 500 MDL”. Spațiu îngust, ca cifrele să rămână scanabile. */
export function formatAmount(value: number, currency: "MDL" | "EUR" | "USD"): string {
  const formatted = new Intl.NumberFormat("ro-MD", { maximumFractionDigits: 0 }).format(value);
  return `${formatted} ${currency}`;
}
