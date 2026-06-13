---
id: ITPARK-302
title: "Anexa 4 lunară (eligibil/total/cumulativ/pondere) + prag 70% + toleranță"
milestone: ITPARK
phase: "D"
status: pending
attempts: 0
depends_on: ["ITPARK-301"]
spec: backlog/specs/ITPARK-302-monthly-threshold.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Calculul lunar al Anexei 4 (venit eligibil/total per lună, cumulativ, pondere lunară cumulativă) +
evaluarea pragului de 70% cu toleranța de 2 luni consecutive. Evidențiază riscul de pierdere a
statutului fără a bloca.

## User stories
- **Ca** contabil, **vreau** tabelul lunar completat singur, **pentru că** e cel mai obositor de făcut manual.
- **Ca** auditor, **vreau** un semnal clar când ponderea scade sub 70%, **pentru că** asta pune în
  pericol statutul de rezident.

## Acceptance criteria
- [ ] `computeAnexa4(lines, settings)` → 12 rânduri `{month, eligibleCents, totalCents, cumEligibleCents, cumTotalCents, monthlySharePct}` + `Total`
- [ ] Pondere lunară cumulativă = `cumEligible / cumTotal * 100` (2 zecimale, div0→0)
- [ ] Liniile fără lună („mixt") → tratate conform CORE (alocate la luna documentului dacă există, altfel evidențiate ca „nealocate lunar" — nu pierdute din total)
- [ ] Evaluare prag: `eligiblePct(YTD) ≥ settings.eligibilityThresholdPct` → conform; luni cumulative sub prag > `toleranceMonths` consecutive → `risk: true` cu mesaj
- [ ] `Total` Anexa 4 == totalurile din ITPARK-301 (consistență; gate în E)
- [ ] Server endpoint + helper pur client

## Files
**New:** `src/lib/itpark/calcMonthly.ts` (+ test), extindere `itparkCalc.ts`
**Modified:** `server/routes/itparkCalc.ts`

## Tests
- **T-302-1** [blocant] fixture Vector Academy: cumulativ eligibil decembrie = 1.971.197,19; pondere cumulativă decembrie = 88,48%
- **T-302-2** [blocant] pondere YTD 88,48% ≥ 70% → conform; dosar construit sub 70% pe 3 luni consecutive → `risk:true`
- **T-302-3** [blocant] zero linii → fără `#DIV/0!` (0 / „—")
- **T-302-4** [blocant] linii cu `month=null` nu dispar din `totalCents` anual (sunt incluse în total dar marcate „nealocate lunar" în Anexa 4); totalul anual rămâne consistent cu ITPARK-301

## DoD
- vitest verde pe fixture; check-refs verde
- Reviewer APPROVED; adversarial-reviewer fără blocant; integration-architect CONNECTED
- Persona reports salvate
