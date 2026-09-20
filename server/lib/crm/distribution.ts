/**
 * CRM — CUM se împarte un lot între agenți, când împărțirea o face sistemul, nu omul.
 *
 * Partea PURĂ a repartizării automate: primește câți agenți, cu ce setări, și câte contacte sunt
 * de dat — întoarce câte primește fiecare. Fără bază de date, deci testabilă direct.
 *
 * De ce „automat" înseamnă aici patru lucruri diferite, și nu unul singur: un manager de
 * call-center nu vrea mereu același lucru.
 *  - **Pe rând (round-robin)** — împărțire egală. E ce înțelege oricine prin „împarte-le".
 *  - **După capacitate** — fiecare primește cât îi mai încape azi (norma zilnică din setările
 *    lui). Cine e plin nu mai primește, iar restul RĂMÂN în rezervă, nu se îndeasă peste normă:
 *    altfel capacitatea ar fi o setare decorativă.
 *  - **Ponderat** — cine are greutate 2 primește dublu față de cine are 1. Pentru echipe mixte
 *    (seniori / juniori, part-time).
 *  - **După reguli** — motorul existent (`selectAssignee`), cu teritoriile și condițiile scrise
 *    în ecranul de automatizări. Singurul care se uită la CE e leadul, nu doar la cine e liber.
 *
 * Împărțirea se face „dând câte un contact pe rând", nu calculând procente: la 7 contacte și 2
 * agenți, procentele dau 3,5 fiecare, iar rotunjirea ar pierde sau ar inventa un contact. Dealul
 * ciclic dă 4 și 3, iar suma e exact 7 — întotdeauna.
 */

export const AUTO_STRATEGIES = ["round_robin", "capacity", "weighted", "rules"] as const;
export type AutoStrategy = (typeof AUTO_STRATEGIES)[number];

export const AUTO_STRATEGY_LABELS: Record<AutoStrategy, string> = {
  round_robin: "Egal, pe rând",
  capacity: "Cât îi mai încape fiecăruia azi",
  weighted: "Ponderat (după greutatea agentului)",
  rules: "După regulile de distribuire",
};

export interface AutoMember {
  userId: string;
  name: string;
  /** Greutatea din setările de vânzări; 1 = normal. */
  weight: number;
  /** Cât mai poate primi AZI. `null` = nelimitat (norma zilnică e 0 în setări). */
  remainingCapacity: number | null;
  /** Ordinea stabilă de deal — cine primește primul restul de la împărțire. */
  orderIndex: number;
}

/** Ordine stabilă: două rulări pe aceleași date trebuie să dea exact același rezultat. */
function stable(members: AutoMember[]): AutoMember[] {
  return [...members].sort((a, b) => a.orderIndex - b.orderIndex || a.userId.localeCompare(b.userId));
}

/**
 * Câte contacte primește fiecare. Suma NU depășește niciodată `total`, iar ce nu s-a putut da
 * (la „după capacitate", când toți s-au umplut) se vede ca diferență — apelantul o raportează ca
 * lipsă, nu o ascunde.
 */
export function splitCounts(
  total: number,
  members: AutoMember[],
  strategy: Exclude<AutoStrategy, "rules">
): Map<string, number> {
  const out = new Map<string, number>();
  const list = stable(members);
  if (total <= 0 || list.length === 0) return out;
  for (const m of list) out.set(m.userId, 0);

  if (strategy === "capacity") {
    // Deal ciclic, sărind peste cine și-a atins norma. Se oprește când nimeni nu mai are loc —
    // contactele rămase stau în rezervă, unde se văd, nu peste norma cuiva, unde nu se văd.
    let given = 0;
    let progress = true;
    while (given < total && progress) {
      progress = false;
      for (const m of list) {
        if (given >= total) break;
        const cap = m.remainingCapacity;
        const has = out.get(m.userId) ?? 0;
        if (cap !== null && has >= Math.max(0, cap)) continue;
        out.set(m.userId, has + 1);
        given++;
        progress = true;
      }
    }
    return out;
  }

  if (strategy === "weighted") {
    // Greutatea 0 sau negativă înseamnă „nu participă" — altfel ar primi contacte cineva pe care
    // omul tocmai l-a scos din tragere.
    const eligible = list.filter((m) => m.weight > 0);
    if (eligible.length === 0) return out;
    const totalWeight = eligible.reduce((s, m) => s + m.weight, 0);
    let given = 0;
    // Deal proporțional prin „cel mai mare deficit": la fiecare pas primește cine e cel mai
    // departe de cota lui. Suma iese exact, fără rotunjiri pierdute.
    while (given < total) {
      let best = eligible[0];
      let bestGap = -Infinity;
      for (const m of eligible) {
        const quota = ((given + 1) * m.weight) / totalWeight;
        const gap = quota - (out.get(m.userId) ?? 0);
        if (gap > bestGap + 1e-9) {
          bestGap = gap;
          best = m;
        }
      }
      out.set(best.userId, (out.get(best.userId) ?? 0) + 1);
      given++;
    }
    return out;
  }

  // round_robin: câte unul pe rând, în ordine stabilă. Restul de la împărțire merge la primii.
  let given = 0;
  while (given < total) {
    for (const m of list) {
      if (given >= total) break;
      out.set(m.userId, (out.get(m.userId) ?? 0) + 1);
      given++;
    }
  }
  return out;
}
