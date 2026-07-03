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
  /** true if a non-MD but ISO-13616-valid IBAN → UI shows "verificați (IBAN non-MD)". */
  ibanForeign?: boolean;
  bank: string | null;
  payeeType: "fizic" | "juridic" | null;
}
