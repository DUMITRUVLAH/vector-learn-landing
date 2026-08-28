/**
 * PAR config import — sheet classification and cell normalisation.
 *
 * WHY THIS EXISTS (live bug, 2026-08-25):
 * A real user (LED.xlsx) uploaded a one-sheet workbook — sheet named "Sheet1", columns
 * `Cod | Denumire | Denumire proiect`, 41 budget codes. The importer looked sheets up by
 * NAME ("Coduri buget") and fell back to POSITION (worksheet index 2). Neither matched, so
 * the budget codes were silently dropped, while the same single sheet WAS matched as the
 * "Proiecte" sheet (position 0) and imported 41 times as one project. The response was a
 * 200 with `budgetCodes: {created: 0, updated: 0, errors: []}` — nothing looked broken, the
 * codes just never appeared.
 *
 * Fix: classify each worksheet by its COLUMN HEADERS first (the thing a person actually
 * fills in), then by sheet name, and only fall back to position for legacy files where
 * nothing at all could be recognised. A workbook where nothing is recognised is an error,
 * not a silent zero-row import.
 *
 * Everything here is pure (no DB, no Hono) so it can be unit-tested against a real .xlsx.
 */
import type ExcelJS from "exceljs";

export type SheetKind = "payers" | "projects" | "departments" | "budgetCodes" | "vendors";

export interface ImportRow {
  /** 1-based worksheet row number, as shown in Excel — used in error messages. */
  row: number;
  data: Record<string, string>;
}

export interface ClassifiedSheet {
  name: string;
  kind: SheetKind | null;
  /** How the kind was decided — surfaced to the user so a misread sheet is explainable. */
  via: "headers" | "name" | "position" | null;
  headers: string[];
  rows: ImportRow[];
}

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Fold a header into a comparable key: lowercase, diacritics stripped, punctuation
 * (including the "*" required-marker and parentheses) turned into spaces.
 *   "Suma alocată (MDL)"        → "suma alocata mdl"
 *   "Plătitor / Organizație *"  → "platitor organizatie"
 *   "Cod buget *"               → "cod buget"
 */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Romanian ș/ț often arrive as U+0219/U+021B (comma below), which NFD does not split
    .replace(/[ȘșŞş]/g, "s")
    .replace(/[ȚțŢţ]/g, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v) {
      return (v as { richText: { text: string }[] }).richText.map((rt) => rt.text).join("");
    }
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      return r !== null && r !== undefined ? String(r) : "";
    }
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  return String(v);
}

/** Case/diacritics-insensitive lookup of a value by any of its accepted header spellings. */
export function getField(data: Record<string, string>, ...aliases: string[]): string {
  const wanted = aliases.map(normalizeHeader);
  for (const alias of wanted) {
    for (const [k, v] of Object.entries(data)) {
      if (normalizeHeader(k) === alias) return v.trim();
    }
  }
  return "";
}

// ─── Column alias tables (shared by the detector and the row readers) ─────────

/** A budget-code column. "cod fiscal" is deliberately excluded — that is an IDNO. */
export const CODE_ALIASES = [
  "cod",
  "code",
  "cod buget",
  "cod bugetar",
  "cod bugetare",
  "cod de buget",
  "cod linie",
  "cod linie bugetara",
  "cod articol",
];
export const NAME_ALIASES = ["denumire", "denumire cod", "denumire cod buget", "nume", "name", "descriere", "titlu"];
export const ALLOCATED_ALIASES = [
  "suma alocata mdl",
  "suma alocata",
  "suma",
  "alocare mdl",
  "alocare",
  "alocat",
  "buget mdl",
  "buget",
  "allocated",
  "amount",
];
export const PROJECT_ALIASES = ["proiect optional", "proiect", "denumire proiect", "program", "denumire program", "project"];
export const PAYER_ALIASES = [
  "platitor organizatie",
  "platitor",
  "organizatie",
  "denumire platitor",
  "payer",
];
export const DEPARTMENT_NAME_ALIASES = ["denumire departament", "departament", "denumire", "nume", "name"];
export const PROJECT_NAME_ALIASES = ["denumire proiect", "proiect", "denumire program", "program", "denumire", "nume", "name"];
export const PAYER_NAME_ALIASES = ["denumire platitor", "platitor organizatie", "platitor", "organizatie", "denumire", "nume", "name"];
export const VENDOR_NAME_ALIASES = [
  "denumire beneficiar",
  "beneficiar",
  "denumire furnizor",
  "furnizor",
  "denumire",
  "nume",
  "name",
  "denumire companie",
];
export const IBAN_ALIASES = ["iban", "cont iban", "cont bancar", "iban beneficiar", "cont"];
export const BANK_ALIASES = ["banca", "denumire banca", "bank", "banca beneficiarului"];
export const BIC_ALIASES = ["bic", "swift", "bic swift", "cod bancar", "cod banca", "cod bic"];
export const FISCAL_ID_ALIASES = [
  "idno",
  "idnp",
  "idno idnp",
  "cod fiscal",
  "cod fiscal idno",
  "cod fiscal idnp",
  "codul fiscal",
  "c f",
];

function hasHeader(headers: string[], aliases: string[]): boolean {
  const set = new Set(headers.map(normalizeHeader));
  return aliases.some((a) => set.has(normalizeHeader(a)));
}

/**
 * Decide what a sheet holds from its column headers.
 *
 * Order matters and is NOT arbitrary:
 *  - budget codes first: they are the only sheet with a "Cod" column, and they legitimately
 *    also carry "Denumire proiect" / "Plătitor" columns (the LED.xlsx shape).
 *  - projects before payers: the template's "Proiecte" sheet has a "Plătitor / Organizație"
 *    column, so a payer-first order would swallow it.
 */
export function detectKindFromHeaders(headers: string[]): SheetKind | null {
  if (!headers.length) return null;
  if (hasHeader(headers, CODE_ALIASES)) return "budgetCodes";
  // Un IBAN nu apare pe nicio altă foaie de configurare — e semnătura registrului de beneficiari.
  if (hasHeader(headers, [...IBAN_ALIASES, "denumire beneficiar", "beneficiar", "denumire furnizor", "furnizor"]))
    return "vendors";
  if (hasHeader(headers, ["denumire departament", "departament", "departamente"])) return "departments";
  if (hasHeader(headers, ["denumire proiect", "proiect", "proiecte", "program", "programe", "donor", "donor finantator"]))
    return "projects";
  if (hasHeader(headers, ["denumire platitor", "platitor", "platitori", "organizatie", "idno"])) return "payers";
  return null;
}

/** Fallback: the sheet's own name ("Coduri buget", "Plătitori", …). */
export function detectKindFromName(sheetName: string): SheetKind | null {
  const n = normalizeHeader(sheetName);
  if (!n) return null;
  if (n.includes("cod") || n.includes("buget")) return "budgetCodes";
  if (n.includes("furnizor") || n.includes("beneficiar")) return "vendors";
  if (n.includes("departament")) return "departments";
  if (n.includes("proiect") || n.includes("program")) return "projects";
  if (n.includes("platitor") || n.includes("organizat")) return "payers";
  return null;
}

// ─── Workbook → classified sheets ─────────────────────────────────────────────

/** Legacy 3-sheet template order, used only when nothing else identifies the file. */
const LEGACY_POSITIONS: SheetKind[] = ["projects", "departments", "budgetCodes"];

export function classifyWorkbook(wb: ExcelJS.Workbook): ClassifiedSheet[] {
  const sheets: ClassifiedSheet[] = wb.worksheets.map((ws) => {
    const { headers, rows } = readSheet(ws);
    const byHeaders = detectKindFromHeaders(headers);
    if (byHeaders) return { name: ws.name, kind: byHeaders, via: "headers" as const, headers, rows };
    const byName = detectKindFromName(ws.name);
    if (byName) return { name: ws.name, kind: byName, via: "name" as const, headers, rows };
    return { name: ws.name, kind: null, via: null, headers, rows };
  });

  // Legacy escape hatch: an old 3+-sheet file whose sheets carry no recognisable name or
  // header at all still imports by position. Deliberately NOT applied when even one sheet
  // was recognised — that is what turned LED.xlsx's single sheet into 41 project rows.
  if (sheets.length >= 3 && sheets.every((s) => s.kind === null)) {
    LEGACY_POSITIONS.forEach((kind, i) => {
      if (sheets[i]) {
        sheets[i].kind = kind;
        sheets[i].via = "position";
      }
    });
  }

  return sheets;
}

/** Header row = first non-empty row; data rows keep their real Excel row numbers. */
function readSheet(ws: ExcelJS.Worksheet): { headers: string[]; rows: ImportRow[] } {
  const allRows: ExcelJS.Row[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => allRows.push(row));
  if (allRows.length < 2) return { headers: allRows.length ? headerOf(allRows[0]) : [], rows: [] };

  const headers = headerOf(allRows[0]);
  const rows = allRows.slice(1).map((row) => {
    const data: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      data[h] = cellToString(row.getCell(i + 1));
    });
    return { row: row.number, data };
  });
  // Drop rows where every cell is blank (trailing formatting leftovers in real files).
  return { headers, rows: rows.filter((r) => Object.values(r.data).some((v) => v.trim() !== "")) };
}

function headerOf(row: ExcelJS.Row): string[] {
  const headers: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell) => headers.push(String(cell.value ?? "").trim()));
  return headers;
}

// ─── Explicit column mapping (the user decides, detection only suggests) ──────

/**
 * The fields each kind of import can fill. `key` is the canonical name the upsert helpers
 * read (it is present in the alias tables above, so a mapped row is read exactly like a
 * row whose header already used the canonical spelling).
 */
export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

export const FIELD_DEFS: Record<SheetKind, FieldDef[]> = {
  payers: [
    { key: "name", label: "Denumire plătitor", required: true },
    { key: "legalName", label: "Denumire juridică", required: false },
    { key: "idno", label: "IDNO", required: false },
  ],
  projects: [
    { key: "name", label: "Denumire proiect", required: true },
    { key: "donor", label: "Donor / Finanțator", required: false },
    { key: "payer", label: "Plătitor / Organizație", required: false, hint: "Implicit: plătitorul curent" },
  ],
  departments: [{ key: "name", label: "Denumire departament", required: true }],
  vendors: [
    { key: "name", label: "Denumire beneficiar", required: true },
    { key: "idnp", label: "IDNO / IDNP (cod fiscal)", required: false },
    { key: "iban", label: "IBAN", required: false, hint: "Beneficiarii cu același IBAN sunt actualizați, nu dublați" },
    { key: "bank", label: "Bancă", required: false },
    { key: "bicSwift", label: "Cod bancar (BIC / SWIFT)", required: false },
    { key: "legalAddress", label: "Adresă juridică", required: false },
  ],
  budgetCodes: [
    { key: "code", label: "Cod", required: true, hint: "Dacă celula conține și denumirea, este separată automat" },
    { key: "name", label: "Denumire", required: false, hint: "Implicit: textul rămas din coloana Cod" },
    { key: "allocated", label: "Sumă alocată (MDL)", required: false },
    { key: "project", label: "Proiect / Program", required: false, hint: "Se creează dacă nu există" },
    { key: "payer", label: "Plătitor / Organizație", required: false, hint: "Implicit: plătitorul curent" },
  ],
};

/** Per-field aliases used to pre-select a column for the user. */
const FIELD_ALIASES: Record<string, string[]> = {
  code: CODE_ALIASES,
  name: NAME_ALIASES,
  allocated: ALLOCATED_ALIASES,
  project: PROJECT_ALIASES,
  payer: PAYER_ALIASES,
  donor: ["donor", "donor finantator", "finantator"],
  legalName: ["denumire juridica", "legalname", "denumire legala"],
  idno: FISCAL_ID_ALIASES,
  idnp: FISCAL_ID_ALIASES,
  iban: IBAN_ALIASES,
  bank: BANK_ALIASES,
  bicSwift: BIC_ALIASES,
  legalAddress: ["adresa juridica", "adresa", "sediu", "adresa sediu"],
};

/** Field aliases that only make sense for one kind (a payers sheet's "Denumire" is its name). */
const KIND_NAME_ALIASES: Record<SheetKind, string[]> = {
  payers: PAYER_NAME_ALIASES,
  projects: PROJECT_NAME_ALIASES,
  departments: DEPARTMENT_NAME_ALIASES,
  budgetCodes: NAME_ALIASES,
  vendors: VENDOR_NAME_ALIASES,
};

/**
 * Best guess for "which column feeds which field", shown pre-filled in the mapping dialog.
 * A column is never suggested for two fields — first field wins, in FIELD_DEFS order.
 */
export function suggestMapping(kind: SheetKind, headers: string[]): Record<string, string | null> {
  const taken = new Set<string>();
  const mapping: Record<string, string | null> = {};
  for (const field of FIELD_DEFS[kind]) {
    const aliases = (field.key === "name" ? KIND_NAME_ALIASES[kind] : FIELD_ALIASES[field.key] ?? []).map(normalizeHeader);
    const match = headers.find((h) => h && !taken.has(h) && aliases.includes(normalizeHeader(h)));
    mapping[field.key] = match ?? null;
    if (match) taken.add(match);
  }
  return mapping;
}

/**
 * Rewrite rows so their keys are the canonical field names the user picked.
 * Columns left unmapped are dropped — that is the point of the dialog: the file's own
 * header text stops mattering.
 */
export function applyMapping(rows: ImportRow[], columns: Record<string, string | null>): ImportRow[] {
  const pairs = Object.entries(columns).filter((e): e is [string, string] => Boolean(e[1]));
  return rows.map(({ row, data }) => {
    const mapped: Record<string, string> = {};
    for (const [field, header] of pairs) mapped[field] = data[header] ?? "";
    return { row, data: mapped };
  });
}

// ─── Value normalisation ──────────────────────────────────────────────────────

/** A leading budget code: "1.1", "4.2.6.3", "2-1", "A.1" … followed by descriptive text. */
const LEADING_CODE = /^([A-Za-z]?\d+(?:[.\-/]\d+)*)[.)]?\s+(\S.*)$/;

/**
 * Split a "Cod" cell that carries the whole label into code + name.
 *
 * Real files (LED.xlsx) put "4.2.6.3 Logistic support national makeathon (transportation,
 * accomodation, refreshments, materials)" in BOTH columns. `par_budget_codes.code` is
 * varchar(50), so storing that verbatim is not just ugly — it fails the insert.
 */
export function splitCodeAndName(codeCell: string, nameCell: string): { code: string; name: string } {
  const rawCode = codeCell.trim().replace(/\s+/g, " ");
  const rawName = nameCell.trim().replace(/\s+/g, " ");

  const m = LEADING_CODE.exec(rawCode);
  const code = m ? m[1] : rawCode;
  let name = rawName || (m ? m[2] : "");

  // "1.1 Director (50%)" with code "1.1" → drop the duplicated prefix from the label.
  if (code && name.startsWith(code)) {
    const stripped = name.slice(code.length).replace(/^[\s.):\-–—]+/, "").trim();
    if (stripped) name = stripped;
  }

  return { code, name };
}

/**
 * Parse a Romanian/European MDL amount string → number (or null when it isn't a number).
 * Handles: "45,000" (thousands) = 45000, "45.50" = 45.5, "1.234,56" = 1234.56, "45000".
 */
export function parseMdlAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-") return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Both separators present: whichever comes last is the decimal one.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    // "45,000" → thousands; "45,5" → decimal comma
    s = parts.length === 2 && parts[1].length === 3 && parts[0].length > 0
      ? s.replace(",", "")
      : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    // "1.234" → thousands separator; "45.50" stays a decimal
    if (parts.length === 2 && parts[1].length === 3) s = s.replace(".", "");
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
