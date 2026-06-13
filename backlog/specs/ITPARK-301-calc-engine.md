---
id: ITPARK-301
title: "Motor determinist de calcul: total/cod CAEM, pondere, eligibil vs total"
milestone: ITPARK
phase: "D"
status: pending
attempts: 0
depends_on: ["ITPARK-201", "ITPARK-002"]
spec: backlog/specs/ITPARK-301-calc-engine.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Inima modulului: din liniile de venit calculează DETERMINIST totalurile cerute de Anexa 3 (per cod
CAEM, total eligibile, total vânzări, ponderi). Cifre exacte la bani, fără AI. Testat pe fixture-ul
Vector Academy.

## User stories
- **Ca** contabil, **vreau** ca totalurile și ponderile să se calculeze singure, **pentru că** în
  Excel greșesc formulele și apar `#DIV/0!`.
- **Ca** auditor, **vreau** cifre exacte și reproductibile, **pentru că** semnez raportul pe ele.

## Acceptance criteria
- [ ] `computeAnexa3(lines, { totalSalesOverride? })` → `{ perCaem: [{code, eligible, totalCents, pct}], totalEligibleCents, totalSalesCents, eligiblePct }`
- [ ] Pondere = `total / totalSales * 100`, 2 zecimale, rotunjire half-up; division by zero → 0 (nu NaN/`#DIV/0!`)
- [ ] `totalSalesCents` = Σ toate liniile, SAU `engagement.totalSalesCents` dacă e setat (venituri în afara Anexei 3)
- [ ] Calcul pe server (`/api/itpark/engagements/:id/calc`) + helper pur reutilizabil în client (`src/lib/itpark/calc.ts`)
- [ ] Toate sumele în întregi `*_cents` intern; conversia la afișaj la final (fără erori de float)
- [ ] Endpoint montat; rezultatul cache-abil/recalculat la schimbarea liniilor

## Files
**New:** `src/lib/itpark/calc.ts` (pur, testabil), `server/routes/itparkCalc.ts`, `src/lib/api/itparkCalc.ts`, teste
**Modified:** `server/app.ts` (mount)

## Tests
- **T-301-1** [blocant] fixture Vector Academy: total eligibile = 197119719 cents (1.971.197,19), total vânzări = 222791719 cents, pondere = 88,48% (±0,01)
- **T-301-2** [blocant] per cod: `62.02` = 9.800.000 cents (98.000,00 / 4,40%); `85.59` = 187.319.719 cents (1.873.197,19 / 84,08%)
- **T-301-3** [blocant] zero linii → totaluri 0, pondere 0, fără `#DIV/0!`/NaN
- **T-301-4** [blocant] endpoint montat → 200

## DoD
- vitest verde pe fixture (cifrele reale); check-route-mounts + check-refs verzi; live API smoke
- Reviewer APPROVED; **adversarial-reviewer** (calcul financiar = risc) fără blocant; integration-architect CONNECTED
- Persona reports salvate
