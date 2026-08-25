/**
 * PAR money bounds — every *_cents column in server/db/schema/par.ts is a Postgres `integer`,
 * so any value above 2^31-1 does not fail validation: it reaches the INSERT and dies with
 * `value "…" is out of range for type integer` → a 500 on a plain typo (an extra zero in a
 * unit price). Bounds are enforced here, in one place, and returned as a 400 the form can show.
 *
 * CORE §2: "Money in integer minor units (*_cents)". 2_147_483_647 cents = 21_474_836.47 MDL,
 * far above any single donor-funded request, so the ceiling never blocks legitimate work.
 */
export const MAX_MONEY_CENTS = 2_147_483_647;

/** Largest quantity that can appear on a line item (guards the qty × price product too). */
export const MAX_LINE_QUANTITY = 1_000_000;

export function exceedsMoneyBound(cents: number): boolean {
  return !Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS || cents < -MAX_MONEY_CENTS;
}

/** Human-readable 400 payload for an amount that would overflow the column. */
export function moneyBoundError(field: string) {
  return {
    error: "amount_too_large",
    field,
    max_cents: MAX_MONEY_CENTS,
    message: `${field}: suma depășește maximul acceptat (${(MAX_MONEY_CENTS / 100).toLocaleString("ro-MD")} unități monetare).`,
  };
}
