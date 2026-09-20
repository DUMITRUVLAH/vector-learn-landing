/**
 * CRM — REZULTATUL unui apel, cu vocabular închis.
 *
 * Până acum, rezultatul stătea în `lead_interactions.metadata` ca text liber, iar raportul căuta
 * literalul `outcome === "answered"`. Interfața nu scria niciodată nimic acolo (butonul „Notează
 * apel" trimitea doar tipul), deci indicatorul „contacte reușite" era 0 la toată lumea, mereu.
 *
 * Într-un call-center B2B, diferența dintre „nu răspunde", „a răspuns secretara" și „am vorbit cu
 * decidentul" ESTE raportul: fără ea nu se poate afla nici contactabilitatea unei liste
 * cumpărate, nici câte apeluri costă un decident, nici când trebuie oprit sunatul.
 *
 * De ce un set închis și nu text liber: „nu răspunde", „nu raspunde", „N/A" și „nu a răspuns" ar
 * fi patru rezultate diferite în orice raport. Setul rămâne mic înadins — fiecare rezultat în
 * plus e un buton în plus pe care agentul trebuie să-l aleagă la fiecare apel.
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

export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && (CALL_OUTCOMES as readonly string[]).includes(value);
}

/** Cineva a ridicat telefonul — indiferent cine și cu ce rezultat. */
const CONNECTED: ReadonlySet<CallOutcome> = new Set<CallOutcome>([
  "answered",
  "gatekeeper",
  "callback",
  "not_interested",
  "refused",
]);

/** S-a ajuns la omul care decide. Ăsta e numitorul real al unei operațiuni de outreach. */
const DECISION_MAKER: ReadonlySet<CallOutcome> = new Set<CallOutcome>(["answered"]);

/**
 * Rezultate care NU justifică o nouă încercare pe același număr: firma a spus nu, sau numărul e
 * greșit. Contorul de încercări nu le numără — altfel „5 încercări, renunțăm" s-ar consuma pe un
 * număr greșit, iar firma ar rămâne nesunată cu adevărat.
 */
const TERMINAL: ReadonlySet<CallOutcome> = new Set<CallOutcome>(["wrong_number", "refused"]);

export function isConnected(outcome: CallOutcome): boolean {
  return CONNECTED.has(outcome);
}

export function isDecisionMakerReached(outcome: CallOutcome): boolean {
  return DECISION_MAKER.has(outcome);
}

export function isTerminalOutcome(outcome: CallOutcome): boolean {
  return TERMINAL.has(outcome);
}

export interface CallFunnel {
  /** Câte apeluri s-au dat. */
  dialed: number;
  /** La câte a răspuns cineva. */
  connected: number;
  /** La câte s-a ajuns la decident. */
  decisionMakers: number;
  /** Câte firme DISTINCTE au fost sunate — o listă se măsoară în firme, nu în apeluri. */
  leadsTouched: number;
  /** Câte apeluri până la un decident, în medie. `null` când încă nu există niciunul. */
  callsPerDecisionMaker: number | null;
  /** Repartiția pe rezultat, pentru tabel. */
  byOutcome: { outcome: CallOutcome; label: string; count: number; pct: number }[];
  /** Apelurile fără rezultat notat — se spun pe față, nu se împart tăcut între celelalte. */
  unknown: number;
}

export interface CallRecord {
  leadId: string;
  outcome: string | null;
}

/**
 * Contactabilitatea: apeluri → răspunsuri → decidenți.
 *
 * Apelurile FĂRĂ rezultat notat (cele vechi, de dinainte de vocabular) se numără separat, la
 * `unknown`. Nu le punem la „nu răspunde": ar însemna să inventăm un eșec, iar rata de
 * contactabilitate a listelor vechi ar părea mai proastă decât a fost.
 */
export function callFunnel(calls: CallRecord[]): CallFunnel {
  const counts = new Map<CallOutcome, number>();
  const leads = new Set<string>();
  let connected = 0;
  let decisionMakers = 0;
  let unknown = 0;

  for (const call of calls) {
    leads.add(call.leadId);
    if (!isCallOutcome(call.outcome)) {
      unknown++;
      continue;
    }
    counts.set(call.outcome, (counts.get(call.outcome) ?? 0) + 1);
    if (isConnected(call.outcome)) connected++;
    if (isDecisionMakerReached(call.outcome)) decisionMakers++;
  }

  const dialed = calls.length;
  return {
    dialed,
    connected,
    decisionMakers,
    leadsTouched: leads.size,
    callsPerDecisionMaker: decisionMakers === 0 ? null : Math.round((dialed / decisionMakers) * 10) / 10,
    byOutcome: CALL_OUTCOMES.map((outcome) => {
      const count = counts.get(outcome) ?? 0;
      return {
        outcome,
        label: CALL_OUTCOME_LABELS[outcome],
        count,
        pct: dialed === 0 ? 0 : Math.round((count / dialed) * 100),
      };
    }).filter((r) => r.count > 0),
    unknown,
  };
}
