/**
 * CX-705 — Break-even / projected profit calculation (client-side copy)
 *
 * Pure function, no server dependencies. Shared via this module
 * so client tests can import it under the @/* alias.
 *
 * Formula (ported from copy-roas useProfitability / EditionContent):
 *   projectedProfit = incasat + (expected - incasat) * 0.5 - totalCosts
 */

export interface BreakevenInput {
  /** Amount already collected from full/half payers (cents) */
  incasatCents: number;
  /**
   * Total expected amount including pending participants (cents).
   * Expected = Σ(full) + Σ(half×2) + Σ(pending)
   */
  expectedCents: number;
  /** Mentor cost from cohorts.mentorCostCents (cents) */
  mentorCostCents: number;
  /** Room rental cost from cohorts.roomCostCents (cents) */
  roomCostCents: number;
  /** Optional: marketing spend (cents). Defaults to 0. */
  marketingCostCents?: number;
  /**
   * Optional: allocated fixed cost portion (cents).
   * Defaults to 0 until fixed-cost module is built.
   */
  allocatedFixedCostCents?: number;
}

export interface BreakevenResult {
  /** Total costs: mentor + room + marketing + fixed */
  totalCostCents: number;
  /** Amount already paid (incasat) */
  revenueCents: number;
  /**
   * Projected profit: incasat + (expected - incasat) * 0.5 - totalCosts
   * Positive = profit; negative = still below break-even
   */
  projectedProfitCents: number;
  /** Distance to break-even: abs(projectedProfit) when negative */
  breakEvenDistanceCents: number;
  /** true when projectedProfit >= 0 */
  isProfit: boolean;
}

/**
 * Pure function — no side effects, no DB access.
 * Can be called from any context (server, client, tests).
 */
export function computeCohortBreakeven(input: BreakevenInput): BreakevenResult {
  const {
    incasatCents,
    expectedCents,
    mentorCostCents,
    roomCostCents,
    marketingCostCents = 0,
    allocatedFixedCostCents = 0,
  } = input;

  const totalCostCents =
    mentorCostCents + roomCostCents + marketingCostCents + allocatedFixedCostCents;

  // Projected profit formula from copy-roas EditionContent
  const projectedProfitCents =
    incasatCents + (expectedCents - incasatCents) * 0.5 - totalCostCents;

  const isProfit = projectedProfitCents >= 0;
  const breakEvenDistanceCents = isProfit ? 0 : Math.abs(projectedProfitCents);

  return {
    totalCostCents,
    revenueCents: incasatCents,
    projectedProfitCents,
    breakEvenDistanceCents,
    isProfit,
  };
}
