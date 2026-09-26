/**
 * CRM — importul de FIRME dintr-un fișier (CSV, text lipit sau Excel).
 *
 * Diferit de importul de lead-uri (`importFile.ts`): o listă de clienți nu are neapărat o
 * oportunitate în spate, deci aici nu se creează lead-uri — doar fișe în `crm_companies`.
 * Parserul e același (RFC-4180 + `exceljs`); tot ce e aici e pur, ca previzualizarea și importul
 * să ruleze literalmente aceeași funcție.
 *
 * Unde e „flexibil", fiindcă fișierele reale nu seamănă între ele:
 *   · rândul cu antetele se alege (exporturile din contabilitate au 2–3 rânduri de titlu deasupra);
 *   · foaia se alege, la un registru cu mai multe foi;
 *   · ORICE coloană poate merge în „Notițe", de câte ori vrei — fiecare ajunge ca „Antet: valoare",
 *     deci o coloană fără câmp dedicat nu se pierde la „ignoră";
 *   · o firmă care există deja (după cod fiscal, altfel după nume) se sare, i se completează doar
 *     golurile, sau i se rescriu datele — alegerea e a omului, nu a noastră.
 */
import { normalizeEmail, normalizePhone } from "./normalize";
import { normalizeIdno, parseDecimalNumber, type ParsedTable } from "./importFile";

export const COMPANY_IMPORT_TARGETS = [
  "name",
  "idno",
  "industry",
  "region",
  "company_size",
  "annual_consumption_kwh",
  "website",
  "phone",
  "email",
  "address",
  "notes",
  "ignore",
] as const;

export type CompanyImportTarget = (typeof COMPANY_IMPORT_TARGETS)[number];
export type CompanyFieldMapping = Record<number, CompanyImportTarget>;

export function isCompanyImportTarget(value: string): value is CompanyImportTarget {
  return (COMPANY_IMPORT_TARGETS as readonly string[]).includes(value);
}

/** Ce face importul cu o firmă care există deja în bază. */
export type ExistingMode = "skip" | "fill" | "overwrite";

/** Coloana cu numele e obligatorie; restul pot lipsi. „Notițe" poate primi oricâte coloane. */
const MULTI_TARGETS: ReadonlySet<CompanyImportTarget> = new Set(["notes", "ignore"]);

const KEYWORDS: Record<Exclude<CompanyImportTarget, "ignore">, string[]> = {
  idno: ["idno", "cod fiscal", "codul fiscal", "cui", "cif", "fiscal code", "tax id", "vat", "cod tva", "idnp"],
  email: ["email", "e mail", "mail", "posta electronica"],
  website: ["website", "site", "web", "url", "pagina"],
  phone: ["telefon", "phone", "mobil", "gsm", "tel", "nr contact"],
  name: ["denumire", "denumirea", "firma", "companie", "company", "organizatie", "client", "nume", "name", "agent economic"],
  industry: ["industrie", "industry", "domeniu", "activitate", "caem", "caen", "sector"],
  region: ["regiune", "region", "raion", "judet", "oras", "localitate", "zona", "municipiu"],
  company_size: ["marime", "size", "angajati", "employees", "nr salariati", "salariati"],
  annual_consumption_kwh: ["consum anual", "consum", "kwh", "consumption"],
  address: ["adresa", "address", "sediu", "strada"],
  notes: ["observatii", "note", "notes", "comentarii", "mentiuni", "persoana de contact", "persoana contact", "administrator", "director"],
};

/** Ordinea de potrivire: cele mai specifice primele, ca „Telefon contact" să fie telefon și nu
 *  notiță, iar „Adresa email" să fie email și nu adresă. */
const MATCH_ORDER: Exclude<CompanyImportTarget, "ignore">[] = [
  "idno",
  "email",
  "website",
  "phone",
  "annual_consumption_kwh",
  "address",
  "industry",
  "region",
  "company_size",
  "notes",
  "name",
];

function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeHeader(raw: string): string {
  return normalizeText(raw).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Cuvintele scurte („cui", „tel", „web") se cer întregi, altfel „Circuit" ar fi cod fiscal. */
function keywordHits(header: string, keyword: string): boolean {
  if (keyword.length > 4) return header.includes(keyword);
  return header.split(" ").includes(keyword);
}

/** Numele normalizat al firmei — aceeași formă ca `name_normalized` scris de restul CRM-ului. */
export function normalizeCompanyName(raw: string | null | undefined): string | null {
  const n = normalizeText(raw);
  return n.length > 0 ? n : null;
}

/**
 * Propune maparea din antet. Fiecare câmp dedicat se folosește o singură dată; „Notițe" poate
 * primi mai multe coloane. Dacă niciun antet nu seamănă cu „denumire", prima coloană text devine
 * numele — o listă de firme fără coloana cu numele nu există, doar una cu antet neobișnuit.
 */
export function suggestCompanyMapping(headers: string[], sample: string[][] = []): CompanyFieldMapping {
  const mapping: CompanyFieldMapping = {};
  const used = new Set<CompanyImportTarget>();

  headers.forEach((header, idx) => {
    const norm = normalizeHeader(header);
    let matched: CompanyImportTarget = "ignore";
    if (norm) {
      for (const field of MATCH_ORDER) {
        if (!MULTI_TARGETS.has(field) && used.has(field)) continue;
        if (KEYWORDS[field].some((kw) => keywordHits(norm, kw))) {
          matched = field;
          break;
        }
      }
    }
    mapping[idx] = matched;
    if (matched !== "ignore") used.add(matched);
  });

  if (!used.has("name")) {
    const firstText = headers.findIndex(
      (_, idx) =>
        mapping[idx] === "ignore" &&
        sample.some((row) => /[a-zA-ZăâîșțĂÂÎȘȚ]{2,}/.test(row[idx] ?? ""))
    );
    if (firstText >= 0) mapping[firstText] = "name";
  }
  return mapping;
}

/**
 * Tabelul cu antetul pe rândul ales (1 = primul rând, cum îl vede omul în Excel). Rândurile de
 * deasupra antetului (titluri, date de export) nu se importă.
 */
export function rebaseHeader(table: ParsedTable, headerRow: number): ParsedTable {
  const all = [table.headers, ...table.rows];
  const at = Math.min(Math.max(1, Math.floor(headerRow)), Math.max(1, all.length)) - 1;
  const rawHeaders = all[at] ?? [];
  const body = all.slice(at + 1);
  const width = Math.max(rawHeaders.length, ...body.map((r) => r.length), 0);
  const headers = Array.from({ length: width }, (_, i) => (rawHeaders[i] ?? "").trim() || `Coloana ${i + 1}`);
  const rows = body
    .map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()))
    .filter((r) => r.some((v) => v !== ""));
  return { headers, rows };
}

export interface CompanyDraft {
  /** Numărul rândului în fișier, cum îl vede omul (antetul inclus). */
  rowNumber: number;
  name: string;
  idno: string | null;
  industry: string | null;
  region: string | null;
  company_size: string | null;
  annual_consumption_kwh: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

/** Cheia de dedup: codul fiscal când există, altfel numele normalizat. */
export function companyKey(draft: Pick<CompanyDraft, "idno" | "name">): string | null {
  const idno = normalizeIdno(draft.idno);
  if (idno) return `idno:${idno}`;
  const name = normalizeCompanyName(draft.name);
  return name ? `name:${name}` : null;
}

export function applyCompanyMapping(
  table: ParsedTable,
  mapping: CompanyFieldMapping,
  /** Rândul antetului în fișier — ca numerele de rând din erori să fie cele din Excel. */
  headerRow = 1
): CompanyDraft[] {
  const single = (row: string[], target: CompanyImportTarget): string | null => {
    for (const [idx, t] of Object.entries(mapping)) {
      if (t !== target) continue;
      const v = (row[Number(idx)] ?? "").trim();
      if (v) return v;
    }
    return null;
  };

  return table.rows.map((row, i) => {
    const noteParts: string[] = [];
    for (const [idx, t] of Object.entries(mapping)) {
      if (t !== "notes") continue;
      const v = (row[Number(idx)] ?? "").trim();
      if (!v) continue;
      // O singură coloană de notițe rămâne textul ei; mai multe primesc antetul în față, altfel
      // „Ion Rusu" și „069123456" n-ar mai spune nimic peste o lună.
      noteParts.push(`${table.headers[Number(idx)]}: ${v}`);
    }
    const noteColumns = Object.values(mapping).filter((t) => t === "notes").length;
    const notes =
      noteParts.length === 0
        ? null
        : noteColumns === 1
          ? noteParts[0].slice(noteParts[0].indexOf(": ") + 2)
          : noteParts.join("\n");

    const kwh = single(row, "annual_consumption_kwh");
    return {
      rowNumber: headerRow + 1 + i,
      name: (single(row, "name") ?? "").replace(/\s+/g, " "),
      idno: single(row, "idno"),
      industry: single(row, "industry"),
      region: single(row, "region"),
      company_size: single(row, "company_size"),
      annual_consumption_kwh: kwh ? parseDecimalNumber(kwh) : null,
      website: single(row, "website"),
      phone: single(row, "phone"),
      email: single(row, "email"),
      address: single(row, "address"),
      notes,
    };
  });
}

export function validateCompanyDraft(d: CompanyDraft): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (d.name.length < 2) errors.push("Lipsește denumirea firmei.");
  if (d.name.length > 300) errors.push("Denumirea are peste 300 de caractere.");
  const idno = normalizeIdno(d.idno);
  if (d.idno && idno && !/^\d{13}$/.test(idno) && !/^(RO)?\d{2,10}$/.test(idno)) {
    warnings.push("Codul fiscal nu arată a IDNO (13 cifre) sau CUI — se importă așa cum e.");
  }
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) warnings.push("Emailul nu pare valid.");
  if (d.phone && !normalizePhone(d.phone)) warnings.push("Telefonul nu pare valid.");
  if (d.annual_consumption_kwh != null && d.annual_consumption_kwh < 0) warnings.push("Consum anual negativ.");
  return { errors, warnings };
}

export type CompanyRowStatus = "new" | "exists" | "duplicate_in_file" | "error";

export interface PlannedCompanyRow {
  draft: CompanyDraft;
  status: CompanyRowStatus;
  errors: string[];
  warnings: string[];
  /** Fișa existentă cu care s-a potrivit rândul (status `exists`). */
  existingId: string | null;
}

export interface CompanyImportCounts {
  total: number;
  new: number;
  exists: number;
  duplicatesInFile: number;
  errors: number;
}

/**
 * Verdictul pe fiecare rând. `existing` = cheie → id fișă, citit din bază pentru cheile din
 * fișier. Un rând repetat în fișier (aceeași cheie) se sare: primul câștigă, ca importul să nu
 * creeze aceeași firmă de două ori.
 */
export function planCompanyImport(drafts: CompanyDraft[], existing: Map<string, string>): PlannedCompanyRow[] {
  const seen = new Set<string>();
  return drafts.map((draft) => {
    const { errors, warnings } = validateCompanyDraft(draft);
    if (errors.length > 0) return { draft, status: "error", errors, warnings, existingId: null };
    const key = companyKey(draft);
    // Cheia pe nume se verifică și ea: „Alfa SRL" cu IDNO într-un rând și fără în altul e aceeași firmă.
    const nameKey = normalizeCompanyName(draft.name);
    const keys = [key, nameKey ? `name:${nameKey}` : null].filter((k): k is string => Boolean(k));
    if (keys.some((k) => seen.has(k))) {
      return { draft, status: "duplicate_in_file", errors, warnings, existingId: null };
    }
    keys.forEach((k) => seen.add(k));
    // Codul fiscal decide când există; numele e doar plasa de siguranță pentru rândurile fără cod.
    const existingId = (key && existing.get(key)) || (!normalizeIdno(draft.idno) && nameKey ? existing.get(`name:${nameKey}`) : undefined);
    if (existingId) return { draft, status: "exists", errors, warnings, existingId };
    return { draft, status: "new", errors, warnings, existingId: null };
  });
}

export function countCompanyPlan(rows: PlannedCompanyRow[]): CompanyImportCounts {
  return {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    exists: rows.filter((r) => r.status === "exists").length,
    duplicatesInFile: rows.filter((r) => r.status === "duplicate_in_file").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}

/** Coloanele din `crm_companies` pe care le scrie importul, cu valoarea din draft. */
export function companyColumns(d: CompanyDraft) {
  const idno = normalizeIdno(d.idno);
  return {
    name: d.name.slice(0, 300),
    nameNormalized: normalizeCompanyName(d.name)?.slice(0, 300) ?? null,
    // Codul se scrie NORMALIZAT: cheia de dedup din bază e aceeași cu cea din import.
    idno: idno?.slice(0, 40) ?? null,
    industry: d.industry?.slice(0, 120) ?? null,
    region: d.region?.slice(0, 120) ?? null,
    companySize: d.company_size?.slice(0, 40) ?? null,
    annualConsumptionKwh: d.annual_consumption_kwh != null ? String(d.annual_consumption_kwh) : null,
    website: d.website?.slice(0, 300) ?? null,
    phone: d.phone?.slice(0, 32) ?? null,
    phoneNormalized: normalizePhone(d.phone),
    email: d.email?.slice(0, 255) ?? null,
    emailNormalized: normalizeEmail(d.email),
    address: d.address?.slice(0, 500) ?? null,
    notes: d.notes,
  };
}

export type CompanyColumns = ReturnType<typeof companyColumns>;

/**
 * Ce se schimbă pe o fișă existentă. `fill` completează doar golurile; `overwrite` rescrie cu
 * orice valoare NEGOALĂ din fișier (o celulă goală nu șterge niciodată o dată scrisă de om).
 * Numele nu se rescrie în niciun mod — după el s-a potrivit fișa, iar o virgulă în plus în
 * fișier ar redenumi clientul. Notițele se ADAUGĂ, nu se înlocuiesc.
 */
export function companyPatch(
  current: Partial<Record<keyof CompanyColumns, unknown>>,
  incoming: CompanyColumns,
  mode: ExistingMode
): Partial<CompanyColumns> {
  if (mode === "skip") return {};
  const patch: Record<string, unknown> = {};
  const pairs: [keyof CompanyColumns, (keyof CompanyColumns)[]][] = [
    ["idno", []],
    ["industry", []],
    ["region", []],
    ["companySize", []],
    ["annualConsumptionKwh", []],
    ["website", []],
    ["phone", ["phoneNormalized"]],
    ["email", ["emailNormalized"]],
    ["address", []],
  ];
  const empty = (v: unknown) => v == null || String(v).trim() === "";
  for (const [field, companions] of pairs) {
    const next = incoming[field];
    if (empty(next)) continue;
    if (mode === "fill" && !empty(current[field])) continue;
    if (String(current[field] ?? "") === String(next)) continue;
    patch[field] = next;
    for (const c of companions) patch[c] = incoming[c];
  }
  if (!empty(incoming.notes)) {
    const had = String(current.notes ?? "").trim();
    if (!had.includes(String(incoming.notes).trim())) {
      patch.notes = had ? `${had}\n${incoming.notes}` : incoming.notes;
    }
  }
  return patch as Partial<CompanyColumns>;
}
