// Import de lead-uri din fișier — PORTAT din crm-vector (`src/lib/crm/importFile.ts`).
//
// Ce s-a schimbat față de sursă:
//   · rulează pe SERVER, nu în browser — parsarea unui fișier de 800 de rânduri
//     nu are ce căuta în tabul utilizatorului, iar scrierea trebuie oricum
//     filtrată pe workspace;
//   · `.xlsx` NU se citește prin SheetJS (cum făcea sursa), ci prin `exceljs` —
//     dependință care exista deja în repo, la DocMerge. Zero dependințe noi, și
//     una mai puțin cu istoric de CVE-uri. Vezi `parseWorkbookTable` mai jos.
//
// Ce NU s-a schimbat, fiindcă sursa avea dreptate:
//   · parserul respectă RFC 4180 (ghilimele, `""` escapat, rânduri noi în
//     interiorul unui câmp, CRLF, BOM) — un `split(",")` naiv rupe orice export
//     real de Excel;
//   · detectăm separatorul, fiindcă Excel-ul românesc scrie punct-și-virgulă;
//   · un rând FĂRĂ nicio cale de contact e EROARE, nu inserare tăcută.

import { normalizeEmail, normalizePhone } from "./normalize";

/** Numele normalizat pentru comparații: fără diacritice, fără spații duble, lowercase.
 *  Sursa îl avea în `normalize.ts`; aici e local, ca să nu atingem modulul comun. */
function normalizeNameLocal(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// ─── Parsare delimitată (CSV/TSV) ───────────────────────────────────────────

export type Delimiter = "," | ";" | "\t";

/** Ghicește delimitatorul dintr-un eșantion de text, numărând ocurențele din
 * prima linie ne-goală, IGNORÂND cele aflate în interiorul ghilimelelor (un
 * "1,2 Str. X" nu trebuie să păcălească detecția când fișierul e ";"-delimitat,
 * cum exportă Excel pe un locale românesc/european). */
export function detectDelimiter(sample: string): Delimiter {
  const firstLine =
    sample.split(/\r\n|\r|\n/).find((l) => l.trim().length > 0) ?? sample;

  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch as Delimiter] += 1;
    }
  }

  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"] as const) {
    if (counts[d] > bestCount) {
      bestCount = counts[d];
      best = d;
    }
  }
  return best;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** Câte rânduri acceptăm dintr-un registru — aceeași limită ca la DocMerge. */
const MAX_WORKBOOK_ROWS = 5000;

/**
 * Citește prima foaie a unui `.xlsx`/`.xls` în ACEEAȘI formă ca un CSV (cerința 1 din caietul de
 * sarcini: „Import masiv de companii din fișiere Excel/CSV").
 *
 * De ce prin `exceljs` și nu prin SheetJS, cum făcea crm-vector: `exceljs` e deja în repo
 * (DocMerge îl folosește), deci nu adăugăm o dependință — și încă una cu istoric de vulnerabilități.
 *
 * IMPORTANT — importul e LAZY, înadins. Un `import` la nivel de fișier al lui `exceljs` a dărâmat
 * o dată tot API-ul în producție (vezi docs/solutions/par-port-and-exceljs-lazy.md). Biblioteca se
 * încarcă doar când cineva chiar urcă un registru.
 *
 * Valorile se aduc la text: importul lucrează cu șiruri, iar conversiile (bani, date) se fac mai
 * jos, o singură dată, indiferent dacă rândul a venit din CSV sau din Excel.
 */
export async function parseWorkbookTable(buffer: Buffer): Promise<ParsedTable> {
  const { default: ExcelJS } = (await import("exceljs")) as { default: typeof import("exceljs") };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  if (sheet.rowCount > MAX_WORKBOOK_ROWS + 1) {
    throw new Error(`Registrul are ${sheet.rowCount} rânduri; limita e ${MAX_WORKBOOK_ROWS}. Împarte-l în fișiere mai mici.`);
  }

  /** Celula, ca text: formulele dau rezultatul, nu formula; datele ies ISO, nu „Mon Sep 14 2026". */
  const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") {
      const v = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }>; hyperlink?: string };
      if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("");
      if (v.result !== undefined) return String(v.result);
      if (v.text !== undefined) return String(v.text);
      if (v.hyperlink) return String(v.hyperlink);
      return "";
    }
    return String(value);
  };

  const rows: string[][] = [];
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values: string[] = [];
    // `row.values` are un element gol la index 0 (exceljs numără coloanele de la 1).
    const raw = row.values as unknown[];
    for (let i = 1; i < raw.length; i++) values.push(cellText(raw[i]).trim());
    if (rowNumber === 1) headers = values;
    else if (values.some((v) => v !== "")) rows.push(values);
  });

  return { headers, rows };
}

/** Scoate rândurile complet goale de la finalul unui tabel brut (linii goale
 * la finalul fișierului — frecvente la export/paste). */
function dropTrailingEmptyRecords(records: string[][]): string[][] {
  const out = [...records];
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.every((c) => c.trim() === "")) out.pop();
    else break;
  }
  return out;
}

function padRow(row: string[], width: number): string[] {
  if (row.length >= width) return row;
  const padded = [...row];
  while (padded.length < width) padded.push("");
  return padded;
}

/**
 * Parser RFC-4180-ish: câmpuri ghilimetate cu virgule/punct-și-virgulă
 * incluse, escape `""`, newline-uri ÎN interiorul ghilimelelor, CRLF/CR/LF,
 * BOM UTF-8 la început tăiat, rânduri "zdrențuite" (mai puține celule decât
 * header-ul) completate cu string gol.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): ParsedTable {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // BOM
  const delim = delimiter ?? detectDelimiter(s);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = s.length;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < n) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (s[i + 1] === "\n") {
        pushRecord();
        i += 2;
        continue;
      }
      pushRecord();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // ultimul rând, dacă fișierul nu se termină cu un separator de linie
  if (field.length > 0 || record.length > 0) pushRecord();

  const trimmed = dropTrailingEmptyRecords(records);
  if (trimmed.length === 0) return { headers: [], rows: [] };

  const headers = trimmed[0].map((h) => h.trim());
  const rows = trimmed.slice(1).map((r) => padRow(r, headers.length));
  return { headers, rows };
}

// ─── Parsare Excel (.xlsx/.xls) ─────────────────────────────────────────────

/** Citește prima foaie dintr-un `.xlsx`/`.xls` cu SheetJS, încărcat DINAMIC
 * (`await import("xlsx")`) ca să nu umfle bundle-ul principal — majoritatea
 * importurilor sunt CSV/paste. */

// ─── Mapare configurabilă coloană → câmp lead ───────────────────────────────

export const IMPORT_TARGET_FIELDS = [
  "full_name",
  "phone",
  "email",
  "company",
  "interest_course",
  "value_cents",
  "source",
  "assigned_to",
  "stage",
  "industry",
  "region",
  "company_size",
  "annual_consumption_kwh",
  "notes",
  "deal_name",
  "ignore",
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

/** Etichete în română pentru select-ul de mapare din UI. */
export const IMPORT_TARGET_LABELS: Record<ImportTargetField, string> = {
  full_name: "Nume complet",
  phone: "Telefon",
  email: "Email",
  company: "Companie",
  interest_course: "Curs / produs de interes",
  value_cents: "Valoare (oportunitate)",
  source: "Sursă",
  assigned_to: "Responsabil",
  stage: "Etapă",
  industry: "Industrie",
  region: "Regiune",
  company_size: "Mărime companie",
  annual_consumption_kwh: "Consum anual (kWh)",
  notes: "Notițe",
  deal_name: "Denumire oportunitate",
  ignore: "— ignoră coloana —",
};

/** index coloană (0-based, în ordinea header-ului din fișier) → câmp țintă. */
export type FieldMapping = Record<number, ImportTargetField>;

const FIELD_KEYWORDS: Record<Exclude<ImportTargetField, "ignore">, string[]> = {
  email: ["email", "e mail", "mail"],
  phone: ["telefon", "phone", "mobil", "gsm", "tel"],
  full_name: ["nume complet", "nume", "name", "client", "contact"],
  company: ["companie", "firma", "company", "organizatie", "denumire firma"],
  value_cents: ["valoare", "value", "suma", "pret", "amount"],
  annual_consumption_kwh: ["consum anual", "consum", "kwh", "consumption"],
  industry: ["industrie", "industry", "domeniu"],
  region: ["regiune", "region", "zona"],
  company_size: ["marime companie", "marime", "size", "angajati", "employees"],
  interest_course: ["curs interes", "curs", "course", "produs"],
  source: ["sursa", "source"],
  assigned_to: ["responsabil", "assigned", "agent"],
  stage: ["etapa", "stage", "status"],
  deal_name: ["oportunitate", "deal", "denumire oportunitate"],
  notes: ["observatii", "note", "notes", "comentarii", "mentiuni"],
};

/** Ordinea în care se încearcă potrivirea — cele mai specifice/frecvente
 * primele, ca să nu "fure" o coloană un câmp mai generic potrivit mai jos. */
const FIELD_MATCH_ORDER: Exclude<ImportTargetField, "ignore">[] = [
  "email",
  "phone",
  "full_name",
  "company",
  "value_cents",
  "annual_consumption_kwh",
  "industry",
  "region",
  "company_size",
  "interest_course",
  "source",
  "assigned_to",
  "stage",
  "deal_name",
  "notes",
];

/** Normalizează un header pentru comparație: fără diacritice, minuscule,
 * punctuație/underscore transformate în spații, spații multiple colapsate. */
function normalizeHeader(raw: string): string {
  const base = normalizeNameLocal(raw) ?? "";
  return base.replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Ghicește maparea automată pornind de la denumirile de coloane din fișier,
 * insensibil la majuscule/diacritice, potrivind atât denumiri românești cât
 * și englezești. Fiecare câmp țintă e folosit cel mult o dată (prima coloană
 * potrivită câștigă); restul rămân "ignore" — owner-ul le poate remapa manual.
 */
export function suggestMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<ImportTargetField>();

  headers.forEach((header, idx) => {
    const norm = normalizeHeader(header);
    let matched: ImportTargetField = "ignore";
    if (norm.length > 0) {
      for (const field of FIELD_MATCH_ORDER) {
        if (used.has(field)) continue;
        const hit = FIELD_KEYWORDS[field].some((kw) => norm.includes(kw));
        if (hit) {
          matched = field;
          break;
        }
      }
    }
    mapping[idx] = matched;
    if (matched !== "ignore") used.add(matched);
  });

  return mapping;
}

// ─── Parsare numere/bani robustă (RO 1.234,56 / EN 1,234.56 / brut 1234) ────

interface NumberParts {
  negative: boolean;
  integerPart: string;
  fractionPart: string;
}

function splitNumberParts(raw: string | null | undefined): NumberParts | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return null;

  const cleaned = trimmed.replace(/[^0-9.,-]/g, "");
  if (cleaned.replace(/[-.,]/g, "").length === 0) return null;

  const negative = cleaned.startsWith("-");
  const s = negative ? cleaned.slice(1) : cleaned;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let integerPart: string;
  let fractionPart: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // Ambele prezente: ultimul apărut e separatorul zecimal, celălalt e de mii.
    if (lastComma > lastDot) {
      const parts = s.split(",");
      fractionPart = parts.pop() ?? "";
      integerPart = parts.join("").replace(/\./g, "");
    } else {
      const parts = s.split(".");
      fractionPart = parts.pop() ?? "";
      integerPart = parts.join("").replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      integerPart = parts[0];
      fractionPart = parts[1];
    } else {
      integerPart = parts.join("");
      fractionPart = "";
    }
  } else if (lastDot !== -1) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      integerPart = parts[0];
      fractionPart = parts[1];
    } else {
      integerPart = parts.join("");
      fractionPart = "";
    }
  } else {
    integerPart = s;
    fractionPart = "";
  }

  integerPart = integerPart.replace(/[^0-9]/g, "");
  fractionPart = fractionPart.replace(/[^0-9]/g, "");
  if (integerPart.length === 0 && fractionPart.length === 0) return null;

  return { negative, integerPart, fractionPart };
}

/** Parsează un text de bani în CENȚI, acceptând `1.234,56` (european),
 * `1,234.56` (american) și un întreg brut `1234` (tratat ca unitate întreagă,
 * adică 1234.00). Returnează `null` dacă textul nu conține nicio cifră. */
export function parseMoneyToCents(raw: string | null | undefined): number | null {
  const parts = splitNumberParts(raw);
  if (!parts) return null;
  const intVal = parts.integerPart.length ? parseInt(parts.integerPart, 10) : 0;
  const fraction = parts.fractionPart.padEnd(2, "0").slice(0, 2);
  const fracVal = fraction.length ? parseInt(fraction, 10) : 0;
  const cents = intVal * 100 + fracVal;
  return parts.negative ? -cents : cents;
}

/** Parsează un text numeric (ex. consum kWh) într-un `number`, cu aceeași
 * toleranță la formatul european/american ca `parseMoneyToCents`. */
export function parseDecimalNumber(raw: string | null | undefined): number | null {
  const parts = splitNumberParts(raw);
  if (!parts) return null;
  const numStr = `${parts.integerPart || "0"}.${parts.fractionPart || "0"}`;
  const val = parseFloat(numStr);
  if (!Number.isFinite(val)) return null;
  return parts.negative ? -val : val;
}

// ─── Mapare text liber → enum-uri interne (sursă/etapă) ─────────────────────

/** Sursa mapată dintr-un text liber din fișier către `LeadSource`-ul intern.
 * Fără coloană mapată → "import" (implicit pentru orice import în masă). Text
 * nerecunoscut → "other", nu aruncă — un import nu trebuie să pice pe un enum
 * necunoscut pe o singură coloană opțională. */
export function mapSourceText(raw: string | null | undefined): string {
  if (!raw || raw.trim().length === 0) return "import";
  const n = normalizeHeader(raw);
  if (n.includes("facebook")) return "facebook_ad";
  if (n.includes("google")) return "google_ads";
  if (n.includes("referral") || n.includes("recomandare")) return "referral";
  if (n.includes("telefon") || n.includes("phone")) return "phone_in";
  if (n.includes("instagram")) return "instagram";
  if (n.includes("site") || n.includes("formular") || n.includes("web")) return "webform";
  if (n.includes("manual")) return "manual";
  if (n.includes("import")) return "import";
  return "other";
}

/** Etapa mapată dintr-un text liber. Fără coloană mapată → "new". Text
 * nerecunoscut → păstrat ca atare (coloana `stage` e varchar liber, nu enum). */
export function mapStageText(raw: string | null | undefined): string {
  if (!raw || raw.trim().length === 0) return "new";
  const n = normalizeHeader(raw);
  if (n.includes("nou")) return "new";
  if (n.includes("contact")) return "contacted";
  if (n.includes("proba") || n.includes("trial")) return "trial";
  if (n.includes("platit") || n.includes("paid") || n.includes("castigat") || n.includes("won")) return "paid";
  if (n.includes("pierdut") || n.includes("lost")) return "lost";
  return n.length > 0 ? raw.trim() : "new";
}

// ─── Draft de lead + validare ────────────────────────────────────────────────

export interface ImportDraftLead {
  /** Poziția rândului în datele fișierului (1-based, exclude header-ul) —
   * folosit ca să afișăm/raportăm erori pe rândul corect owner-ului. */
  rowNumber: number;
  full_name: string;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  email_normalized: string | null;
  company: string | null;
  interest_course: string | null;
  value_cents: number | null;
  source: string | null;
  assigned_to: string | null;
  stage: string | null;
  industry: string | null;
  region: string | null;
  company_size: string | null;
  annual_consumption_kwh: number | null;
  notes: string | null;
  deal_name: string | null;
}

function findColumnFor(mapping: FieldMapping, field: ImportTargetField): number | null {
  for (const [idx, mapped] of Object.entries(mapping)) {
    if (mapped === field) return Number(idx);
  }
  return null;
}

/** Aplică maparea configurată peste rândurile brute → draft-uri tipizate,
 * gata de validat/dedup-at. Coloanele nemapate ("ignore") sunt pur și simplu
 * excluse — nu ajung în draft. */
export function applyMapping(rows: string[][], mapping: FieldMapping): ImportDraftLead[] {
  const columnFor = new Map<ImportTargetField, number>();
  for (const field of IMPORT_TARGET_FIELDS) {
    const idx = findColumnFor(mapping, field);
    if (idx !== null) columnFor.set(field, idx);
  }

  const cell = (row: string[], field: ImportTargetField): string => {
    const idx = columnFor.get(field);
    if (idx === undefined) return "";
    return (row[idx] ?? "").trim();
  };

  return rows.map((row, i) => {
    const phone = cell(row, "phone") || null;
    const email = cell(row, "email") || null;
    const valueRaw = cell(row, "value_cents");
    const consumptionRaw = cell(row, "annual_consumption_kwh");

    return {
      rowNumber: i + 1,
      full_name: cell(row, "full_name"),
      phone,
      phone_normalized: normalizePhone(phone),
      email,
      email_normalized: normalizeEmail(email),
      company: cell(row, "company") || null,
      interest_course: cell(row, "interest_course") || null,
      value_cents: valueRaw ? parseMoneyToCents(valueRaw) : null,
      source: cell(row, "source") || null,
      assigned_to: cell(row, "assigned_to") || null,
      stage: cell(row, "stage") || null,
      industry: cell(row, "industry") || null,
      region: cell(row, "region") || null,
      company_size: cell(row, "company_size") || null,
      annual_consumption_kwh: consumptionRaw ? parseDecimalNumber(consumptionRaw) : null,
      notes: cell(row, "notes") || null,
      deal_name: cell(row, "deal_name") || null,
    };
  });
}

export interface DraftValidation {
  errors: string[];
  warnings: string[];
}

/** Validare per-rând: nume obligatoriu + cel puțin un contact (telefon SAU
 * email) — un rând fără niciunul e o EROARE, nu o inserare silențioasă. */
export function validateDraft(draft: ImportDraftLead): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!draft.full_name || draft.full_name.trim().length === 0) {
    errors.push("Lipsește numele.");
  }
  if (!draft.phone && !draft.email) {
    errors.push("Lipsește atât telefonul cât și emailul — e nevoie de cel puțin unul.");
  }
  if (draft.value_cents != null && draft.value_cents < 0) {
    warnings.push("Valoare negativă — verifică formatul sumei.");
  }
  if (draft.annual_consumption_kwh != null && draft.annual_consumption_kwh < 0) {
    warnings.push("Consum anual negativ — verifică formatul numărului.");
  }

  return { errors, warnings };
}

// ─── Deduplicare ─────────────────────────────────────────────────────────────

export type DuplicateStatus = "new" | "duplicate_in_file" | "duplicate_in_db";

/**
 * Marchează fiecare draft cu statusul de duplicat, potrivind pe telefon SAU
 * email normalizat. `existingKeys` conține cheile normalizate deja prezente
 * în baza de date (vezi `loadExistingDedupKeys` din `useImport.ts`). În caz de
 * coliziune ȘI cu DB ȘI cu alt rând din fișier, câștigă `duplicate_in_db` —
 * e semnalul mai important pentru owner (deja există lead-ul, nu doar
 * repetat în fișier).
 */
export function findDuplicates(
  drafts: ImportDraftLead[],
  existingKeys: Set<string>
): DuplicateStatus[] {
  const seenInFile = new Set<string>();

  return drafts.map((draft) => {
    const keys = [draft.phone_normalized, draft.email_normalized].filter(
      (k): k is string => Boolean(k)
    );
    if (keys.length === 0) return "new";

    const inDb = keys.some((k) => existingKeys.has(k));
    const inFile = keys.some((k) => seenInFile.has(k));
    for (const k of keys) seenInFile.add(k);

    if (inDb) return "duplicate_in_db";
    if (inFile) return "duplicate_in_file";
    return "new";
  });
}
