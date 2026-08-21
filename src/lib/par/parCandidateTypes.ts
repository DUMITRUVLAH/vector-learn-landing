/**
 * Client mirror of the PAR payee-candidate shape (two-copies rule — the frontend must not
 * import server code). Keep in sync with server/lib/par/parPartyTypes.ts (PayeeCandidate)
 * and the route's ParPrefillCandidate (server/routes/parAiPrefill.ts).
 *
 * Consumed by ParCreateForm.tsx for the "Care companie e beneficiarul plății?" chooser.
 */

export interface ParPayeeCandidate {
  name: string;
  idno: string | null;
  iban: string | null;
  /** every valid account of this party — present only when the document listed 2+ */
  ibans?: string[];
  /** true if a non-MD but ISO-13616-valid IBAN → UI shows "verificați (IBAN non-MD)". */
  ibanForeign?: boolean;
  bank: string | null;
  bic?: string | null;
  legalAddress?: string | null;
  administratorName?: string | null;
  payeeType: "fizic" | "juridic" | null;
}

/**
 * A candidate plus the context the group chooser needs: which role the document gave the party,
 * whether the server auto-filled it, and whether it is the payer (never auto-filled).
 */
export interface ParPayeeOption extends ParPayeeCandidate {
  role: string;
  recommended: boolean;
  isPayer: boolean;
}
