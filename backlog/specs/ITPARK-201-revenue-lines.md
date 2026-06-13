---
id: ITPARK-201
title: "Revenue lines CRUD + tabel editabil (Anexa 3 linii)"
milestone: ITPARK
phase: "C"
status: pending
attempts: 0
depends_on: ["ITPARK-101", "ITPARK-002"]
spec: backlog/specs/ITPARK-201-revenue-lines.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Liniile de venit ale Anexei 3 ca tabel editabil rapid (spreadsheet-like): client, referințe documente,
obiectul serviciului, cod CAEM, sumă, lună. Baza datelor pentru tot calculul.

## User stories
- **Ca** contabil, **vreau** un tabel în care adaug/editez linii rapid, **pentru că** un dosar are
  zeci–sute de facturi.
- **Ca** contabil, **vreau** să aleg codul CAEM dintr-un dropdown (din nomenclator), **pentru că** nu
  vreau să greșesc codul.

## Acceptance criteria
- [ ] API `GET/POST/PUT/DELETE /api/itpark/engagements/:id/lines` — scoped pe tenant + engagement
- [ ] Rute montate în `app.ts`
- [ ] Tabel editabil la `/app/fin/itpark/:id` (tab „Anexa 3 / Venituri"): coloane client, documente,
  obiect, CAEM (select din ITPARK-002), sumă (input bani, 2 zecimale), lună (1–12 sau „mixt")
- [ ] `isEligible` derivat din cod (badge eligibil/neeligibil), override manual cu confirmare (auditat)
- [ ] Adăugare rând rapid (Enter), ștergere, reordonare `rowNo`; sumele păstrate în `*_cents`
- [ ] Total live la subsol (Σ linii) — calculul complet vine în ITPARK-301
- [ ] design-system, dark mode, a11y, fără hex hardcodat

## Files
**New:** `server/routes/itparkLines.ts`, `src/lib/api/itparkLines.ts`,
`src/pages/app/fin/itpark/RevenueLinesTable.tsx`, test
**Modified:** `server/app.ts` (mount), `ItparkDetail.tsx` (tab)

## Tests
- **T-201-1** [blocant] CRUD linie: creezi/editezi/ștergi; suma în cents, afișaj 2 zecimale; izolat tenant
- **T-201-2** [normal] schimbarea codului CAEM actualizează badge-ul eligibil
- **T-201-3** [blocant] rute montate (nu HTML fallback)

## DoD
- check-route-mounts + check-refs + vitest verzi; live API smoke
- a11y axe 0 critical/serious; Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
