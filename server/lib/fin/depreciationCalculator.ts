/**
 * ASSET-002 (FIN): FinDesk — Motor amortizare DETERMINIST
 *
 * Implementează calculul de amortizare pentru active fixe:
 *   - Metoda liniară (linear): cotă fixă per lună = (cost − residual) / durata_luni
 *   - Metoda degresivă (declining_balance): cotă aplicată pe valoarea rămasă,
 *     cu factor accelerat (200% față de liniar) per practică contabilă
 *
 * FIN-CORE §1.12, regula #4: calculul este DETERMINIST — nu AI, nu randomness.
 * Aceeași intrare produce același rezultat în orice context.
 *
 * Toate sumele sunt în CENȚI (integer), fără rotunjiri care pot acumula erori.
 * Ultima lună: ajustare pentru a nu depăși baza amortizabilă (evită over/under depreciation).
 */

import type { FinAsset, FinDepreciationEntry } from "../../db/schema/finAssets";

// Re-export tipuri pentru uz extern
export type {
  FinAsset,
  FinDepreciationEntry,
};

// ─── Input / Output types ─────────────────────────────────────────────────────

export interface DepreciationInput {
  /** Activul fix pentru care se calculează amortizarea. */
  asset: Pick<
    FinAsset,
    | "id"
    | "acquisitionCostCents"
    | "residualValueCents"
    | "usefulLifeMonths"
    | "depreciationMethod"
    | "status"
    | "acquisitionDate"
  >;

  /**
   * Luna perioadei în format YYYY-MM.
   * Ex: "2026-06" = Iunie 2026.
   */
  periodMonth: string;

  /**
   * Valoarea netă (book value) de la FINALUL lunii precedente, în cenți.
   * Dacă e prima lună de amortizare → NULL (se va calcula din acquisitionCostCents).
   */
  previousBookValueCents: number | null;

  /**
   * Numărul lunii de amortizare (1-based).
   * Luna 1 = prima lună după acquisitionDate.
   * Necesară pentru a detecta ultima lună și a ajusta suma.
   */
  depreciationMonthNumber: number;
}

export interface DepreciationResult {
  /** Suma amortizată în această lună, în cenți. */
  depreciationCents: number;

  /**
   * Valoarea netă la finalul acestei luni, în cenți.
   * Nu poate fi mai mică decât residualValueCents.
   */
  bookValueCents: number;

  /**
   * True dacă aceasta este ultima lună de amortizare
   * (bookValueCents == residualValueCents după această înregistrare).
   */
  isFullyDepreciated: boolean;
}

// ─── Calculator ───────────────────────────────────────────────────────────────

/**
 * Calculează amortizarea pentru o lună dată.
 *
 * DETERMINIST: același input produce același output, indiferent de context.
 * Thread-safe: funcție pură (no side effects).
 *
 * @example
 * // Laptop Dell: 12.000 MDL, 36 luni, metoda liniară
 * calculateDepreciation({
 *   asset: { acquisitionCostCents: 1_200_000, residualValueCents: 0, usefulLifeMonths: 36, depreciationMethod: "linear", ... },
 *   periodMonth: "2024-02",
 *   previousBookValueCents: 1_200_000,
 *   depreciationMonthNumber: 1,
 * });
 * // → { depreciationCents: 33_333, bookValueCents: 1_166_667, isFullyDepreciated: false }
 */
export function calculateDepreciation(input: DepreciationInput): DepreciationResult {
  const {
    asset,
    depreciationMonthNumber,
    previousBookValueCents,
  } = input;

  const {
    acquisitionCostCents,
    residualValueCents,
    usefulLifeMonths,
    depreciationMethod,
    status,
  } = asset;

  // Dacă activul e deja amortizat complet → zero depreciere
  if (status === "fully_depreciated" || status === "sold" || status === "scrapped") {
    const bookValue = previousBookValueCents ?? residualValueCents;
    return {
      depreciationCents: 0,
      bookValueCents: Math.max(bookValue, residualValueCents),
      isFullyDepreciated: true,
    };
  }

  // Baza amortizabilă = cost − valoare reziduală
  const depreciableBase = acquisitionCostCents - residualValueCents;

  // Book value de start = cost dacă prima lună, altfel previousBookValueCents
  const startBookValue = previousBookValueCents ?? acquisitionCostCents;

  // Dacă book value deja la nivel rezidual → zero depreciere
  if (startBookValue <= residualValueCents) {
    return {
      depreciationCents: 0,
      bookValueCents: residualValueCents,
      isFullyDepreciated: true,
    };
  }

  let depreciationCents: number;

  if (depreciationMethod === "linear") {
    // Amortizare liniară: cotă fixă per lună
    // Rata lunară = depreciableBase / usefulLifeMonths (integer math, floor)
    const monthlyDepreciation = Math.floor(depreciableBase / usefulLifeMonths);

    // Ultima lună: ajustare pentru a absorbi restul (evita over/under depreciation)
    if (depreciationMonthNumber >= usefulLifeMonths) {
      // Ultima lună: amortizăm tot ce rămâne până la residualValue
      depreciationCents = startBookValue - residualValueCents;
    } else {
      depreciationCents = monthlyDepreciation;
    }
  } else {
    // Amortizare degresivă (declining_balance)
    // Factor standard: 200% față de rata liniară (Double Declining Balance — DDB)
    // Annual rate = min(200% / usefulLifeMonths, 1.0) — exprimat ca fracție [0, 1]
    // Rata liniară anuală = 1 / usefulLifeMonths; degresivă = 2 × liniară
    const annualRate = Math.min(2 / usefulLifeMonths, 1.0);
    // Depreciere lunară = bookValue × annualRate / 12
    const rawMonthly = startBookValue * annualRate / 12;
    depreciationCents = Math.floor(rawMonthly);

    // Nu potem amortiza mai mult decât ce rămâne peste residualValue
    const maxAllowed = startBookValue - residualValueCents;
    depreciationCents = Math.min(depreciationCents, maxAllowed);

    // Ultima lună / dacă am ajuns la residual: amortizăm tot ce rămâne
    if (depreciationMonthNumber >= usefulLifeMonths) {
      depreciationCents = startBookValue - residualValueCents;
    }
  }

  // Validare: depreciation nu poate fi negativă
  depreciationCents = Math.max(0, depreciationCents);

  // Book value după amortizare
  const newBookValue = startBookValue - depreciationCents;

  // Nu coborâm sub residualValue
  const bookValueCents = Math.max(newBookValue, residualValueCents);

  // Ajustăm depreciationCents dacă am limitat bookValue
  const actualDepreciation = startBookValue - bookValueCents;

  const isFullyDepreciated = bookValueCents <= residualValueCents;

  return {
    depreciationCents: actualDepreciation,
    bookValueCents,
    isFullyDepreciated,
  };
}

// ─── Helper: calculate depreciation month number ──────────────────────────────

/**
 * Calculează numărul lunii de amortizare (1-based) față de acquisitionDate.
 *
 * Ex: acquisitionDate = "2024-01-15", periodMonth = "2024-02" → luna 2
 *     acquisitionDate = "2024-01-15", periodMonth = "2024-01" → luna 1
 *
 * Dacă periodMonth < acquisitionDate → returnează 0 (nu se amortizează).
 */
export function getDepreciationMonthNumber(
  acquisitionDate: string, // format DATE ca string YYYY-MM-DD
  periodMonth: string       // format YYYY-MM
): number {
  // Extragem an/lună din acquisitionDate
  const [acqYear, acqMonth] = acquisitionDate.split("-").map(Number);
  const [periodYear, periodMonthNum] = periodMonth.split("-").map(Number);

  if (isNaN(acqYear) || isNaN(acqMonth) || isNaN(periodYear) || isNaN(periodMonthNum)) {
    return 0;
  }

  // Diferența în luni
  const diffMonths = (periodYear - acqYear) * 12 + (periodMonthNum - acqMonth);

  // Luna 1 = prima lună (acquisitionMonth), luna 2 = luna următoare, etc.
  return diffMonths + 1;
}

// ─── Batch calculator: calculează amortizarea pentru un activ pe o perioadă ──

export interface BatchDepreciationInput {
  asset: DepreciationInput["asset"];
  periodMonth: string;
  /** Book value la finalul lunii precedente (din ultima înregistrare sau null dacă prima lună). */
  lastBookValueCents: number | null;
}

/**
 * Calculează amortizarea pentru un activ pentru o lună dată, cu toate datele necesare.
 * Apelat de ruta POST /api/fin/assets/depreciate.
 */
export function calculateAssetDepreciation(
  input: BatchDepreciationInput
): DepreciationResult & { monthNumber: number } {
  const { asset, periodMonth, lastBookValueCents } = input;

  const monthNumber = getDepreciationMonthNumber(
    typeof asset.acquisitionDate === "string"
      ? asset.acquisitionDate
      : new Date(asset.acquisitionDate as unknown as string).toISOString().split("T")[0],
    periodMonth
  );

  if (monthNumber <= 0) {
    // Perioada anterioară punerii în funcțiune — nu se amortizează
    return {
      depreciationCents: 0,
      bookValueCents: lastBookValueCents ?? asset.acquisitionCostCents,
      isFullyDepreciated: false,
      monthNumber,
    };
  }

  const result = calculateDepreciation({
    asset,
    periodMonth,
    previousBookValueCents: lastBookValueCents,
    depreciationMonthNumber: monthNumber,
  });

  return { ...result, monthNumber };
}
