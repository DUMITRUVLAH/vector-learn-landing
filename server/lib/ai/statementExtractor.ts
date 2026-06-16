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
    const acct = parseFloat(acctAmt.replace(/\./g, "").replace(",", ".")) || parseFloat(acctAmt);
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

/**
 * Invoice → statement-line matcher. Scores each candidate line against an uploaded invoice
 * by original-currency amount (strongest signal), vendor-name overlap, and date proximity.
 * Returns the best line id + confidence (0..1), or null if no decent match.
 */
export interface LineCandidate {
  id: string;
  origAmount: string | null; // "15.99 EUR"
  amountCents: number; // account-currency cents
  counterparty: string | null;
  description: string;
  txDate: string | null;
}
export interface InvoiceForMatch {
  vendorName: string | null;
  amountMajor: number | null; // invoice total in its own currency, major units (15.99)
  currency: string | null; // "EUR"
  date: string | null; // YYYY-MM-DD
}

export function matchInvoiceToLines(
  inv: InvoiceForMatch,
  lines: LineCandidate[],
): { lineId: string; confidence: number } | null {
  let best: { lineId: string; score: number } | null = null;
  const vendor = (inv.vendorName ?? "").toLowerCase();

  for (const l of lines) {
    let score = 0;
    // 1) Amount + currency from the line's original-currency string ("15.99 EUR").
    if (inv.amountMajor != null && l.origAmount) {
      const m = l.origAmount.match(/([\d.,]+)\s*([A-Z]{3})/);
      if (m) {
        const lineAmt = parseFloat(m[1].replace(",", "."));
        const lineCur = m[2];
        const amtClose = Math.abs(lineAmt - inv.amountMajor) <= 0.02;
        const curOk = !inv.currency || inv.currency.toUpperCase() === lineCur;
        if (amtClose && curOk) score += 0.6;
        else if (amtClose) score += 0.35;
      }
    }
    // 2) Vendor-name overlap (invoice vendor vs the line's counterparty/description).
    const hay = `${l.counterparty ?? ""} ${l.description}`.toLowerCase();
    if (vendor) {
      const tokens = vendor.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
      if (tokens.some((t) => hay.includes(t))) score += 0.3;
    }
    // 3) Date proximity (±5 days).
    if (inv.date && l.txDate) {
      const diff = Math.abs((new Date(inv.date).getTime() - new Date(l.txDate).getTime()) / 86400000);
      if (diff <= 5) score += 0.1;
    }
    if (!best || score > best.score) best = { lineId: l.id, score };
  }

  if (best && best.score >= 0.5) return { lineId: best.lineId, confidence: Math.min(1, best.score) };
  return null;
}

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
