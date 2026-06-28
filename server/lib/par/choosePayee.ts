/**
 * PAR AI multi-party autocomplete — deterministic payee post-processor.
 *
 * `choosePayee(extraction, tenantOrgName)` is a PURE function (no I/O) that:
 *   - excludes banks and the creator's own org (fuzzy self-match) and explicit payers,
 *   - picks the payee by ROLE (executor > provider; never the literal word "Beneficiar"),
 *   - validates & routes every requisite (IBAN mod-97, 13-digit IDNO, VAT exclusion),
 *   - asks the user when genuinely ambiguous (2+ equally-ranked paid parties).
 *
 * All correctness lives here + in stubPartyParser.ts; both are unit-tested against
 * the 20 scenarios, so the owner's failing case is provably fixed with no API key.
 */

import type {
  ParExtractedParty,
  ParPartiesExtraction,
  ParRole,
  PayeeCandidate,
  ChoosePayeeResult,
} from "./parPartyTypes";
import { isPayeeBank } from "./payeeBankClassifier";
import { detectPayeeType } from "./payeeTypeDetectorServer";
import { isValidMoldovaIBAN, isValidIBAN, isValidIDNP } from "./validators";

// ─── Helpers (exported for unit tests) ────────────────────────────────────────

export function normalizeIban(raw: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  return clean.length ? clean : null;
}

function stripNonDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Lower-cased, legal-form-stripped, punctuation-normalized org name for fuzzy compare. */
function normOrg(s: string): string {
  return s
    .toLowerCase()
    .replace(/["“”„«».]/g, "")
    .replace(
      /\b(s\.?r\.?l\.?|s\.?a\.?|a\.?o\.?|î\.?i\.?|ооо|оао|зао|gmbh|llc|ltd|srl|sa)\b/g,
      " ",
    )
    .replace(
      /asociaț?ia\s+obșteasc[ăa]|asociatia\s+obsteasca|public\s+assoc\w*|fundați?a|fundatia|общественная\s+организация|întreprinderea\s+individuală|intreprinderea\s+individuala/g,
      " ",
    )
    .replace(/[^a-z0-9а-яёăâîșțöü ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "de",
  "la",
  "si",
  "și",
  "the",
  "of",
  "and",
  "pentru",
  "din",
  "future",
  "centrul",
  "centru",
  "asociatia",
  "obsteasca",
]);

function distinctTokens(norm: string): string[] {
  return norm.split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** The 1-2 longest distinctive words of a name (as a joined substring for includes-match). */
function coreTokens(norm: string): string {
  const toks = distinctTokens(norm).sort((a, b) => b.length - a.length);
  return toks.slice(0, 2).sort().join(" ");
}

/**
 * Fuzzy self-org match: does `name` refer to the same org as `org` (the tenant)?
 * Handles legal-form reorder, quotes, case, and the public-assoc long form.
 */
export function fuzzyOrgMatch(name: string, org: string | null): boolean {
  if (!org || !org.trim()) return false;
  const nName = normOrg(name);
  const nOrg = normOrg(org);
  if (!nName || !nOrg) return false;
  if (nName === nOrg) return true;

  const coreOrg = coreTokens(nOrg);
  const coreName = coreTokens(nName);
  if (coreOrg && nName.includes(coreOrg)) return true;
  if (coreName && nOrg.includes(coreName)) return true;

  // Distinctive-token overlap ≥ 2.
  const setName = new Set(distinctTokens(nName));
  const setOrg = distinctTokens(nOrg);
  const overlap = setOrg.filter((t) => setName.has(t)).length;
  if (overlap >= 2) return true;

  // Single very-distinctive token shared (handles 1-word distinctive orgs).
  const overlapStrong = setOrg.filter((t) => setName.has(t) && t.length >= 6).length;
  return overlapStrong >= 1 && (distinctTokens(nOrg).length <= 2 || distinctTokens(nName).length <= 2);
}

export function roleRank(role: ParRole): number {
  switch (role) {
    case "executor":
      return 0;
    case "provider":
      return 1;
    case "unknown":
      return 5;
    case "client":
      return 8;
    case "bank":
      return 99;
    default:
      return 5;
  }
}

interface RoutedRequisites {
  idno: string | null;
  iban: string | null;
  ibanForeign: boolean;
  ibanLowConf: boolean;
  idnoDropped: boolean;
}

/** Validate & slot-route a party's idno/iban (the heart of the requisite correctness). */
export function routeIdAndIban(p: ParExtractedParty): RoutedRequisites {
  let idno: string | null = p.idno ?? null;
  let ibanRaw = normalizeIban(p.iban ?? null);
  let ibanForeign = false;
  let ibanLowConf = false;
  let iban: string | null = null;
  let idnoDropped = false;

  // (a) 13-digit value sitting in the iban slot is actually a fiscal id.
  if (ibanRaw && /^\d{13}$/.test(ibanRaw)) {
    if (!idno) idno = ibanRaw;
    ibanRaw = null;
  }

  // (b) validate idno: must be exactly 13 digits.
  if (idno && !isValidIDNP(idno)) {
    idno = null;
    idnoDropped = true;
  }

  // (c) never let a vatCode become idno (double-guard; extractor already separates).
  if (idno && p.vatCode && idno === stripNonDigits(p.vatCode)) {
    idno = null;
  }

  // (d) IBAN validation.
  if (ibanRaw) {
    if (/^MD\d{2}[A-Z0-9]{20}$/.test(ibanRaw)) {
      if (isValidMoldovaIBAN(ibanRaw)) {
        iban = ibanRaw;
      } else {
        iban = null;
        ibanLowConf = true; // format ok, mod-97 fail → empty + flag
      }
    } else if (isValidIBAN(ibanRaw)) {
      iban = ibanRaw; // foreign, ISO-13616 ok
      ibanForeign = true;
      ibanLowConf = true; // flag "verificați (IBAN non-MD)"
    } else {
      iban = null;
      ibanLowConf = true; // malformed / mod-97 fail
    }
  }

  return { idno, iban, ibanForeign, ibanLowConf, idnoDropped };
}

// ─── Internal candidate (carries decision metadata) ───────────────────────────

interface InternalCandidate extends PayeeCandidate {
  _role: ParRole;
  _ibanLowConf: boolean;
  _idnoDropped: boolean;
  _isPayerHint: boolean;
  _hadIdno: boolean;
}

function requisiteScore(c: InternalCandidate): number {
  return (c.idno ? 1 : 0) + (c.iban ? 1 : 0) + (c.bank ? 1 : 0);
}

function stripInternal(c: InternalCandidate): PayeeCandidate {
  return {
    name: c.name,
    idno: c.idno,
    iban: c.iban,
    ...(c.ibanForeign ? { ibanForeign: true } : {}),
    bank: c.bank,
    payeeType: c.payeeType,
  };
}

function dedupeByName(cands: InternalCandidate[]): InternalCandidate[] {
  const out: InternalCandidate[] = [];
  for (const c of cands) {
    if (out.some((o) => o.name.toLowerCase() === c.name.toLowerCase())) continue;
    out.push(c);
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function choosePayee(
  ext: ParPartiesExtraction,
  tenantOrgName: string | null,
): ChoosePayeeResult {
  const currency = ext.currency ?? "MDL";
  const scope = ext.scope;

  // 2. Non-financial / nothing to pay.
  if (ext.documentClass === "not_invoice" && ext.amountCents == null) {
    return {
      needsClarification: false,
      candidates: [],
      payee: null,
      lowConfidence: {},
      amountCents: 0,
      currency,
      scope,
    };
  }

  // 1. Drop banks + self/payer-by-name.
  const pool = ext.parties.filter(
    (p) =>
      p.role !== "bank" &&
      !isPayeeBank(p.name) &&
      !fuzzyOrgMatch(p.name, tenantOrgName),
  );

  // 3. Build validated candidates from the pool.
  const candidates: InternalCandidate[] = pool.map((p) => {
    const r = routeIdAndIban(p);
    const name = p.name;
    return {
      name,
      idno: r.idno,
      iban: r.iban,
      ibanForeign: r.ibanForeign,
      bank: p.bank ?? null,
      payeeType: detectPayeeType(name),
      _role: p.role,
      _ibanLowConf: r.ibanLowConf,
      _idnoDropped: r.idnoDropped,
      _isPayerHint: !!p.isPayerHint,
      _hadIdno: p.idno != null || (p.iban != null && /^\d{13}$/.test(normalizeIban(p.iban) ?? "")),
    };
  });

  // 4. Prefer paid-role parties; otherwise keep any party that is NOT an explicit payer/client.
  // We deliberately do NOT fall back to `candidates` (which would resurrect the excluded
  // client/payer): a document that names ONLY the payer (e.g. the creator's own org, or a doc
  // where self-match failed because orgLegalName is unset/misspelled) must yield NO payee and
  // leave the fields blank — never silently prefill the payer as the beneficiary of the payment.
  let paid = candidates.filter((c) => c._role === "executor" || c._role === "provider");
  if (paid.length === 0) {
    // After self-exclusion (step 1) the extractor's coarse role='client' is unreliable (it often
    // tags BOTH parties 'client'), so drop only EXPLICIT payers (isPayerHint — a "CLIENT/plătitor"
    // marker on THAT party). A remaining 'client'-labelled party is the counterparty = the payee.
    paid = candidates.filter((c) => !c._isPayerHint);
  }

  // 5. Rank: executor before provider; tie-break = more complete requisites.
  paid.sort(
    (a, b) => roleRank(a._role) - roleRank(b._role) || requisiteScore(b) - requisiteScore(a),
  );

  // 6. Resolve or ask.
  const distinct = dedupeByName(paid);

  const baseAmount = ext.amountCents;

  if (distinct.length === 1) {
    const payee = distinct[0];
    return {
      needsClarification: false,
      candidates: [],
      payee: stripInternal(payee),
      lowConfidence: {
        name: false,
        // Only flag idno when one was expected but dropped as invalid — not when the
        // doc legitimately has none (e.g. a cash receipt).
        idno: payee._idnoDropped,
        iban: payee._ibanLowConf,
        bank: false,
      },
      amountCents: baseAmount,
      currency,
      scope,
    };
  }

  if (distinct.length >= 2) {
    const top = distinct[0];
    const second = distinct[1];
    // A strictly higher-ranked sole leader resolves without asking
    // (e.g. lone executor/provider vs client/payer-hint parties).
    if (roleRank(top._role) < roleRank(second._role)) {
      return {
        needsClarification: false,
        candidates: [],
        payee: stripInternal(top),
        lowConfidence: {
          name: false,
          idno: top._idnoDropped,
          iban: top._ibanLowConf,
          bank: false,
        },
        amountCents: baseAmount,
        currency,
        scope,
      };
    }
    // Genuine tie among paid roles → ASK.
    return {
      needsClarification: true,
      candidates: distinct.map(stripInternal),
      payee: null,
      lowConfidence: {},
      amountCents: ambiguousAmount(ext),
      currency,
      scope,
    };
  }

  // distinct.length === 0 → nothing payable found.
  return {
    needsClarification: false,
    candidates: [],
    payee: null,
    lowConfidence: {},
    amountCents: baseAmount,
    currency,
    scope,
  };
}

/**
 * When asking the user who the payee is, decide whether to keep the total amount.
 * If the doc split the total into per-payee tranches → 0 (don't default to the total);
 * otherwise keep the unambiguous total.
 */
export function ambiguousAmount(ext: ParPartiesExtraction): number | null {
  if (ext.hasPerPartyAmounts) return 0;
  return ext.amountCents;
}
