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

Returnează DOAR JSON:
{ "transactions": [
  { "tx_date":"2025-10-01","description":"...","counterparty":"...","amount_cents":48857,
    "direction":"out","currency":"MDL","orig_amount":"28.80 USD",
    "reportable":"review","reportable_reason":"...","reportable_confidence":0.6 }
] }`;

// parseAmount lives in ../fin/money (pure, no AI/db) so the matcher can share it; re-export
// here for existing call sites that import it from statementExtractor.
export { parseAmount } from "../fin/money";

/** Heuristic fallback parser for MAIB-style statements (used in stub/mock mode). */
export function parseStatementHeuristic(rawText: string): StatementTxn[] {
  // Try card-statement format first (two dates + currency code)
  const cardTxns = parseCardStatement(rawText);
  if (cardTxns.length > 0) return cardTxns;
  // Try CSV/Excel tabular format (MAIB Excel export: comma-separated columns with date in col 1)
  const csvTxns = parseExcelCsvStatement(rawText);
  if (csvTxns.length > 0) return csvTxns;
  // Try current-account format (MAIB "Extras de Cont" table: debit/credit columns from PDF)
  return parseCurrentAccountStatement(rawText);
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
    txns.push({
      tx_date: `${y}-${mo}-${d}`,
      description: desc || (isIn ? "Intrare" : "Ieșire"),
      counterparty: counterparty || null,
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
