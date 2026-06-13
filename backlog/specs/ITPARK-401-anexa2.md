---
id: ITPARK-401
title: "Randare live Anexa 2 (rândurile 1–10) din dosar + calcule"
milestone: ITPARK
phase: "E"
status: pending
attempts: 0
depends_on: ["ITPARK-301", "ITPARK-101"]
spec: backlog/specs/ITPARK-401-anexa2.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Reproducerea fidelă a Anexei 2 (informația furnizată de administrator), pre-completată din datele
dosarului + totalurile motorului. Editabil unde e cazul (rândurile 6 și 10), restul derivat.

## User stories
- **Ca** contabil, **vreau** Anexa 2 gata completată, **pentru că** acum o copiez manual din alte surse.

## Acceptance criteria
- [ ] Tab „Anexa 2" la `/app/fin/itpark/:id` care randează cele 10 rânduri exact ca în șablonul oficial:
  1 denumire, 2 IDNO, 3 contract MITP, 4 adrese subdiviziuni, 5 declarație (referință), 6 cost
  subcontractori + %, 7 total vânzări, 8 venituri eligibile, 9 venituri ajustate, 10 procedura informare angajați
- [ ] Rândurile 7 & 8 vin din motor (ITPARK-301) — NU se introduc manual; 6, 9, 10 editabile
- [ ] Format MDL: separator de mii **punct** (`.`), separator zecimale **virgulă** (`,`), 2 zecimale
  (format românesc oficial: `1.971.197,19`); NU refolosește `parPdf.money()` care produce `L 1 971 197`
  (format diferit); implementează `fmtMDL(cents): string` în `src/lib/itpark/fmtMDL.ts`; perioada `dd.mm.yyyy`
- [ ] design-system, dark mode, a11y, print-friendly (pregătit pt. PDF în G)

## Files
**New:** `src/pages/app/fin/itpark/Anexa2.tsx` (+ test), `src/lib/itpark/fmtMDL.ts` (format românesc punct-mii+virgulă-zecimale, + test)
**Modified:** `ItparkDetail.tsx` (tab)

## Tests
- **T-401-1** [blocant] rândurile 7 & 8 = totalurile motorului (consistent cu Anexa 3); fixture Vector Academy → 2.227.917,19 / 1.971.197,19
- **T-401-2** [normal] rândul 6 editabil; % recalculat
- **T-401-3** [blocant] `fmtMDL(197119719)` → `"1.971.197,19"` (separator mii punct, zecimale virgulă); `fmtMDL(0)` → `"0,00"` (fără NaN/undefined)

## DoD
- vitest + check-refs verzi; a11y axe 0 critical/serious; dark mode OK
- Reviewer APPROVED; integration-architect CONNECTED; Persona reports salvate
