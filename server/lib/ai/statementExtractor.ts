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
  const txns: StatementTxn[] = [];
  // Match: DD.MM.YYYY ... <description> ... <amount> <CUR> ... <accountAmount>
  // MAIB lines look like: "01.10.2025 01.10.2025 DIGITALOCEAN.COM card ***2084 28.80 USD 488.57 721.92"
  const lineRe =
    /(\d{2}\.\d{2}\.\d{4})\s+\d{2}\.\d{2}\.\d{4}\s+(.+?)\s+([\d.,]+)\s+(USD|EUR|MDL|RON)\s+([\d.,]+)\s+([\d.,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(rawText)) !== null) {
    const [, date, descRaw, origAmt, origCur, acctAmt] = m;
    const desc = descRaw.replace(/\s+card\s+\*+\d+.*$/i, "").trim();
    const [d, mo, y] = date.split(".");
    const acct = parseAmount(acctAmt);
    // Direction: MAIB "Alimentare"/"TRANSFER pe card" inflows; everything else outflow.
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
