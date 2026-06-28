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
  /** Bank name if printed for this party. */
  bank?: string | null;
  /** SWIFT/BIC if printed. */
  bic?: string | null;
  /** "Cod TVA"/VAT — captured ONLY to keep it OUT of idno; never used as id. */
  vatCode?: string | null;
  /** true if the doc labels this party with an explicit PAYER word (Plătitor/Ordonator/Заказчик/Bill To). */
  isPayerHint?: boolean;
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
  isStub: boolean;
}

// ─── choosePayee result contract ──────────────────────────────────────────────

export interface PayeeCandidate {
  name: string;
  idno: string | null;
  /** Only set if valid (MD mod-97) OR valid foreign (flagged via ibanForeign). */
  iban: string | null;
  /** true if non-MD but ISO-13616 valid → UI shows "verificați (IBAN non-MD)". */
  ibanForeign?: boolean;
  bank: string | null;
  payeeType: "fizic" | "juridic" | null;
}

export interface ChoosePayeeResult {
  needsClarification: boolean;
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
  };
  amountCents: number | null;
  currency: "MDL" | "EUR" | "USD";
  scope: string | null;
}
