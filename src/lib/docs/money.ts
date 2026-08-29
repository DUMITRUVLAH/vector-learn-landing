/**
 * Citirea sumelor scrise de om, în formatul folosit la noi.
 *
 * De ce are nevoie de un modul propriu: prima variantă făcea `replace(",", ".")` și atât. Pe un act
 * redeschis, prețul era deja formatat românește — „2.000,00" — iar parserul îl citea ca 2 lei.
 * Adică: deschideai un act salvat, îl salvai din nou și prețul se împărțea la o mie. Sweep-ul UX
 * l-a prins pe capturi: preț „2.000,00", sumă „2,00".
 *
 * Reguli (în ordinea în care decid):
 *  1. dacă apar ȘI punct ȘI virgulă → punctele sunt separatori de mii, virgula e zecimala („1.234,56");
 *  2. dacă apare doar virgulă → e zecimala („1234,56");
 *  3. dacă apar doar puncte în tipar de mii („2.000", „1.234.567") → sunt separatori de mii;
 *  4. altfel punctul e zecimala („1234.56") — formatul tastat de cei obișnuiți cu engleza.
 */
export function parseMoneyRo(text: string): number {
  const raw = (text ?? "").replace(/[\s ]/g, "");
  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let normalized = raw;
  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Afișarea, perechea lui `parseMoneyRo`: 2450000 → „24.500,00". */
export function formatMoneyRo(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
