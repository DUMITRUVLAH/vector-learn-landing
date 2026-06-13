---
id: ITPARK-203
title: "Auto-sugestie cod CAEM din descrierea serviciului (determinist + override)"
milestone: ITPARK
phase: "C"
status: pending
attempts: 0
depends_on: ["ITPARK-201", "ITPARK-002"]
spec: backlog/specs/ITPARK-203-caem-suggest.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Reducerea erorilor de codare: din `serviceDescription` propune un cod CAEM (determinist, pe reguli
cheie-cuvânt), pe care contabilul îl confirmă. AI-ul rămâne pentru ITPARK-701; aici e logică simplă,
fără model.

## User stories
- **Ca** contabil, **vreau** ca sistemul să-mi propună codul din descriere, **pentru că** „Servicii
  instruire domeniu digital" e mereu `85.59` și nu vreau să-l aleg de fiecare dată.

## Acceptance criteria
- [ ] Helper determinist `suggestCaem(description)` → cod + scor (reguli: „instruire/învățământ" →`85.59`; „consultanță" →`62.02`; „software/dezvoltare" →`62.01`; „hosting/date" →`63.11`; …)
- [ ] Aplicat la editarea liniei și la import (pre-completează coloana CAEM, editabilă)
- [ ] Sugestia e doar propunere — niciodată suprascrie un cod ales manual; override mereu permis
- [ ] Regulile sunt date (config), nu hardcodate prin tot codul; ușor de extins

## Files
**New:** `src/lib/itpark/suggestCaem.ts` (+ test), eventual server mirror
**Modified:** `RevenueLinesTable.tsx`, `parseRevenuePaste.ts` (folosesc sugestia)

## Tests
- **T-203-1** [normal] „Servicii instruire domeniu digital" → `85.59`; „Servicii consultanta in domeniu digital" → `62.02`
- **T-203-2** [normal] descriere necunoscută → fără sugestie (gol), nu cod greșit

## DoD
- check-refs + vitest verzi; Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
