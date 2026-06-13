---
id: ITPARK-403
title: "Randare live Anexa 4 (tabel lunar) + gate consistență cross-anexă"
milestone: ITPARK
phase: "E"
status: pending
attempts: 0
depends_on: ["ITPARK-302", "ITPARK-401", "ITPARK-402"]
spec: backlog/specs/ITPARK-403-anexa4-consistency.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Anexa 4 (situația lunară) randată din motorul lunar (ITPARK-302) + gate-ul de aur: totalurile trebuie
să fie IDENTICE în Anexa 2/3/4. Fără consistență, dosarul nu poate deveni „Ready".

## User stories
- **Ca** auditor, **vreau** ca totalurile să se lege între cele 3 anexe, **pentru că** o nepotrivire
  e respinsă la MITP.

## Acceptance criteria
- [ ] Tab „Anexa 4": 12 luni + Total, coloane venit eligibil/total, cumulativ eligibil/total, pondere lunară cumulativă
- [ ] Banner status prag (conform / avertisment / risc statut) din ITPARK-302
- [ ] Gate consistență `checkConsistency(engagement)`: Anexa 2 rând 7 == Anexa 3 total vânzări == Anexa 4 Total total; idem eligibile; idem pondere. Diferențe evidențiate cu suma exactă
- [ ] Câtă vreme gate-ul e roșu, butonul „Ready" (ITPARK-602) e dezactivat cu explicație
- [ ] Format, print-friendly, design-system, dark mode, a11y

## Files
**New:** `src/pages/app/fin/itpark/Anexa4.tsx`, `src/lib/itpark/checkConsistency.ts` (+ teste)
**Modified:** `ItparkDetail.tsx` (tab + banner)

## Tests
- **T-403-1** [blocant] fixture: Anexa 2/3/4 totaluri identice → consistency OK; dacă forțezi o linie diferită → gate roșu cu diferența
- **T-302→4** [blocant] cumulativ decembrie 1.971.197,19 / 88,48% afișat

## DoD
- vitest + check-refs verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; adversarial-reviewer fără blocant; integration-architect CONNECTED
- Persona reports salvate
