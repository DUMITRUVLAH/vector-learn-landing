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
  PayeeOption,
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
  /** Every valid account for this party (primary first) — ≥2 means the UI asks which to use. */
  ibans: string[];
  ibanForeign: boolean;
  ibanLowConf: boolean;
  idnoDropped: boolean;
}

/** Validate & slot-route a party's idno/iban (the heart of the requisite correctness). */
export function routeIdAndIban(p: ParExtractedParty): RoutedRequisites {
  let idno: string | null = p.idno ?? null;
  let ibanRaw = normalizeIban(p.iban ?? null);
  // Extra accounts (MDL + EUR, second bank…) travel in `ibans`; the primary stays in `iban`.
  const extraIbans = (p.ibans ?? [])
    .map((v) => normalizeIban(v))
    .filter((v): v is string => v != null);
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

  // (e) validate the extra accounts the same way; keep only genuinely valid ones, deduped.
  const validExtras: string[] = [];
  for (const cand of extraIbans) {
    if (/^\d{13}$/.test(cand)) continue; // a fiscal id that slipped into the account list
    const ok = /^MD\d{2}[A-Z0-9]{20}$/.test(cand) ? isValidMoldovaIBAN(cand) : isValidIBAN(cand);
    if (ok) validExtras.push(cand);
  }
  const ibans = [...new Set([...(iban ? [iban] : []), ...validExtras])];
  // A doc that lists several accounts but whose primary failed validation still offers a choice.
  if (!iban && ibans.length > 0) {
    iban = ibans[0];
    ibanForeign = !/^MD/.test(iban);
    ibanLowConf = ibans.length > 1 || ibanForeign;
  }

  return { idno, iban, ibans, ibanForeign, ibanLowConf, idnoDropped };
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
    ...(c.ibans && c.ibans.length > 1 ? { ibans: c.ibans } : {}),
    ...(c.ibanForeign ? { ibanForeign: true } : {}),
    bank: c.bank,
    bic: c.bic,
    legalAddress: c.legalAddress,
    administratorName: c.administratorName,
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

/**
 * The decision itself (payee / ask / none). Kept private: `choosePayee` wraps it to attach the
 * grouped `options` list.
 *
 * NOTE: there is deliberately NO document-type gate here any more. Requisites are extracted from
 * ANY act — contract, act de predare-primire, proces-verbal, invoice, receipt — because a PAR is
 * routinely raised against a non-invoice document. When a document really has nothing payable,
 * the party/amount extraction comes back empty on its own; that is a better signal than a class
 * label, which used to blank out perfectly good acts.
 */
function decidePayee(
  ext: ParPartiesExtraction,
  tenantOrgName: string | null,
): Omit<ChoosePayeeResult, "options"> & { _pool: InternalCandidate[] } {
  const currency = ext.currency ?? "MDL";
  const scope = ext.scope;

  // 1. Drop banks + self/payer-by-name.
  // On the LLM path (not the coarse stub), the extractor's role labels are reliable, so an explicit
  // "client" (buyer/payer — MIXBOOK on a "Cont de plată", the "Autoritatea contractantă" on a
  // procurement contract) is NEVER the payee — drop it. This matters when the creator's own org is
  // the seller/Prestator: after self-exclusion only the client/buyer remains, and we must NOT prefill
  // the buyer as the beneficiary (→ yields no payee instead, which is correct: there is no one to pay).
  // The stub mislabels both parties "client", so we keep the lenient behavior there (isPayerHint only).
  const trustRoles = ext.isStub === false;
  // Everything that is not a bank and not the tenant itself. The DECISION narrows this further
  // (below), but the UI needs the full list: the payer is shown as a (non-recommended) group so a
  // user can still pick it when the document's role wording misled the extractor — the classic
  // Moldovan "BENEFICIAR = the one who pays" trap.
  const displayPool = ext.parties.filter(
    (p) => p.role !== "bank" && !isPayeeBank(p.name) && !fuzzyOrgMatch(p.name, tenantOrgName),
  );
  const pool = displayPool.filter((p) => !(trustRoles && p.role === "client"));

  // 3. Build validated candidates from the pool.
  const toCandidate = (p: ParExtractedParty): InternalCandidate => {
    const r = routeIdAndIban(p);
    const name = p.name;
    return {
      name,
      idno: r.idno,
      iban: r.iban,
      ibans: r.ibans,
      ibanForeign: r.ibanForeign,
      bank: p.bank ?? null,
      bic: p.bic ?? null,
      legalAddress: p.legalAddress ?? null,
      administratorName: p.administratorName ?? null,
      payeeType: detectPayeeType(name),
      _role: p.role,
      _ibanLowConf: r.ibanLowConf,
      _idnoDropped: r.idnoDropped,
      _isPayerHint: !!p.isPayerHint,
      _hadIdno: p.idno != null || (p.iban != null && /^\d{13}$/.test(normalizeIban(p.iban) ?? "")),
    };
  };
  const candidates: InternalCandidate[] = pool.map(toCandidate);
  const displayCandidates: InternalCandidate[] = displayPool.map(toCandidate);

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

  // 4-bis. Nothing payable in the document (no amount anywhere AND no party carries a fiscal id
  // or an account) → propose NO payee. This replaces the old "documentClass === not_invoice"
  // gate, which blanked perfectly good acts just because they were not invoices. The signal now
  // comes from the CONTENT (are there payment requisites?), not from the document's label — so an
  // act de primire-predare with an IBAN and a sum prefills, while a meeting protocol does not.
  if (ext.amountCents == null && candidates.every((c) => !c.idno && !c.iban)) {
    return {
      _pool: displayCandidates,
      needsClarification: false,
      candidates: [],
      payee: null,
      lowConfidence: {},
      amountCents: 0,
      currency,
      scope,
    };
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
      _pool: displayCandidates,
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
        _pool: displayCandidates,
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
      _pool: displayCandidates,
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
    _pool: displayCandidates,
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
 * Public entry point: decide the payee AND return every party the document names, grouped with
 * its own requisites (IDNO, account(s), bank, address, administrator).
 *
 * Why the grouped list exists even when a payee WAS resolved: documents routinely name several
 * providers/beneficiaries, and the automatic pick is a ranking, not a certainty. The UI shows the
 * groups, marks the recommended one, and lets the user switch — instead of silently filling one
 * party and hiding the others (which forced a re-upload or manual retyping when it guessed wrong).
 */
export function choosePayee(
  ext: ParPartiesExtraction,
  tenantOrgName: string | null,
): ChoosePayeeResult {
  const { _pool, ...decision } = decidePayee(ext, tenantOrgName);

  const recommendedName = decision.payee?.name.toLowerCase() ?? null;
  const options: PayeeOption[] = dedupeByName(
    [..._pool].sort(
      (a, b) => roleRank(a._role) - roleRank(b._role) || requisiteScore(b) - requisiteScore(a),
    ),
  ).map((c) => ({
    ...stripInternal(c),
    role: c._role,
    recommended: recommendedName != null && c.name.toLowerCase() === recommendedName,
    isPayer: c._isPayerHint || c._role === "client",
  }));

  return { ...decision, options };
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
