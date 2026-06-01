/**
 * SCHOOL-004 — Funcții pure pentru calculul taxei școlare
 */

/**
 * Calculează reducerea pentru frați (în procente).
 * Primul copil: 0%.
 * Al doilea: basePercent%.
 * Al treilea și mai mult: basePercent * 2%.
 */
export function siblingDiscount(siblingRank: number, basePercent: number): number {
  if (siblingRank <= 1) return 0;
  if (siblingRank === 2) return basePercent;
  return basePercent * 2;
}

/**
 * Calculează suma efectivă după aplicarea tuturor reducerilor.
 * Ordinea: aplicăm mai întâi procentele (frați + bursă%), apoi suma fixă bursă.
 * Rezultatul nu poate fi < 0.
 */
export function effectiveAmount(params: {
  amountCents: number;
  siblingRank: number;
  siblingDiscountPercent: number;
  scholarshipAmountCents: number;
  scholarshipPercent: number;
}): number {
  const {
    amountCents,
    siblingRank,
    siblingDiscountPercent,
    scholarshipAmountCents,
    scholarshipPercent,
  } = params;

  const sibDisc = siblingDiscount(siblingRank, siblingDiscountPercent);
  const totalPercentDiscount = sibDisc + scholarshipPercent;

  // Aplicăm procentul total
  const afterPercent = Math.round(amountCents * (1 - totalPercentDiscount / 100));
  // Scădem bursa fixă
  const net = afterPercent - scholarshipAmountCents;

  return Math.max(0, net);
}

/**
 * Împarte suma în N rate egale.
 * Ultima rată preia diferența din rotunjire.
 */
export function installmentSchedule(
  netAmountCents: number,
  count: number
): number[] {
  if (count <= 0) return [];
  const base = Math.floor(netAmountCents / count);
  const remainder = netAmountCents - base * count;
  const result = Array(count).fill(base) as number[];
  // Ultima rată absoarbe restul (poate fi cu ±1 cenți față de celelalte)
  result[count - 1] += remainder;
  return result;
}
