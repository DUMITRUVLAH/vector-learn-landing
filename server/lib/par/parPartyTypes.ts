/**
 * PAR AI multi-party autocomplete — shared types.
 *
 * The LLM (parExtractor.ts) and the stub regex parser (stubPartyParser.ts) both
 * produce a flat `ParPartiesExtraction`. All decision logic lives in the pure
 * `choosePayee()` post-processor (choosePayee.ts), which never reads I/O and is
 * unit-tested against the 20 scenarios.
 *
 * The frontend mirror of the resolved-candidate shape lives in
 * src/lib/par/parCandidateTypes.ts (two-copies rule).
 */

export type ParRole =
  /** RO "Executor" — provides the service/works, IS PAID. */
  | "executor"
  /** "Prestator"/"Furnizor"/"Vânzător"/"Antreprenor"/"Contractor"/RU Исполнитель — IS PAID. */
  | "provider"
  /** "Beneficiar"/"Cumpărător"/"Plătitor"/RU Заказчик/EN Bill To — PAYS. */
  | "client"
  /** A financial institution, not a counterparty. */
  | "bank"
  /** Role could not be determined. */
  | "unknown";

export interface ParExtractedParty {
  /** Legal name as printed, lightly cleaned (quotes/honorifics stripped). */
  name: string;
  role: ParRole;
  /** 13-digit fiscal/personal id (cod fiscal = IDNO = IDNP). MAY be wrong-slotted; choosePayee re-routes. */
  idno?: string | null;
  /** Raw, possibly space-broken or invalid; choosePayee normalizes + validates. */
  iban?: string | null;
  /**
   * ALL bank accounts printed for this party when the document lists more than one
   * (a MDL and a EUR account, a second bank…). `iban` stays the primary one; choosePayee
   * validates each and the UI asks the user which account to pay into.
   */
  ibans?: string[] | null;
  /** Bank name if printed for this party. */
  bank?: string | null;
  /** SWIFT/BIC if printed. */
  bic?: string | null;
  legalAddress?: string | null;
  administratorName?: string | null;
  /** "Cod TVA"/VAT — captured ONLY to keep it OUT of idno; never used as id. */
  vatCode?: string | null;
  /** true if the doc labels this party with an explicit PAYER word (Plătitor/Ordonator/Заказчик/Bill To). */
  isPayerHint?: boolean;
  /**
   * Fields the purity layer (partyPurify.ts) had to repair — a value relocated into
   * them from the wrong slot, or junk stripped out. Drives honest "⚠ de verificat"
   * flags instead of hardcoded confidence.
   */
  repaired?: {
    name?: boolean;
    idno?: boolean;
    iban?: boolean;
    bank?: boolean;
    bic?: boolean;
    legalAddress?: boolean;
  };
}

export interface ParPartiesExtraction {
  parties: ParExtractedParty[];
  /** Already in cents. */
  amountCents: number | null;
  /** [0..1] */
  amountConfidence: number;
  currency: "MDL" | "EUR" | "USD" | null;
  /** Purpose / object of contract (short). */
  scope: string | null;
  documentClass: "invoice" | "receipt" | "not_invoice" | null;
  documentClassReason?: string;
  /**
   * true if the doc splits the total into per-payee tranches tied to distinct
   * candidates (e.g. a tripartite agreement with separate "Suma"/"Сумма" lines).
   * When true and ambiguous, choosePayee zeroes the amount instead of defaulting
   * to the (wrong) total. Set by the stub parser / prompt rule.
   */
  hasPerPartyAmounts?: boolean;
  /** Line items / services from the document (section 10 "Articole"). Unit price in CENTS. */
  lineItems?: ParExtractedLineItem[];
  isStub: boolean;
  /**
   * Why the model was not consulted (stub fallback). Distinguishes "no API key configured"
   * from a real outage (expired quota / 429 / timeout), which the UI must report differently.
   */
  unavailable?: "no_key" | "feature_disabled" | "budget_exceeded" | "api_error";
}

export interface ParExtractedLineItem {
  /** Service / product description. */
  description: string;
  /** Integer quantity (≥1). */
  quantity: number;
  /** Unit of measure ("buc", "sesie", "ore", "participanți"…) or null. */
  unit: string | null;
  /** Unit price in CENTS (minor units). */
  unitPriceCents: number;
}

// ─── choosePayee result contract ──────────────────────────────────────────────

export interface PayeeCandidate {
  name: string;
  idno: string | null;
  /** Only set if valid (MD mod-97) OR valid foreign (flagged via ibanForeign). */
  iban: string | null;
  /** Every VALID account found for this party (≥2 → the UI asks which one to pay into). */
  ibans?: string[];
  /** true if non-MD but ISO-13616 valid → UI shows "verificați (IBAN non-MD)". */
  ibanForeign?: boolean;
  bank: string | null;
  bic?: string | null;
  legalAddress?: string | null;
  administratorName?: string | null;
  payeeType: "fizic" | "juridic" | null;
}

/**
 * One party the document names, with its own group of requisites. Returned for EVERY
 * plausible payee (not only on a tie) so the UI can always show "cine primește plata?"
 * with the automatically-chosen option marked.
 */
export interface PayeeOption extends PayeeCandidate {
  /** The role the extractor assigned — shown as a hint ("Prestator", "Client"…). */
  role: ParRole;
  /** true for the option `choosePayee` would auto-fill. */
  recommended: boolean;
  /** true when the party is the one that PAYS (kept visible, but never auto-filled). */
  isPayer: boolean;
}

export interface ChoosePayeeResult {
  needsClarification: boolean;
  /**
   * Every party found (payer included, banks and the tenant's own org excluded), each with its
   * own requisite group, ranked; `recommended` marks the auto-filled one. The UI lists these
   * whenever there are ≥2 so the user can switch without re-uploading.
   */
  options: PayeeOption[];
  /** When needsClarification: 2+; else 0 (resolved payee carried in `payee`). */
  candidates: PayeeCandidate[];
  /** The resolved payee (null when ambiguous or none). */
  payee: PayeeCandidate | null;
  /** Per-field "⚠ de verificat" flags for the resolved payee. */
  lowConfidence: {
    name?: boolean;
    idno?: boolean;
    iban?: boolean;
    bank?: boolean;
    bic?: boolean;
    legalAddress?: boolean;
  };
  amountCents: number | null;
  currency: "MDL" | "EUR" | "USD";
  scope: string | null;
}
