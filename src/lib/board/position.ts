/**
 * TB-001: Poziționare fracționată stil Trello.
 * Reordonarea între doi vecini = media pozițiilor lor (un singur UPDATE).
 * Când golul se epuizează (sub MIN_GAP), serverul renumerotează lista (gardă în /move).
 */

export const POSITION_STEP = 1024;
export const MIN_GAP = 0.0001;

/** Poziția unui element plasat între doi vecini (oricare poate lipsi). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return (next as number) / 2;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** Poziția pentru un element adăugat la finalul unei mulțimi. */
export function positionAtEnd(positions: number[]): number {
  return positions.reduce((m, p) => Math.max(m, p), 0) + POSITION_STEP;
}

/** True dacă vreo pereche adiacentă (sortată) are golul sub MIN_GAP → trebuie renumerotare. */
export function needsRebalance(positions: number[]): boolean {
  const sorted = [...positions].sort((a, b) => a - b);
  return sorted.some((p, i) => i > 0 && p - sorted[i - 1] < MIN_GAP);
}
