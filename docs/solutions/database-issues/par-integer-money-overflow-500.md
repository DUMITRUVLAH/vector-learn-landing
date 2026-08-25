---
title: An amount that does not fit the integer *_cents column 500s the request instead of failing validation
problem_type: database_issue
module: par
tags: [par, money, integer, overflow, out-of-range, validation, 500, line-items, reports, bigint]
symptoms: 'POST /api/par/:id/line-items returns 500; server log: value "99999999000" is out of range for type integer'
severity: P1
date: 2026-08-25
---

## Symptom
Adding a line item with a large quantity × unit price (e.g. `quantity: 1000, unit_price_cents: 99999999`)
returned **500**. The server log showed `value "99999999000" is out of range for type integer`. The user
sees a generic failure on a plain typo (one zero too many) with no field to correct.

## Root cause
Every money column in `server/db/schema/par.ts` is a Postgres `integer` (max 2 147 483 647). The zod
schema bounded neither `unit_price_cents` nor the **product** `quantity × unit_price_cents`, and nothing
bounded the recomputed `par_requests.total_estimated_cents` either — so an out-of-range value passed
validation, reached the INSERT and died in the driver.

The same class hides in the **reports**: `cast(sum(...) as integer)` overflows once a tenant's lifetime
spend passes 2.1 billion cents (≈21.4M MDL), which would 500 every report at once — a time bomb that
grows with usage rather than a bug you can hit on day one.

## Fix
- `server/lib/par/moneyBounds.ts` — one `MAX_MONEY_CENTS` ceiling + `exceedsMoneyBound()`.
- Line-item create/update: bound the line total AND the projected PAR total → `400 amount_too_large`
  with the field and the max, instead of letting the INSERT decide.
- `.max(MAX_MONEY_CENTS)` on the zod schemas that carry money (line items, quotes).
- `server/routes/parReports.ts`: every `cast(sum(...) as …)` is now `bigint`; the mappers already
  wrapped the result in `Number()`, so nothing else changed.

## How to avoid next time
When a column is an `integer`, the API contract has a ceiling — declare it. Any *computed* money value
(a product, a running total, an aggregate) needs the bound too, not just the field the client sent.
Locked by `server/lib/par/__tests__/qaBlindSweep.regression.test.ts` and by the "amount that would
overflow the money column is refused with 400" scenarios in `scripts/e2e-par-blind-150.mjs`.
