---
id: ITPARK-402
title: "Randare live Anexa 3 (linii + footer per cod CAEM + total)"
milestone: ITPARK
phase: "E"
status: pending
attempts: 0
depends_on: ["ITPARK-301", "ITPARK-201"]
spec: backlog/specs/ITPARK-402-anexa3.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Anexa 3 în forma oficială: tabelul liniilor (col. 1–5) + footer cu total per cod CAEM și pondere +
totalul general. Citită din linii (ITPARK-201) și motor (ITPARK-301).

## User stories
- **Ca** auditor, **vreau** Anexa 3 exact ca în șablon, **pentru că** o predau la MITP.

## Acceptance criteria
- [ ] Tab „Anexa 3" randează coloanele: nr, „Numărul/data/denumirea contractului sau facturii"
  (documentRefs + client), obiect serviciu, tip activitate CAEM, valoare
- [ ] Footer: „Valoarea totală a serviciilor prestate" + tabel „TOTAL per tipuri de activități"
  (cod CAEM, valoare, pondere %) + „TOTAL venituri eligibile, lei și %" + „TOTAL venituri din vânzări"
- [ ] Cifrele din motor (ITPARK-301); randare a 96 rânduri fără probleme de performanță
- [ ] Format MDL: separator mii punct (`.`), zecimale virgulă (`,`) — `fmtMDL()` din `src/lib/itpark/fmtMDL.ts` (creat în ITPARK-401); print-friendly; design-system, dark mode, a11y

## Files
**New:** `src/pages/app/fin/itpark/Anexa3.tsx` (+ test)
**Modified:** `ItparkDetail.tsx` (tab)

## Tests
- **T-402-1** [blocant] footer per cod + total = motorul; fixture → `62.02` 98.000,00/4,40%, `85.59` 1.873.197,19/84,08%, total 1.971.197,19/88,48%
- **T-402-2** [normal] 96 rânduri randate fără crash

## DoD
- vitest + check-refs verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED; Persona reports salvate
