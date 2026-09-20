/**
 * CRM — vocabularul rezultatelor de apel, partea de interfață.
 *
 * Duplicat DELIBERAT al listei din `server/lib/crm/callOutcomes.ts` (aceleași chei, aceleași
 * etichete): ecranul trebuie să poată desena selectul fără o cerere în plus, iar serverul
 * validează oricum ce primește. Regula repo-ului rămâne — în `lib/api/` doar ce vorbește cu
 * serverul, deci constantele pure stau aici, unde nu obligă fiecare test de CRM să le cunoască.
 *
 * Dacă adaugi un rezultat, adaugă-l în AMBELE locuri: serverul respinge o cheie pe care n-o
 * cunoaște, deci un select desincronizat s-ar vedea imediat, nu tăcut.
 */
export const CALL_OUTCOMES = [
  "answered",
  "gatekeeper",
  "callback",
  "no_answer",
  "busy",
  "wrong_number",
  "not_interested",
  "refused",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  answered: "Am vorbit cu decidentul",
  gatekeeper: "A răspuns secretara / filtrul",
  callback: "Cere revenire",
  no_answer: "Nu răspunde",
  busy: "Ocupat",
  wrong_number: "Număr greșit",
  not_interested: "Nu e interesat acum",
  refused: "Refuz ferm",
};
