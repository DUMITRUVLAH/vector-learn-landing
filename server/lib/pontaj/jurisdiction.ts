/**
 * PONTAJ-001 — jurisdicția pontajului: ce înseamnă „țara X" pentru evidența timpului de muncă.
 *
 * Un singur loc adună tot ce depinde de lege: simbolurile care se scriu în tabel, antetul și
 * legenda formularului tipărit, cu cât se scurtează ziua din ajunul unei sărbători și care e
 * temeiul fiecărei reguli. Adăugarea unei țări noi e o intrare în `JURISDICTIONS`, nu un `if`
 * împrăștiat prin rute și pagini.
 *
 * ── DE CE CODURILE STOCATE NU SE SCHIMBĂ PER ȚARĂ ─────────────────────────────
 * `pontaj_day_entries.symbol` și `pontaj_leaves.symbol` păstrează istoric. Dacă am rescrie
 * codurile pentru altă jurisdicție, fiecare rând vechi ar rămâne cu o etichetă orfană, exact
 * în documentul care se cere ca probă la Inspectoratul de Stat al Muncii. Deci: **codul stocat
 * rămâne stabil, abrevierea se traduce la randare** (`display`).
 *
 * ── SURSE ─────────────────────────────────────────────────────────────────────
 * MD  Convenția colectivă (nivel național) nr. 17 din 28 februarie 2020, anexă la art. 106
 *     din Codul muncii al Republicii Moldova — formular tipizat, simboluri impuse.
 * RO  Art. 119 din Legea nr. 53/2003 (Codul muncii) — obligă evidența zilnică, dar NU impune
 *     un formular sau un set de simboluri. Codurile de mai jos sunt convenția din contabilitatea
 *     românească, nu un model oficial — de aceea legenda nu citează niciun act ca sursă a
 *     simbolurilor, ci doar temeiul obligației de evidență.
 *
 * Portat din HR 365 (`src/lib/jurisdiction.ts`), redus la ce atinge pontajul: FinFlow nu are
 * bibliotecă de șabloane de acte, deci `legalRefs`/`localizeTemplateHtml` rămân acolo.
 */

export type CountryCode = "MD" | "RO" | "OTHER";

/** Codurile scrise în baza de date. Identice pentru toate jurisdicțiile — vezi nota de sus. */
export type TimesheetSymbolCode =
  | "P" | "R" | "Sn" | "C" | "Cn" | "Cm" | "Cc" | "D" | "A" | "Ls" | "Cs";

export const SYMBOL_CODES: readonly TimesheetSymbolCode[] = [
  "P", "R", "Sn", "C", "Cn", "Cm", "Cc", "D", "A", "Ls", "Cs",
];

/**
 * Simbolurile pe care le poate alege singur un angajat când își înregistrează o absență pe
 * interval. `P` lipsește (ziua lucrată nu e o „cerere"), la fel `R` și `Sn` — alea le pune
 * calendarul, nu omul.
 */
export const LEAVE_SYMBOLS: readonly TimesheetSymbolCode[] = [
  "C", "Cn", "Cm", "Cc", "Cs", "Ls", "D", "A",
];

export interface TimesheetSymbol {
  /** Ce se scrie în DB. Nu depinde de țară. */
  code: TimesheetSymbolCode;
  /** Abrevierea afișată în grilă, legendă și tipărire. Depinde de țară. */
  display: string;
  /** Ce înseamnă, pentru legendă și pentru lista de alegeri a angajatului. */
  label: string;
}

export interface TimesheetForm {
  /** Nota din colțul dreapta-sus (trimiterea la formularul oficial). Gol = fără. */
  annexLines: string[];
  title: string;
  /** Subtitlul de sub titlu — temeiul legal al obligației de evidență. Gol = fără. */
  legalBasis: string;
  /** Câmpurile „denumirea unității / subdiviziunii" din formularul MD. */
  showUnitFields: boolean;
  /** Cele trei rânduri de semnătură din subsol, în ordinea stânga / centru / dreapta. */
  signatures: [string, string, string];
  /** Legenda, pe 3 coloane. Fiecare rând are exact 3 celule (pot fi goale). */
  legend: [string, string, string][];
}

export interface Jurisdiction {
  code: CountryCode;
  label: string;
  /**
   * `false` ⇒ platforma NU are reguli legale pentru țara asta. UI-ul o spune explicit, ca
   * nimeni să nu creadă că cifrele au acoperire legală.
   */
  isAdapted: boolean;
  /** Numele codului muncii aplicabil, la nominativ — pentru textele afișate. */
  labourCode: string;
  /** Zilele de concediu anual de odihnă, ca reper afișat lângă temei. */
  annualLeaveDays: number;
  /** Cum se numără concediul anual: MD calendaristice, RO lucrătoare. */
  annualLeaveUnit: "calendar" | "working";
  annualLeaveLegalRef: string;
  /**
   * Cu câte MINUTE se scurtează ziua de muncă din ajunul unei sărbători nelucrătoare.
   * `0` = jurisdicția nu impune nicio reducere.
   *
   * MD: art. 102 din Codul muncii RM — ziua din ajun „se reduce cu cel puțin o oră pentru toți
   * salariații", cu excepția celor cu durată redusă a timpului de muncă (art. 96) sau cu zi de
   * muncă parțială (art. 97). Salariul NU se reduce. Deci la normă de 8h ziua din ajun are 7h —
   * nu 7h30: o reducere de 30 de minute e sub minimul legal.
   *
   * RO: Codul muncii (Legea 53/2003) nu are nicio prevedere de zi scurtă în ajun ⇒ `0`. Ce dă
   * contractul colectiv al clientului e alegerea lui și se marchează manual în pontaj.
   */
  preHolidayReductionMinutes: number;
  preHolidayLegalRef: string;
  /**
   * Norma zilnică întreagă, în minute (CM RM art. 95: 40 ore/săptămână ⇒ 8 ore/zi la o
   * săptămână de 5 zile). E reperul față de care se decide cine are dreptul la ziua scurtă din
   * ajun: cine lucrează deja sub normă nu se mai scurtează.
   */
  fullDailyNormMinutes: number;
  fullDailyNormLegalRef: string;
  /** Durata maximă a zilei pe care o poate declara cineva — gard împotriva greșelilor de tastare. */
  maxDailyMinutes: number;
  timesheetSymbols: TimesheetSymbol[];
  /** Abrevierea coloanelor de total, pe cheia internă (`zl`, `c`, `cn`…). */
  summaryShorts: Record<string, string>;
  timesheetForm: TimesheetForm;
}

/** Cheile coloanelor de total, în ordinea din formular. */
export const SUMMARY_COLS = [
  "zl", "r", "sn", "ls", "c", "cn", "cs", "cm", "cc", "d", "sp", "st2", "st", "dt", "a",
] as const;

export type SummaryCol = (typeof SUMMARY_COLS)[number];

/** Simbol stocat → coloana de total în care se numără. Nu depinde de țară. */
export const SYMBOL_TO_SUMMARY_COL: Record<string, SummaryCol> = {
  P: "zl", R: "r", Sn: "sn", C: "c", Cn: "cn", Cm: "cm",
  Cc: "cc", D: "d", A: "a", Ls: "ls", Cs: "cs",
};

const MD_SUMMARY_SHORTS: Record<string, string> = {
  zl: "ZL", r: "R", sn: "Sn", ls: "Ls", c: "C", cn: "Cn", cs: "Cs", cm: "Cm",
  cc: "Cc", d: "D", sp: "Sp", st2: "Șt", st: "St", dt: "Dt", a: "A",
};

const RO_SUMMARY_SHORTS: Record<string, string> = {
  zl: "ZL", r: "L", sn: "SL", ls: "CED", c: "CO", cn: "CFP", cs: "CS", cm: "CM",
  cc: "CPU", d: "D", sp: "Sp", st2: "Șt", st: "St", dt: "Dt", a: "AN",
};

/** Setul moldovenesc — simbolurile impuse de Convenția colectivă nr. 17/2020. */
const MD_SYMBOLS: TimesheetSymbol[] = [
  { code: "P",  display: "P",  label: "Zi lucrată (se scrie durata concretă, 1–12 ore)" },
  { code: "R",  display: "R",  label: "Zi de repaus (odihnă)" },
  { code: "Sn", display: "Sn", label: "Zi de sărbătoare nelucrătoare" },
  { code: "C",  display: "C",  label: "Concediu plătit (de odihnă anual)" },
  { code: "Cn", display: "Cn", label: "Concediu neplătit" },
  { code: "Cm", display: "Cm", label: "Concediu medical" },
  { code: "Cc", display: "Cc", label: "Concediu de maternitate / paternal" },
  { code: "Cs", display: "Cs", label: "Concediu de studii" },
  { code: "Ls", display: "Ls", label: "Zi liberă cu menținerea salariului" },
  { code: "D",  display: "D",  label: "Deplasare" },
  { code: "A",  display: "A",  label: "Absență" },
];

/**
 * Setul românesc — convenția din contabilitate, nu un formular oficial. Folosit și de
 * jurisdicția generică („Altă țară"): sunt abrevieri lizibile, iar alternativa ar fi fost să
 * inventăm un al treilea set fără niciun temei.
 */
const RO_SYMBOLS: TimesheetSymbol[] = [
  { code: "P",  display: "P",   label: "Zi lucrată (se scrie durata concretă, 1–12 ore)" },
  { code: "R",  display: "L",   label: "Zi liberă (repaus săptămânal)" },
  { code: "Sn", display: "SL",  label: "Sărbătoare legală" },
  { code: "C",  display: "CO",  label: "Concediu de odihnă" },
  { code: "Cn", display: "CFP", label: "Concediu fără plată" },
  { code: "Cm", display: "CM",  label: "Concediu medical" },
  { code: "Cc", display: "CPU", label: "Concediu paternal / creștere copil" },
  { code: "Cs", display: "CS",  label: "Concediu de studii" },
  { code: "Ls", display: "CED", label: "Concediu pentru evenimente deosebite" },
  { code: "D",  display: "D",   label: "Delegație / deplasare" },
  { code: "A",  display: "AN",  label: "Absență nemotivată" },
];

const MD_FORM: TimesheetForm = {
  annexLines: ["Anexa", "la Convenția colectivă (nivel național)", "nr. 17 din 28 februarie 2020"],
  title: "TABEL DE EVIDENȚĂ A TIMPULUI DE MUNCĂ",
  legalBasis: "",
  showUnitFields: true,
  signatures: [
    "Șeful subdiviziunii unității",
    "Persoana responsabilă de\nevidența timpului de muncă",
    "Serviciul resurse umane",
  ],
  legend: [
    ["1–12 ore (se indică durata concretă a timpului de muncă)", "Cn — concediu neplătit", "Sp — perioadă de suspendare a contractului individual de muncă"],
    ["R — zile de repaus (odihnă)", "Cs — concediu de studii", "Șt — șomaj tehnic"],
    ["Sn — zile de sărbătoare nelucrătoare", "Cm — concediu medical", "St — staționare"],
    ["Ls — zile libere cu menținerea salariului", "Cc — concediu de maternitate, paternal", "Dt — detașare"],
    ["C — concediu plătit", "D — deplasare", "A — absențe"],
  ],
};

const RO_FORM: TimesheetForm = {
  // Fără „Anexa la…": România nu are formular tipizat pentru pontaj. Un antet inventat ar fi
  // mai rău decât niciunul — ar sugera o conformitate falsă.
  annexLines: [],
  title: "FOAIE COLECTIVĂ DE PREZENȚĂ (PONTAJ)",
  legalBasis: "Evidența timpului de muncă — art. 119 din Legea nr. 53/2003 (Codul muncii)",
  showUnitFields: true,
  signatures: ["Întocmit", "Verificat", "Aprobat"],
  legend: [
    ["1–12 ore (se indică durata concretă a timpului de muncă)", "CFP — concediu fără plată", "Sp — suspendarea contractului individual de muncă"],
    ["L — zi liberă (repaus săptămânal)", "CS — concediu de studii", "Șt — șomaj tehnic"],
    ["SL — sărbătoare legală", "CM — concediu medical", "St — staționare"],
    ["CED — concediu pentru evenimente deosebite", "CPU — concediu paternal / creștere copil", "Dt — detașare"],
    ["CO — concediu de odihnă", "D — delegație / deplasare", "AN — absență nemotivată"],
  ],
};

const GENERIC_FORM: TimesheetForm = {
  annexLines: [],
  title: "PONTAJ — EVIDENȚA TIMPULUI DE MUNCĂ",
  // Nicio trimitere legală: nu știm ce lege se aplică. Vezi `isAdapted: false`.
  legalBasis: "",
  showUnitFields: true,
  signatures: ["Întocmit", "Verificat", "Aprobat"],
  legend: RO_FORM.legend,
};

export const JURISDICTIONS: Record<CountryCode, Jurisdiction> = {
  MD: {
    code: "MD",
    label: "Republica Moldova",
    isAdapted: true,
    labourCode: "Codul muncii al Republicii Moldova",
    annualLeaveDays: 28,
    annualLeaveUnit: "calendar",
    annualLeaveLegalRef: "art. 113 din Codul muncii al Republicii Moldova",
    preHolidayReductionMinutes: 60,
    preHolidayLegalRef: "art. 102 din Codul muncii al Republicii Moldova",
    fullDailyNormMinutes: 480,
    fullDailyNormLegalRef: "art. 95 din Codul muncii al Republicii Moldova",
    maxDailyMinutes: 720,
    timesheetSymbols: MD_SYMBOLS,
    summaryShorts: MD_SUMMARY_SHORTS,
    timesheetForm: MD_FORM,
  },
  RO: {
    code: "RO",
    label: "România",
    isAdapted: true,
    labourCode: "Codul muncii al României",
    // Art. 145 alin. (1): durata MINIMĂ e de 20 de zile lucrătoare. Multe contracte colective
    // dau 21+; aia e alegerea clientului. Implicitul platformei rămâne pragul legal, ca să nu
    // prezentăm o cifră negarantată sub eticheta „temei legal".
    annualLeaveDays: 20,
    annualLeaveUnit: "working",
    annualLeaveLegalRef: "art. 145 din Legea nr. 53/2003 (Codul muncii)",
    preHolidayReductionMinutes: 0,
    preHolidayLegalRef: "",
    // Art. 112 alin. (1): 8 ore pe zi, 40 pe săptămână.
    fullDailyNormMinutes: 480,
    fullDailyNormLegalRef: "art. 112 din Legea nr. 53/2003 (Codul muncii)",
    maxDailyMinutes: 720,
    timesheetSymbols: RO_SYMBOLS,
    summaryShorts: RO_SUMMARY_SHORTS,
    timesheetForm: RO_FORM,
  },
  OTHER: {
    code: "OTHER",
    label: "Altă țară",
    isAdapted: false,
    labourCode: "legislația muncii aplicabilă",
    // Valoare neutră de pornire, fără pretenție legală.
    annualLeaveDays: 20,
    annualLeaveUnit: "working",
    annualLeaveLegalRef: "",
    // Nu știm ce lege se aplică — deci nu inventăm o reducere.
    preHolidayReductionMinutes: 0,
    preHolidayLegalRef: "",
    fullDailyNormMinutes: 480,
    fullDailyNormLegalRef: "",
    maxDailyMinutes: 720,
    timesheetSymbols: RO_SYMBOLS,
    summaryShorts: RO_SUMMARY_SHORTS,
    timesheetForm: GENERIC_FORM,
  },
};

/**
 * Normalizează orice vine din DB la o jurisdicție cunoscută. Coloana e `varchar`, nu enum
 * (ca sync-schema să o poată adăuga singură), deci o valoare necunoscută trebuie să cadă pe
 * generic, nu să prăbușească ruta.
 */
export function resolveCountry(value: string | null | undefined): CountryCode {
  if (value === "MD" || value === "RO") return value;
  if (!value) return "MD"; // implicitul produsului: clientul plătitor e din Moldova
  return "OTHER";
}

export function getJurisdiction(value: string | null | undefined): Jurisdiction {
  return JURISDICTIONS[resolveCountry(value)];
}

/** Abrevierea afișată pentru un cod stocat. Codurile necunoscute se afișează ca atare. */
export function symbolDisplay(j: Jurisdiction, code: string): string {
  return j.timesheetSymbols.find((s) => s.code === code)?.display ?? code;
}

export function isKnownSymbol(code: string): code is TimesheetSymbolCode {
  return (SYMBOL_CODES as readonly string[]).includes(code);
}

export function isLeaveSymbol(code: string): code is TimesheetSymbolCode {
  return (LEAVE_SYMBOLS as readonly string[]).includes(code);
}
