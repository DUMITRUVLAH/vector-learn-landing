/**
 * MULTICURRENCY-002: FX revaluation service
 *
 * Compares the BNM end-of-month rate against the rate at which each foreign-
 * currency payment was booked and posts the gain/loss to fin_ledger_entries.
 *
 * Idempotent: re-running for the same (tenantId, periodMonth) replaces/updates
 * existing fx_revaluation entries for that period (delete+insert pattern).
 */
import { and, eq, gte, lt, lte, ne, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { finExchangeRates } from "../../db/schema/finExchangeRates";
import { finLedgerEntries } from "../../db/schema/finLedger";
import { payments } from "../../db/schema/payments";

export interface RevaluationResult {
  period_month: string;
  entries_created: number;
  total_fx_gain_loss_mdl_cents: number;
  pairs: Array<{
    currency_from: string;
    currency_to: string;
    fx_gain_loss_cents: number;
    entries: number;
  }>;
}

/**
 * Run FX revaluation for a given month and post results to fin_ledger_entries.
 *
 * @param tenantId   - tenant UUID
 * @param periodMonth - first day of the month (e.g. new Date("2026-05-01"))
 * @param userId      - user who triggered the revaluation
 */
export async function revaluateMonth(
  tenantId: string,
  periodMonth: Date,
  userId: string
): Promise<RevaluationResult> {
  const periodIso = toISODate(periodMonth);

  // Last day of the month
  const lastDay = getLastDayOfMonth(periodMonth);
  const lastDayIso = toISODate(lastDay);

  // Next month first day (for range filter on payments.created_at)
  const nextMonth = new Date(periodMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  // ── 1. Delete existing fx_revaluation entries for this period (idempotency) ─
  await db
    .delete(finLedgerEntries)
    .where(
      and(
        eq(finLedgerEntries.tenantId, tenantId),
        eq(finLedgerEntries.entryType, "fx_revaluation"),
        eq(finLedgerEntries.periodMonth, periodIso)
      )
    );

  // ── 2. Get all foreign-currency payments in this month ────────────────────────
  const foreignPayments = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        ne(payments.currency, "MDL"),
        gte(payments.createdAt, periodMonth),
        lt(payments.createdAt, nextMonth)
      )
    );

  if (foreignPayments.length === 0) {
    return {
      period_month: periodIso,
      entries_created: 0,
      total_fx_gain_loss_mdl_cents: 0,
      pairs: [],
    };
  }

  // ── 3. Group payments by currency pair ────────────────────────────────────────
  const byCurrency: Map<
    string,
    { totalAmountCents: number; currency: string }
  > = new Map();

  for (const p of foreignPayments) {
    const key = `${p.currency}-MDL`;
    const existing = byCurrency.get(key) ?? { totalAmountCents: 0, currency: p.currency };
    existing.totalAmountCents += p.amountCents;
    byCurrency.set(key, existing);
  }

  // ── 4. Get end-of-month BNM rates ────────────────────────────────────────────
  const pairsResult: RevaluationResult["pairs"] = [];
  let totalGainLoss = 0;
  let entriesCreated = 0;

  for (const [_key, { totalAmountCents, currency }] of byCurrency) {
    // Find the BNM rate on or before the last day of the month
    const [eomRate] = await db
      .select()
      .from(finExchangeRates)
      .where(
        and(
          eq(finExchangeRates.tenantId, tenantId),
          eq(finExchangeRates.currencyFrom, currency),
          eq(finExchangeRates.currencyTo, "MDL"),
          lte(finExchangeRates.rateDate, lastDayIso)
        )
      )
      .orderBy(desc(finExchangeRates.rateDate))
      .limit(1);

    if (!eomRate) {
      // No BNM rate available for this currency pair — skip
      continue;
    }

    // Get the booking rate: first available rate in the month (simplified model)
    const [bookingRate] = await db
      .select()
      .from(finExchangeRates)
      .where(
        and(
          eq(finExchangeRates.tenantId, tenantId),
          eq(finExchangeRates.currencyFrom, currency),
          eq(finExchangeRates.currencyTo, "MDL"),
          gte(finExchangeRates.rateDate, periodIso),
          lte(finExchangeRates.rateDate, lastDayIso)
        )
      )
      .orderBy(finExchangeRates.rateDate)
      .limit(1);

    const bookingRateValue = bookingRate
      ? parseFloat(String(bookingRate.rate))
      : parseFloat(String(eomRate.rate)); // fallback: use eom rate (0 diff)

    const eomRateValue = parseFloat(String(eomRate.rate));

    // FX gain/loss = amount * (eomRate - bookingRate)
    const fxGainLossCents = Math.round(
      totalAmountCents * (eomRateValue - bookingRateValue)
    );

    // Post ledger entry
    await db.insert(finLedgerEntries).values({
      tenantId,
      entryType: "fx_revaluation",
      currencyFrom: currency,
      currencyTo: "MDL",
      amountCents: totalAmountCents,
      rateUsed: String(eomRateValue),
      fxGainLossCents,
      periodMonth: periodIso,
      postedBy: userId,
      note: `BNM revaluation ${periodIso}: ${currency}/MDL @ ${eomRateValue} (booking @ ${bookingRateValue})`,
    });

    pairsResult.push({
      currency_from: currency,
      currency_to: "MDL",
      fx_gain_loss_cents: fxGainLossCents,
      entries: 1,
    });

    totalGainLoss += fxGainLossCents;
    entriesCreated++;
  }

  return {
    period_month: periodIso,
    entries_created: entriesCreated,
    total_fx_gain_loss_mdl_cents: totalGainLoss,
    pairs: pairsResult,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getLastDayOfMonth(d: Date): Date {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last;
}
