---
id: ITPARK-502
title: "Declarație pe proprie răspundere (art. 312 CP) pre-completată"
milestone: ITPARK
phase: "F"
status: pending
attempts: 0
depends_on: ["ITPARK-501"]
spec: backlog/specs/ITPARK-502-self-declaration.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Declarația pe proprie răspundere a administratorului (solvabilitate / fără insolvență, lichidare,
restructurare, suspendare) — Anexa B/F/G din lista de documente — pre-completată.

## User stories
- **Ca** administrator, **vreau** declarația gata, **pentru că** doar o verific și o semnez.

## Acceptance criteria
- [ ] Generează `decl_self_responsibility` cu: subsemnat (administrator), denumire SRL, adresa juridică,
  cod fiscal, perioada deținerii statutului, referința art. 312 Cod Penal + art. 18 alin.(1) Legea 77/2016
- [ ] Lista celor 5 situații negate (insolvabilitate / lichidare / restructurare / suspendare / proceduri legale) conform șablonului
- [ ] Data + „Reprezentant legal / Administrator" pre-completate; editabil
- [ ] design-system, dark mode, a11y; print-friendly

## Files
**New:** extindere `letterTemplates.ts` (declarația) + test
**Modified:** `Letters.tsx`

## Tests
- **T-502-1** [normal] declarația conține art. 312 CP + perioada + reprezentant legal + cele 5 situații

## DoD
- vitest + check-refs verzi; Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
