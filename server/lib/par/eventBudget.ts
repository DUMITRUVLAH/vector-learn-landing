/**
 * VM5-20: bugetul unui eveniment — „să vadă linia: cât era planificat și cât s-a cheltuit, la event
 * nu s-a depășit totalul".
 *
 * Modulul e pur: primește liniile planificate și cheltuielile deja convertite în lei, întoarce
 * raportul. Conversia valutară și interogările rămân în rută, ca regula să poată fi verificată fără
 * bază de date și fără rețea.
 *
 * Trei decizii care se văd în cifre:
 *
 * 1. **Realizatul se desface în ANGAJAT și PLĂTIT.** O cerere aprobată dar neplătită a consumat deja
 *    bugetul din punctul de vedere al planificării — dacă am număra doar plățile, evenimentul ar
 *    părea încadrat până în ziua în care ies banii, adică prea târziu ca să mai poți face ceva.
 * 2. **Liniile fără cod bugetar intră în total, dar nu au realizat propriu.** Cererile se leagă de
 *    buget prin codul bugetar; o linie scrisă liber („Catering") nu poate fi confruntată cu ele.
 *    Se arată ca atare, nu cu zero — un zero ar minți.
 * 3. **Ce s-a cheltuit în afara liniilor planificate se arată separat**, nu se ascunde: un eveniment
 *    cu 40.000 lei pe coduri care nu apar în plan e exact situația pe care raportul trebuie s-o
 *    scoată la suprafață.
 */

export interface EventBudgetLineInput {
  id: string;
  budgetCodeId: string | null;
  /** Eticheta liniei: codul bugetar sau textul liber. */
  label: string;
  /** Suma planificată, în moneda liniei. */
  allocatedCents: number;
  currency: string;
  /** Echivalentul în lei al sumei planificate (calculat de apelant, curs BNM). */
  allocatedMdlCents: number;
}

export interface EventSpendInput {
  /** Codul bugetar al cererilor; null = cereri fără cod. */
  budgetCodeId: string | null;
  label: string;
  /** Angajat: cereri depuse/aprobate/la finanțe, în lei. */
  committedMdlCents: number;
  /** Plătit efectiv, în lei. */
  paidMdlCents: number;
}

export interface EventBudgetLineReport {
  id: string | null;
  budgetCodeId: string | null;
  label: string;
  currency: string;
  allocatedCents: number;
  allocatedMdlCents: number;
  committedMdlCents: number;
  paidMdlCents: number;
  /** Planificat − (angajat + plătit). Negativ = depășire. `null` când linia n-are cod bugetar. */
  availableMdlCents: number | null;
  /** Linia e depășită. */
  over: boolean;
  /** Cheltuială pe un cod care nu apare în planul evenimentului. */
  unplanned: boolean;
}

export interface EventBudgetReport {
  lines: EventBudgetLineReport[];
  plannedMdlCents: number;
  committedMdlCents: number;
  paidMdlCents: number;
  /** Planificat − realizat, pe tot evenimentul. Negativ = s-a depășit totalul. */
  availableMdlCents: number;
  /** Evenimentul are buget planificat (măcar o linie cu sumă). */
  hasPlan: boolean;
  /** Totalul evenimentului e depășit — întrebarea din ședință: „la event nu s-a depășit totalul". */
  overTotal: boolean;
}

/** Realizat = ce s-a angajat + ce s-a plătit deja (cele două nu se suprapun: statusuri diferite). */
const actual = (s: { committedMdlCents: number; paidMdlCents: number }) =>
  s.committedMdlCents + s.paidMdlCents;

export function buildEventBudgetReport(
  planned: readonly EventBudgetLineInput[],
  spend: readonly EventSpendInput[]
): EventBudgetReport {
  const spendByCode = new Map<string, EventSpendInput>();
  for (const s of spend) {
    const key = s.budgetCodeId ?? "__fara_cod__";
    const prev = spendByCode.get(key);
    spendByCode.set(key, prev
      ? { ...prev, committedMdlCents: prev.committedMdlCents + s.committedMdlCents, paidMdlCents: prev.paidMdlCents + s.paidMdlCents }
      : { ...s });
  }

  const lines: EventBudgetLineReport[] = planned.map((line) => {
    const match = line.budgetCodeId ? spendByCode.get(line.budgetCodeId) : undefined;
    if (line.budgetCodeId) spendByCode.delete(line.budgetCodeId);
    const committedMdlCents = match?.committedMdlCents ?? 0;
    const paidMdlCents = match?.paidMdlCents ?? 0;
    const availableMdlCents = line.budgetCodeId
      ? line.allocatedMdlCents - committedMdlCents - paidMdlCents
      : null;
    return {
      id: line.id,
      budgetCodeId: line.budgetCodeId,
      label: line.label,
      currency: line.currency,
      allocatedCents: line.allocatedCents,
      allocatedMdlCents: line.allocatedMdlCents,
      committedMdlCents,
      paidMdlCents,
      availableMdlCents,
      over: availableMdlCents != null && availableMdlCents < 0,
      unplanned: false,
    };
  });

  // Ce a mai rămas în cheltuieli, fără linie de plan: se arată, nu se pierde.
  for (const leftover of spendByCode.values()) {
    if (actual(leftover) === 0) continue;
    lines.push({
      id: null,
      budgetCodeId: leftover.budgetCodeId,
      label: leftover.label,
      currency: "MDL",
      allocatedCents: 0,
      allocatedMdlCents: 0,
      committedMdlCents: leftover.committedMdlCents,
      paidMdlCents: leftover.paidMdlCents,
      availableMdlCents: -actual(leftover),
      over: true,
      unplanned: true,
    });
  }

  const plannedMdlCents = planned.reduce((s, l) => s + l.allocatedMdlCents, 0);
  const committedMdlCents = spend.reduce((s, l) => s + l.committedMdlCents, 0);
  const paidMdlCents = spend.reduce((s, l) => s + l.paidMdlCents, 0);

  return {
    lines,
    plannedMdlCents,
    committedMdlCents,
    paidMdlCents,
    availableMdlCents: plannedMdlCents - committedMdlCents - paidMdlCents,
    hasPlan: plannedMdlCents > 0,
    overTotal: plannedMdlCents > 0 && committedMdlCents + paidMdlCents > plannedMdlCents,
  };
}
