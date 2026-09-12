/**
 * VM5-16: „Flow-ul per PAR ex.: respinsă, revizuite, aprobat."
 *
 * Chip-ul de status spune unde e cererea ACUM. Întrebarea din ședință e alta: pe unde a trecut și
 * a câta rundă e. Un PAR respins, revizuit și aprobat arată pe ecran exact ca unul aprobat din
 * prima — iar diferența contează, mai ales la audit.
 *
 * Modulul e pur: primește jurnalul (par_audit, deja adus de fișă pentru ParTimeline) și întoarce
 * etapele. Nicio interogare nouă și niciun al doilea adevăr despre același traseu.
 */

export interface FlowEventInput {
  event: string;
  created_at: string;
}

export interface FlowStep {
  key: string;
  label: string;
  at: string;
  tone: "done" | "warn" | "bad";
}

/** Ce evenimente din jurnal sunt ETAPE ale cererii (restul sunt detalii: editări, analize, vizite). */
const MILESTONES: Record<string, { label: string; tone: FlowStep["tone"] }> = {
  created: { label: "Creată", tone: "done" },
  submitted: { label: "Depusă", tone: "done" },
  approved: { label: "Aprobată", tone: "done" },
  rejected: { label: "Respinsă", tone: "bad" },
  changes_requested: { label: "Modificări cerute", tone: "warn" },
  reopened: { label: "Revizuită", tone: "warn" },
  withdrawn: { label: "Retrasă pentru corectură", tone: "warn" },
  finance_returned: { label: "Întoarsă de finanțe", tone: "warn" },
  paid: { label: "Plătită", tone: "done" },
  payment_reverted: { label: "Plată anulată", tone: "bad" },
  cancelled: { label: "Anulată", tone: "bad" },
};

/**
 * Etapele cererii, în ordine cronologică.
 *
 * Evenimentele repetate rămân toate: „depusă → respinsă → depusă → aprobată" e chiar povestea pe
 * care o căutăm. Doar două „depuse" la rând, fără nimic între ele, ar fi zgomot — dar asta nu se
 * poate întâmpla, fiindcă o a doua depunere cere o revizuire între.
 */
export function buildFlowSteps(events: readonly FlowEventInput[]): FlowStep[] {
  return [...events]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .filter((e) => MILESTONES[e.event])
    .map((e, i) => ({
      key: `${e.event}-${i}`,
      label: MILESTONES[e.event].label,
      at: e.created_at,
      tone: MILESTONES[e.event].tone,
    }));
}

/**
 * A câta rundă e cererea. Runda crește la fiecare întoarcere la autor: respingere reluată,
 * retragere pentru corectură, întoarcere de la finanțe.
 *
 * `1` = prima încercare, deci nu se afișează nimic. `2+` → eticheta „revizuită (vN)".
 */
export function revisionRound(events: readonly FlowEventInput[]): number {
  const restarts = events.filter(
    (e) => e.event === "reopened" || e.event === "withdrawn" || e.event === "finance_returned"
  ).length;
  return restarts + 1;
}

/** Eticheta de rundă, sau `null` la prima încercare. */
export function revisionLabel(events: readonly FlowEventInput[]): string | null {
  const round = revisionRound(events);
  return round > 1 ? `revizuită (v${round})` : null;
}
