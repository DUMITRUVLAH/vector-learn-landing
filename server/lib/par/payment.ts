/**
 * PAR-113: 10% overage rule — pure, testable integer-math function.
 *
 * CORE §3 (printed on the form):
 *   "For transactions above micro-purchase threshold, if final price for purchase
 *    exceeds total estimated cost by more than 10%, purchase shall not proceed
 *    without approval from approver below."
 *
 * Implementation:
 *   needsReapproval = (actual > total * 110 / 100) AND (total > threshold)
 *
 * Integer arithmetic only — no floats. Multiply first, divide last.
 * The threshold comparison is "strictly above" (> not >=).
 */

export interface TenRuleInput {
  /** Actual amount the vendor is being paid (minor units, e.g. cents/bani) */
  actualAmountCents: number;
  /** Total estimated cost from section 10 line items (minor units) */
  totalEstimatedCents: number;
  /** Micro-purchase threshold from par_settings (minor units) */
  microPurchaseThresholdCents: number;
}

export interface TenRuleResult {
  /** true → PAR must be re-approved before payment */
  needsReapproval: boolean;
  /** true if the micro-purchase threshold check is satisfied (total > threshold) */
  aboveThreshold: boolean;
  /** true if actual amount exceeds estimated + 10% */
  overageDetected: boolean;
  /** The maximum allowed actual without triggering reapproval (inclusive): total * 110 / 100 */
  maxAllowedCents: number;
}

/**
 * Apply the 10% overage rule to determine if re-approval is required.
 *
 * Boundary examples (total = 700_000, threshold = 500_000):
 *   actual = 770_000  → 770_000 * 100 = 77_000_000 vs 700_000 * 110 = 77_000_000 → exactly +10% → NOT reapproval (≤ not >)
 *   actual = 770_001  → 770_001 * 100 = 77_000_100 > 77_000_000 → reapproval_required
 *   actual = 769_999  → 769_999 * 100 = 76_999_900 ≤ 77_000_000 → paid
 *   actual = 800_000, total = 700_000 (> threshold) → 800_000 * 100 = 80_000_000 > 77_000_000 → reapproval
 *   actual = 800_000, total = 300_000 (≤ threshold) → threshold not exceeded → paid
 */
export function applyTenRule(input: TenRuleInput): TenRuleResult {
  const { actualAmountCents, totalEstimatedCents, microPurchaseThresholdCents } = input;

  // Compute max allowed using integer arithmetic:
  //   maxAllowed = floor(totalEstimatedCents * 110 / 100)
  // Multiply first, then integer-divide to avoid float drift.
  const maxAllowedCents = Math.floor((totalEstimatedCents * 110) / 100);

  const overageDetected = actualAmountCents > maxAllowedCents;
  const aboveThreshold = totalEstimatedCents > microPurchaseThresholdCents;

  // needsReapproval: BOTH conditions must hold simultaneously
  const needsReapproval = overageDetected && aboveThreshold;

  return { needsReapproval, aboveThreshold, overageDetected, maxAllowedCents };
}
