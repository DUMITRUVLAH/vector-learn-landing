// Poziții fracționate pentru drag&drop (patternul Trello).
//
// Alternativa naivă — `sort_order` întreg — cere renumerotarea tuturor cardurilor
// de sub cel mutat, adică N update-uri per drag. Cu poziții în virgulă mobilă,
// inserția între doi vecini e media pozițiilor lor: UN singur UPDATE, indiferent
// cât de lungă e coloana.

export const POSITION_STEP = 1024;

/** Poziția unui element inserat între `prev` și `next` (oricare poate lipsi). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return (next as number) / 2;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** Poziția pentru adăugarea la coada unei liste. */
export function positionAtEnd(positions: number[]): number {
  return positions.reduce((max, p) => Math.max(max, p), 0) + POSITION_STEP;
}

/**
 * Poziția pentru adăugarea în CAPUL unei liste.
 *
 * Simetricul lui `positionAtEnd`. Un task nou adăugat dintr-o coloană ajungea la
 * coadă (`position: 0` ⇒ triggerul din DB pune `MAX + 1024`), deci pe o coloană
 * lungă dispărea sub fold exact în clipa în care îl scriai.
 *
 * ⚠️ Înjumătățirea repetată consumă mantisa (vezi `needsRebalance` și CLAUDE.md
 * #45): după destule adăugări în cap, media nu se mai distinge de capăt. Cine
 * folosește funcția trebuie să verifice `needsRenumberAtStart` și să renumeroteze
 * lista, ca la mutări.
 */
export function positionAtStart(positions: number[]): number {
  if (positions.length === 0) return POSITION_STEP;
  const min = positions.reduce((m, p) => Math.min(m, p), Infinity);
  return min / 2;
}

/**
 * Poziția cu care se naște un task nou: în CAPUL coloanei.
 *
 * Un singur loc pentru regula asta, fiindcă are două suprafețe — composerul din
 * coloană și butonul „+ Adaugă task" din antetul boardului — iar un task care
 * apare sus într-una și jos în cealaltă e exact genul de incoerență pe care o
 * reclamă utilizatorul, nu testele.
 *
 * `0` înseamnă „calculează tu" (trigger-ul din DB pune `MAX + 1024`): e ieșirea
 * pentru cazul în care capul listei și-a epuizat precizia (vezi
 * `needsRenumberAtStart`) — o ordine degradată e mai bună decât două carduri cu
 * aceeași poziție, unde ordinea devine arbitrară.
 */
export function positionForNewTask(positions: number[]): number {
  return needsRenumberAtStart(positions) ? 0 : positionAtStart(positions);
}

/** `true` când capul listei nu mai are loc pentru încă o inserție distinctă. */
export function needsRenumberAtStart(positions: number[]): boolean {
  if (positions.length === 0) return false;
  const min = positions.reduce((m, p) => Math.min(m, p), Infinity);
  const mijloc = min / 2;
  return !(mijloc > 0) || mijloc >= min;
}

/**
 * Poziția rezultată din mutarea unui card peste `targetIndex` într-o coloană.
 * `positions` = pozițiile cardurilor din coloana ȚINTĂ, deja sortate crescător,
 * FĂRĂ cardul mutat. `targetIndex` = câte carduri rămân deasupra lui.
 */
export function positionForDrop(positions: number[], targetIndex: number): number {
  const prev = targetIndex > 0 ? positions[targetIndex - 1] ?? null : null;
  const next = targetIndex < positions.length ? positions[targetIndex] ?? null : null;
  return positionBetween(prev, next);
}

/**
 * Pozițiile fracționate se pot apropia atât de mult încât media a doi vecini să
 * fie egală cu unul dintre ei (precizia double se epuizează după ~50 de inserții
 * în același interval). Când se întâmplă, coloana trebuie renumerotată.
 */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false;
  const mid = (prev + next) / 2;
  return mid === prev || mid === next;
}

/** Pozițiile curate pentru o renumerotare completă a unei coloane. */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}
