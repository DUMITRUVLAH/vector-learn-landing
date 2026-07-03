/**
 * Invoice Reporting — bank-statement extractor.
 *
 * Takes the raw text of a bank statement (PDF/CSV, e.g. a MAIB "EXTRAS DE CONT") and asks
 * the AI to extract EVERY transaction as a structured row. Unlike captureExtractor (one
 * invoice → one set of fields), this returns an ARRAY of transactions, each becoming a
 * fin_capture_lines row with its own reportable verdict.
 *
 * Mock mode: when AI_API_KEY is missing, callAi returns a stub. We additionally parse the
 * raw text heuristically (regex) so the demo works without an AI key on a real statement.
 */
import { callAi, type AiCallOptions } from "./client";
import { parseAmount } from "../fin/money";

export interface StatementTxn {
  tx_date: string | null; // YYYY-MM-DD
  description: string;
  counterparty: string | null;
  /** STMT-005: partner fiscal code (IDNO/IDNP, 13 digits in MD) — the future e-Factura buyer. */
  counterparty_idno: string | null;
  /** STMT-005: partner bank account (IBAN or internal account number). */
  counterparty_iban: string | null;
  amount_cents: number; // positive, account currency (MDL) minor units
  direction: "in" | "out";
  currency: string; // account currency (MDL)
  orig_amount: string | null; // e.g. "250.35 EUR"
  reportable: "yes" | "no" | "review";
  reportable_reason: string | null;
  reportable_confidence: number; // 0..1
}

const SYSTEM_PROMPT = `Ești un asistent care extrage TOATE tranzacțiile dintr-un extras de cont bancar (text OCR).
Returnează STRICT un JSON valid, fără text adițional.

REGULI:
1. Extrage FIECARE tranzacție ca un obiect în array-ul "transactions".
2. amount_cents = suma în valuta contului (de obicei MDL), în BANI (×100). Ex: 488.57 MDL → 48857.
   Folosește suma în valuta contului (coloana sold/MDL), nu suma în valută străină.
3. direction: "out" pentru ieșiri/plăți, "in" pentru intrări/alimentări.
4. counterparty: numele comerciantului dedus din descriere (ex: "FACEBK *..." → "Meta / Facebook Ads";
   "DIGITALOCEAN.COM" → "DigitalOcean"; "MAIB TRANSFER" → "MAIB transfer intern").
5. orig_amount: dacă tranzacția e în altă valută, pune "250.35 EUR"; altfel null.
6. reportable: marchează "review" pentru TOATE (contabilul decide); reason scurt în română
   (ex: "Plată furnizor — necesită factură", "Transfer intern — fără document").
7. tx_date format YYYY-MM-DD.
8. counterparty_idno: codul fiscal (IDNO/IDNP, 13 cifre) al partenerului, dacă apare în extras; altfel null.
9. counterparty_iban: IBAN-ul sau numărul de cont al partenerului, dacă apare; altfel null.

Returnează DOAR JSON:
{ "transactions": [
  { "tx_date":"2025-10-01","description":"...","counterparty":"...","counterparty_idno":"1009600020033",
    "counterparty_iban":"MD94AG000000022512036601","amount_cents":48857,
    "direction":"out","currency":"MDL","orig_amount":"28.80 USD",
    "reportable":"review","reportable_reason":"...","reportable_confidence":0.6 }
] }`;

// parseAmount lives in ../fin/money (pure, no AI/db) so the matcher can share it; re-export
// here for existing call sites that import it from statementExtractor.
export { parseAmount } from "../fin/money";

/** Heuristic fallback parser for MAIB-style statements (used in stub/mock mode). */
export function parseStatementHeuristic(rawText: string): StatementTxn[] {
  // STMT-006: MAIB Excel export (tab-delimited rows, one transaction spread across 2–3
  // sibling rows carrying name / IDNO / IBAN). Try this FIRST for spreadsheet input.
  const excelTxns = parseMaibExcelStatement(rawText);
  if (excelTxns.length > 0) return excelTxns;
  // STMT-005: MAIB current-account PDF via unpdf produces ONE merged line (no \n) with a very
  // specific row anatomy incl. partner IDNO+IBAN — try the exact parser first.
  const mergedTxns = parseMaibMergedStatement(rawText);
  if (mergedTxns.length > 0) return mergedTxns;
  // Try card-statement format first (two dates + currency code)
  const cardTxns = parseCardStatement(rawText);
  if (cardTxns.length > 0) return cardTxns;
  // Try CSV/Excel tabular format (MAIB Excel export: comma-separated columns with date in col 1)
  const csvTxns = parseExcelCsvStatement(rawText);
  if (csvTxns.length > 0) return csvTxns;
  // Try current-account format (MAIB "Extras de Cont" table: debit/credit columns from PDF)
  return parseCurrentAccountStatement(rawText);
}

// ─── STMT-006: MAIB Excel export (tab-delimited, multi-row-per-transaction) ──
//
// The MAIB "Extras de Cont" .xlsx uses merged cells and rich-text; the upload route
// extracts each cell to plain text (cellTextForStatement) and joins a row's cells with a
// TAB. One transaction spans 2–3 sibling rows that share the N/O and cycle the "Date
// partener" column through: partner NAME → partner IDNO (13 digits) → partner IBAN.
// Columns: N/O | Data | No doc | Date partener | Detalii plată | Debit | Credit.
//
// Verified against real statements: per-direction totals equal the bank's reported
// "Total Intrări/Ieșiri" to the cent across multiple monthly exports.

/** Plain-text extraction from an exceljs cell value (richText / hyperlink / formula / date). */
export function cellTextForStatement(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if (typeof o.text === "string") return o.text; // hyperlink cell
    if (o.result !== undefined && o.result !== null) return String(o.result); // formula cell
  }
  return "";
}

/** Amount parser tolerant of space thousands-separators ("346 764,10"). */
function parseAmountLoose(raw: string): number {
  return parseAmount(raw.replace(/\s/g, ""));
}

interface ExcelRec {
  no: string;
  date: string;
  name: string;
  idno: string | null;
  iban: string | null;
  details: string;
  debit: number;
  credit: number;
}

/** Collapse empties + consecutive duplicates (merged-cell split writes each column twice). */
function dedupeRow(cells: string[]): string[] {
  const out: string[] = [];
  for (const c of cells.map((x) => x.trim())) if (c !== "" && c !== out[out.length - 1]) out.push(c);
  return out;
}

export function parseMaibExcelStatement(rawText: string): StatementTxn[] {
  // The upload route joins Excel cells with tabs; other inputs (PDF/CSV) have none.
  if (!rawText.includes("\t")) return [];
  const rawRows = rawText.split("\n").map((l) => l.split("\t"));

  // Locate the transactions header ("N/O … Data … Debit … Credit").
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rawRows.length, 40); i++) {
    const joined = rawRows[i].join(" ").toLowerCase();
    if (/debit/.test(joined) && /credit/.test(joined) && /(data|partener|n\/o)/.test(joined)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Map logical columns by POSITION in the deduped header (content-guessing can't tell the
  // partner cell from the details cell when both hold letters — e.g. an IBAN vs "Alimentare").
  const header = dedupeRow(rawRows[headerIdx]);
  const findCol = (re: RegExp) => header.findIndex((h) => re.test(h));
  const partnerCol = findCol(/partener/i);
  const detailsCol = findCol(/detalii/i);
  const dateCol = findCol(/data/i);
  const debitCol = findCol(/debit/i);
  const creditCol = findCol(/credit/i);
  if (partnerCol === -1 || debitCol === -1 || creditCol === -1) return [];

  // Holder (own company) IDNO from the header ("Cod fiscal: <idno>" or "IDNO: <idno>").
  const headerText = rawRows.slice(0, headerIdx).map((r) => r.join(" ")).join(" ");
  const holderIdno = /(?:Cod fiscal|IDNO)\s*:?\s*(\d{13})/i.exec(headerText)?.[1] ?? null;

  const groups = new Map<string, ExcelRec>();
  const order: string[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const cells = dedupeRow(rawRows[i]);
    // A 0.00/0.00 row collapses the two amount columns into one → column shift. Those are
    // balance/spacer rows we skip anyway, so require the full column width to read by index.
    if (cells.length <= Math.max(partnerCol, debitCol, creditCol)) continue;

    const no = cells[0];
    if (!/^\d{1,4}$/.test(no)) continue; // data rows start with the running N/O

    const partnerCell = cells[partnerCol] ?? "";
    const debit = parseAmountLoose(cells[debitCol] ?? "");
    const credit = parseAmountLoose(cells[creditCol] ?? "");
    const date = dateCol >= 0 ? (cells[dateCol] ?? "") : (cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c)) ?? "");
    const details = detailsCol >= 0 ? (cells[detailsCol] ?? "") : "";

    // The partner column cycles name → IDNO → IBAN across the 2–3 sibling rows.
    const isIdno = /^\d{10,13}$/.test(partnerCell);
    const isIban = /^MD[0-9A-Z]{18,30}$/.test(partnerCell) || /^\d{6,20}$/.test(partnerCell);
    const isName = /[A-Za-zĂÂÎȘȚăâîșț]/.test(partnerCell) && !/^MD[0-9]/.test(partnerCell);

    let rec = groups.get(no);
    if (!rec) {
      rec = { no, date, name: "", idno: null, iban: null, details: "", debit: 0, credit: 0 };
      groups.set(no, rec);
      order.push(no);
    }
    if (isIdno && !rec.idno) rec.idno = partnerCell;
    else if (/^MD[0-9A-Z]{18,30}$/.test(partnerCell) && !rec.iban) rec.iban = partnerCell;
    else if (isName && !isIdno && !isIban && !rec.name) rec.name = partnerCell;
    if (details && details.length > rec.details.length) rec.details = details;
    if (!rec.date && /^\d{2}\.\d{2}\.\d{4}$/.test(date)) rec.date = date;
    if (Number.isFinite(debit) && debit !== 0) rec.debit = debit;
    if (Number.isFinite(credit) && credit !== 0) rec.credit = credit;
  }

  const txns: StatementTxn[] = [];
  for (const no of order) {
    const r = groups.get(no)!;
    if (r.debit === 0 && r.credit === 0) continue;
    const isIn = r.credit > 0;
    const direction: "in" | "out" = isIn ? "in" : "out";
    const verdict = classifyMaibRow({
      holderIdno,
      partnerName: r.name,
      partnerIdno: r.idno ?? "",
      details: r.details,
      direction,
    });
    const [d, mo, y] = r.date.split(".");
    txns.push({
      tx_date: r.date ? `${y}-${mo}-${d}` : null,
      description: (r.details || r.name || (isIn ? "Intrare" : "Ieșire")).slice(0, 300),
      counterparty: r.name.slice(0, 300) || null,
      counterparty_idno: r.idno,
      counterparty_iban: r.iban,
      amount_cents: Math.round((isIn ? r.credit : r.debit) * 100),
      direction,
      currency: "MDL",
      orig_amount: null,
      reportable: verdict.reportable,
      reportable_reason: verdict.reason,
      reportable_confidence: verdict.confidence,
    });
  }
  return txns.length >= 2 ? txns : [];
}

// ─── STMT-005: MAIB current-account PDF (merged single-line text) ─────────────
//
// `unpdf` flattens the MAIB "Extras de Cont" PDF into ONE line. Each row reads:
//   <N> <partner name> <DD.MM.YYYY> <debit> <credit>[glued docno] [docno …] <details> <partner IBAN|account> <partner IDNO(13)>
// e.g.:
//   12 (R) AMDARIS S.R.L. 07.05.2026 0.00 7866.00299 Plata pentru Servicii … MD94AG000000022512036601 1009600020033
// The trailing partner account + 13-digit IDNO give us the e-Factura buyer for free.

// Separator before the partner account tolerates a stray "/" glued to the IBAN
// (row observed in the wild: "… pe teritoriul Repub licii Moldova /MD04TRGAAA… 1006601000037").
const MAIB_MERGED_ROW_RE =
  /(?:^|\s)(\d{1,3})\s+((?:\([RN]\)\s*)?\S[\s\S]{0,180}?)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{1,10}\.\d{2})\s+(\d{1,10}\.\d{2})(\d{0,7})\s+([\s\S]{0,600}?)[\s/]+(MD[0-9A-Z]{18,30}|\d{5,20})\s+(\d{13})(?=\s+\d{1,3}\s+\S|\s*SOLD\s+FINAL|\s*RULAJ|\s*$)/g;

// A full row header (date + debit + credit) INSIDE a captured details blob means the lazy
// match swallowed the next row (happens when the current row's own account/IDNO tail is
// scrambled by the PDF text layer). We then salvage the outer row without its IBAN/IDNO and
// rewind the scan so the swallowed row is re-matched on its own.
const SWALLOWED_ROW_RE = /\s\d{1,3}\s+\(?[A-ZĂÂÎȘȚ][\s\S]{0,180}?\d{2}\.\d{2}\.\d{4}\s+\d{1,10}\.\d{2}\s+\d{1,10}\.\d{2}/;

/** Holder (own company) IDNO from the statement header: "<IDNO(13)> <IBAN> <CUR> Sold Initial…". */
function parseHolderIdno(rawText: string): string | null {
  const m = /(\d{13})\s+MD[0-9A-Z]{18,30}\s+[A-Z]{3}\s/.exec(rawText.slice(0, 1500));
  return m ? m[1] : null;
}

/** Auto-triage: own-account transfers and bank fees are NOT e-Factura candidates. */
function classifyMaibRow(input: {
  holderIdno: string | null;
  partnerName: string;
  partnerIdno: string;
  details: string;
  direction: "in" | "out";
}): { reportable: "yes" | "no" | "review"; reason: string; confidence: number } {
  if (input.holderIdno && input.partnerIdno === input.holderIdno) {
    return { reportable: "no", reason: "Transfer intern între conturile proprii", confidence: 0.9 };
  }
  if (
    /^BC\s*['’]?MAIB['’]?/i.test(input.partnerName) ||
    /comision|transfer pentru operatiuni de accep|revers pentru operatiuni|com\.\s*plati|com\.trans/i.test(input.details)
  ) {
    return { reportable: "no", reason: "Operațiune bancară (comision / decontare card)", confidence: 0.85 };
  }
  if (input.direction === "in") {
    return { reportable: "yes", reason: "Încasare de la client — candidat e-Factura", confidence: 0.8 };
  }
  return { reportable: "review", reason: "Plată furnizor — verificați factura primită", confidence: 0.6 };
}

export function parseMaibMergedStatement(rawText: string): StatementTxn[] {
  // This format has no newlines — a text WITH many newlines is some other layout.
  if (!/Extras de Cont/i.test(rawText.slice(0, 2000))) return [];
  const holderIdno = parseHolderIdno(rawText);
  const txns: StatementTxn[] = [];
  let lastRowNo = 0;
  let m: RegExpExecArray | null;
  MAIB_MERGED_ROW_RE.lastIndex = 0;
  while ((m = MAIB_MERGED_ROW_RE.exec(rawText)) !== null) {
    const [, rowNoRaw, nameRaw, date, debitRaw, creditRaw, , detailsRawFull, accountRaw, idnoRaw] = m;
    const rowNo = parseInt(rowNoRaw, 10);
    // Row numbers are strictly increasing — reject false-positive matches inside details.
    if (rowNo <= lastRowNo) continue;
    const debit = parseAmount(debitRaw);
    const credit = parseAmount(creditRaw);
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) continue;
    if (debit === 0 && credit === 0) continue;
    lastRowNo = rowNo;

    // Swallow guard: if the details blob contains the NEXT row's header, this match crossed a
    // row boundary. Keep the outer row (its own date/amounts/name are sound) but drop the
    // suspect account/IDNO, truncate details, and rewind so the inner row parses on its own.
    let detailsRaw = detailsRawFull;
    let account: string | null = accountRaw;
    let idno: string | null = idnoRaw;
    const swallowed = SWALLOWED_ROW_RE.exec(detailsRawFull);
    if (swallowed) {
      detailsRaw = detailsRawFull.slice(0, swallowed.index);
      account = null;
      idno = null;
      const innerOffset = m[0].indexOf(detailsRawFull) + swallowed.index;
      MAIB_MERGED_ROW_RE.lastIndex = m.index + innerOffset;
    }
    const isIn = credit > 0;
    const amount = isIn ? credit : debit;
    const partnerName = nameRaw.replace(/^\([RN]\)\s*/i, "").replace(/\s+/g, " ").trim();
    // Details may start with the (split) document number — strip leading digit groups.
    const details = detailsRaw
      .replace(/^(?:\d{1,7}\s+){0,3}/, "")
      .replace(/\s+/g, " ")
      .trim();
    const direction: "in" | "out" = isIn ? "in" : "out";
    const verdict = classifyMaibRow({ holderIdno, partnerName, partnerIdno: idno ?? "", details, direction });
    const [d, mo, y] = date.split(".");
    txns.push({
      tx_date: `${y}-${mo}-${d}`,
      description: (details || (isIn ? "Intrare" : "Ieșire")).slice(0, 300),
      counterparty: partnerName.slice(0, 300) || null,
      counterparty_idno: idno,
      counterparty_iban: account,
      amount_cents: Math.round(amount * 100),
      direction,
      currency: "MDL",
      orig_amount: null,
      reportable: verdict.reportable,
      reportable_reason: verdict.reason,
      reportable_confidence: verdict.confidence,
    });
  }
  // A real statement has ≥2 rows; a single match on random text is likely a false positive.
  return txns.length >= 2 ? txns : [];
}

/**
 * MAIB current-account Excel/CSV export.
 * ExcelJS converts each row to comma-separated cells: "1,01.09.2025,ROTARI ANA,286,Plata pentru...,16000,0"
 * Column order (MAIB standard): N/O, Data, Date partener, No doc, Detalii plata, Debit, Credit
 */
function parseExcelCsvStatement(rawText: string): StatementTxn[] {
  const txns: StatementTxn[] = [];
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const cols = line.split(",");
    if (cols.length < 7) continue;
    // Col 1: N/O (number), Col 2: date DD.MM.YYYY, cols -2/-1: debit/credit
    const dateStr = cols[1]?.trim() ?? "";
    const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateStr);
    if (!dateMatch) continue;
    const [, d, mo, y] = dateMatch;
    // Debit is second-to-last non-empty col, credit is last non-empty col
    const debitRaw = cols[cols.length - 2]?.trim() ?? "0";
    const creditRaw = cols[cols.length - 1]?.trim() ?? "0";
    const debit = parseAmount(debitRaw);
    const credit = parseAmount(creditRaw);
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) continue;
    if (debit === 0 && credit === 0) continue;
    const isIn = credit > 0;
    const amount = isIn ? credit : debit;
    // Counterparty in col 3 (index 2), description in col 5 (index 4)
    const counterparty = cols[2]?.trim() || null;
    const details = cols.slice(4, cols.length - 2).join(" ").trim();
    const desc = [counterparty, details].filter(Boolean).join(" — ").slice(0, 300);
    // STMT-005: MAIB Excel keeps partner IDNO/IBAN in the partner cell — mine them from the row.
    const idnoMatch = /\b([12]\d{12})\b/.exec(line);
    const ibanMatch = /\b(MD[0-9A-Z]{18,30})\b/.exec(line);
    txns.push({
      tx_date: `${y}-${mo}-${d}`,
      description: desc || (isIn ? "Intrare" : "Ieșire"),
      counterparty: counterparty || null,
      counterparty_idno: idnoMatch ? idnoMatch[1] : null,
      counterparty_iban: ibanMatch ? ibanMatch[1] : null,
      amount_cents: Math.round(amount * 100),
      direction: isIn ? "in" : "out",
      currency: "MDL",
      orig_amount: null,
      reportable: "review",
      reportable_reason: isIn ? "Intrare — verificați dacă necesită factură" : "Plată — verificați dacă necesită factură",
      reportable_confidence: 0.5,
    });
  }
  return txns;
}

/**
 * MAIB card statement rows:
 * "01.10.2025 01.10.2025 DIGITALOCEAN.COM card ***2084 28.80 USD 488.57 721.92"
 */
function parseCardStatement(rawText: string): StatementTxn[] {
  const txns: StatementTxn[] = [];
  const lineRe =
    /(\d{2}\.\d{2}\.\d{4})\s+\d{2}\.\d{2}\.\d{4}\s+(.+?)\s+([\d.,]+)\s+(USD|EUR|MDL|RON)\s+([\d.,]+)\s+([\d.,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(rawText)) !== null) {
    const [, date, descRaw, origAmt, origCur, acctAmt] = m;
    const desc = descRaw.replace(/\s+card\s+\*+\d+.*$/i, "").trim();
    const [d, mo, y] = date.split(".");
    const acct = parseAmount(acctAmt);
    const isIn = /alimentare|transfer pe card|intrare/i.test(descRaw);
    txns.push({
      tx_date: `${y}-${mo}-${d}`,
      description: desc,
      counterparty: guessCounterparty(desc),
      counterparty_idno: null,
      counterparty_iban: null,
      amount_cents: Math.round((Number.isFinite(acct) ? acct : 0) * 100),
      direction: isIn ? "in" : "out",
      currency: "MDL",
      orig_amount: origCur !== "MDL" ? `${origAmt} ${origCur}` : null,
      reportable: "review",
      reportable_reason: isIn ? "Intrare / alimentare cont — fără document" : "Plată — verificați dacă necesită factură",
      reportable_confidence: 0.5,
    });
  }
  return txns;
}

/**
 * MAIB current-account "Extras de Cont" table format (PDF text layer).
 * Rows look like (after OCR/text extraction, whitespace-collapsed):
 *   "1 (R) ROTARI ANA 01.09.2025 286 16000.00 0.00 Plata pentru Servicii..."
 * or split across lines due to multiline partner block. We match on the date + two
 * non-negative amounts (debit, credit) that appear on the same logical line.
 * Pattern: optional N/O prefix, date DD.MM.YYYY, optional doc-nr, debit, credit
 */
function parseCurrentAccountStatement(rawText: string): StatementTxn[] {
  const txns: StatementTxn[] = [];
  // Flatten to single line per transaction: join the raw text into one string, then
  // match each row by its date + two trailing amounts.
  // Row pattern: date  ...description/counterparty blob...  debit  credit
  // debit=0 means credit>0 (inflow), credit=0 means debit>0 (outflow).
  const rowRe =
    /(\d{2}\.\d{2}\.\d{4})\s+\d+\s+([\s\S]*?)\s+([\d\s]+[.,]\d{2})\s+([\d\s]+[.,]\d{2})(?=\s*(?:\d{2}\.\d{2}\.\d{4}|\n\s*\n|SOLD FINAL|RULAJ|$))/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(rawText)) !== null) {
    const [, date, descBlob, debitRaw, creditRaw] = m;
    const debit = parseAmount(debitRaw.replace(/\s/g, ""));
    const credit = parseAmount(creditRaw.replace(/\s/g, ""));
    if (!Number.isFinite(debit) || !Number.isFinite(credit)) continue;
    if (debit === 0 && credit === 0) continue;
    const isIn = credit > 0;
    const amount = isIn ? credit : debit;
    // descBlob contains counterparty + doc details — take first meaningful line as desc
    const descLines = descBlob.split(/\n|\r/).map((l) => l.trim()).filter(Boolean);
    const desc = descLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
    const [d, mo, y] = date.split(".");
    txns.push({
      tx_date: `${y}-${mo}-${d}`,
      description: desc,
      counterparty: guessCounterpartyFromCurrentAccount(descLines),
      counterparty_idno: null,
      counterparty_iban: null,
      amount_cents: Math.round(amount * 100),
      direction: isIn ? "in" : "out",
      currency: "MDL",
      orig_amount: null,
      reportable: "review",
      reportable_reason: isIn
        ? "Intrare — verificați dacă necesită factură"
        : "Plată — verificați dacă necesită factură",
      reportable_confidence: 0.5,
    });
  }

  // Fallback: simpler line-by-line scan when the regex above matches nothing
  // (PDF text may collapse columns differently). Look for lines with date + two amounts.
  if (txns.length === 0) {
    return parseCurrentAccountFallback(rawText);
  }
  return txns;
}

function guessCounterpartyFromCurrentAccount(descLines: string[]): string | null {
  for (const line of descLines) {
    const u = line.toUpperCase();
    if (u.includes("(R)") || u.includes("(N)")) {
      // Lines like "(R) ROTARI ANA" or "(N) PROGRAMUL NATIUNILOR..."
      return line.replace(/^\s*\([RN]\)\s*/i, "").trim().split(/\s{2,}/)[0] ?? null;
    }
  }
  return guessCounterparty(descLines[0] ?? "");
}

/**
 * Simpler fallback: scan each line for "date debit credit" at end.
 * Handles PDFs where text-layer columns are interleaved differently.
 */
function parseCurrentAccountFallback(rawText: string): StatementTxn[] {
  const txns: StatementTxn[] = [];
  const lines = rawText.split(/\r?\n/);
  // Build blocks: each block starts with a row-number+date line
  // "1 (R) ROTARI ANA" / "01.09.2025 286 16000.00 0.00"
  // After `unpdf`, the MAIB current-account PDF produces lines roughly:
  //   "N/O Data tranzactiei ..."   (header)
  //   "(R) ROTARI ANA"             (counterparty)
  //   "01.09.2025 286 16000.00 0.00"  (date + amounts)
  //   "Plata pentru..."            (description)
  // Line ends with debit + credit — two decimal amounts (x.xx) preceded by date + doc-nr.
  // Use a lookahead-free anchor: match the date, skip non-decimal content, take last two amounts.
  // The MAIB row: "01.09.2025 286 16000.00 0.00" or "01.09.2025 24437 50 146.85 0.00"
  const dateAmtRe = /^(\d{2}\.\d{2}\.\d{4})\s+\S+(?:\s+\S+)*?\s+(\d[\d.,]*\d|\d+\.\d{2})\s+(\d[\d.,]*\d|\d+\.\d{2})\s*$/;
  let pendingCounterparty = "";
  let pendingDesc = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^N\/O\s|^Data tranz|^Date partn|^Detalii|^SOLD |^RULAJ/i.test(line)) {
      pendingCounterparty = "";
      pendingDesc = "";
      continue;
    }
    const dm = dateAmtRe.exec(line);
    if (dm) {
      const [, date, debitRaw, creditRaw] = dm;
      const debit = parseAmount(debitRaw);
      const credit = parseAmount(creditRaw);
      if (!Number.isFinite(debit) || !Number.isFinite(credit)) continue;
      if (debit === 0 && credit === 0) continue;
      const isIn = credit > 0;
      const amount = isIn ? credit : debit;
      const [d, mo, y] = date.split(".");
      // Next line(s) after the date line are the description
      const nextDesc = lines[i + 1]?.trim() ?? "";
      const desc = [pendingCounterparty, pendingDesc, nextDesc].filter(Boolean).join(" ").trim().slice(0, 300) ||
        (isIn ? "Intrare" : "Ieșire");
      txns.push({
        tx_date: `${y}-${mo}-${d}`,
        description: desc,
        counterparty: pendingCounterparty || null,
        counterparty_idno: null,
        counterparty_iban: null,
        amount_cents: Math.round(amount * 100),
        direction: isIn ? "in" : "out",
        currency: "MDL",
        orig_amount: null,
        reportable: "review",
        reportable_reason: isIn ? "Intrare — verificați dacă necesită factură" : "Plată — verificați dacă necesită factură",
        reportable_confidence: 0.5,
      });
      pendingCounterparty = "";
      pendingDesc = "";
    } else if (/^\([RN]\)/.test(line)) {
      pendingCounterparty = line.replace(/^\([RN]\)\s*/i, "").trim();
    } else if (/^[A-ZĂÂÎȘȚ]/.test(line) && line.length > 5) {
      pendingDesc = line;
    }
  }
  return txns;
}

// The invoice → statement-line matcher is a pure function (no AI/db) — it lives in
// ../fin/invoiceLineMatch so it can be unit-tested without booting PGlite. Re-exported here
// for existing call sites that import it from statementExtractor.
export {
  matchInvoiceToLines,
  type LineCandidate,
  type InvoiceForMatch,
} from "../fin/invoiceLineMatch";

function guessCounterparty(desc: string): string | null {
  const d = desc.toUpperCase();
  if (d.includes("FACEBK") || d.includes("META")) return "Meta / Facebook Ads";
  if (d.includes("DIGITALOCEAN")) return "DigitalOcean";
  if (d.includes("ZOOM")) return "Zoom";
  if (d.includes("CAPCUT")) return "CapCut";
  if (d.includes("TRELLO") || d.includes("ATLASSIAN")) return "Atlassian / Trello";
  if (d.includes("SENDINBLUE")) return "Brevo (Sendinblue)";
  if (d.includes("TILDA")) return "Tilda";
  if (d.includes("MAIB TRANSFER")) return "MAIB — transfer intern";
  if (d.includes("ALIMENTARE")) return "Alimentare cont";
  return null;
}

export interface StatementExtractionResult {
  transactions: StatementTxn[];
  auditId: string;
  isStub: boolean;
}

export async function extractStatementTransactions(
  rawText: string,
  tenantId: string,
  userId: string,
  captureId: string,
): Promise<StatementExtractionResult> {
  // FAST PATH: the deterministic regex parser handles MAIB-style statements instantly.
  // We try it FIRST and, if it finds transactions, return immediately WITHOUT calling the
  // LLM. A real OpenAI call over a full statement (maxTokens 4000) can exceed Vercel's 30s
  // function limit → http_504. The heuristic is both faster and exact for these statements.
  const heuristic = parseStatementHeuristic(rawText);
  if (heuristic.length > 0) {
    return { transactions: heuristic, auditId: "", isStub: true };
  }

  // STMT-006: NEVER fall through to the AI for spreadsheet input (tab-delimited). The Excel
  // parser above is deterministic and authoritative; if it found nothing (e.g. a card
  // statement or an unknown layout), the AI over a large tab-blob won't do better and — the
  // real bug we're fixing — a 4000-token call over ~100KB of cells exceeds Vercel's 30s
  // function limit → the upload 500s ("Eroare la upload"). Return empty cleanly instead.
  if (rawText.includes("\t")) {
    return { transactions: [], auditId: "", isStub: true };
  }

  // SLOW PATH (only when the heuristic recognized nothing, e.g. a non-MAIB layout): ask the AI.
  const callOptions: AiCallOptions = {
    action: "capture_extract",
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Extrage toate tranzacțiile din extrasul de cont următor:\n\n${rawText.slice(0, 12000)}`,
    tenantId,
    userId,
    entityType: "fin_capture",
    entityId: captureId,
    maxTokens: 4000,
  };

  let result;
  try {
    result = await callAi(callOptions);
  } catch {
    return { transactions: [], auditId: "", isStub: true };
  }

  let transactions: StatementTxn[] = [];
  if (!result.isStub) {
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { transactions?: unknown[] };
        transactions = normalizeTxns(parsed.transactions ?? []);
      }
    } catch {
      transactions = [];
    }
  }

  return { transactions, auditId: result.auditId, isStub: result.isStub };
}

function normalizeTxns(raw: unknown[]): StatementTxn[] {
  const out: StatementTxn[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const t = r as Record<string, unknown>;
    const desc = typeof t.description === "string" ? t.description : "";
    if (!desc) continue;
    const cents =
      typeof t.amount_cents === "number"
        ? Math.round(Math.abs(t.amount_cents))
        : Math.round(Math.abs(parseFloat(String(t.amount_cents ?? "0")) || 0));
    const dir = t.direction === "in" ? "in" : "out";
    const rep = t.reportable === "yes" ? "yes" : t.reportable === "no" ? "no" : "review";
    const conf = typeof t.reportable_confidence === "number" ? Math.min(1, Math.max(0, t.reportable_confidence)) : 0.5;
    out.push({
      tx_date: typeof t.tx_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.tx_date) ? t.tx_date : null,
      description: desc,
      counterparty: typeof t.counterparty === "string" ? t.counterparty : null,
      counterparty_idno:
        typeof t.counterparty_idno === "string" && /^\d{7,13}$/.test(t.counterparty_idno)
          ? t.counterparty_idno
          : null,
      counterparty_iban:
        typeof t.counterparty_iban === "string" && /^[A-Z0-9]{5,34}$/.test(t.counterparty_iban.trim())
          ? t.counterparty_iban.trim()
          : null,
      amount_cents: cents,
      direction: dir,
      currency: typeof t.currency === "string" ? t.currency : "MDL",
      orig_amount: typeof t.orig_amount === "string" ? t.orig_amount : null,
      reportable: rep,
      reportable_reason: typeof t.reportable_reason === "string" ? t.reportable_reason : null,
      reportable_confidence: conf,
    });
  }
  return out;
}
