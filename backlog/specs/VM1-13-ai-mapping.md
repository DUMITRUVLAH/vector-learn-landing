---
id: VM1-13
title: "AI pre-completează din document — payee, sumă, IBAN, scop (om confirmă)"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/VM1-13-ai-mapping.md
core: backlog/par/PAR-CORE.md
---

## Goal

În `ParCreateForm`, un buton „Completează automat din document" trimite un contract/factură încărcat la AI,
REUTILIZÂND `captureExtractor` (NU se construiește un al doilea motor), și mapează câmpurile extrase în
formular: `vendor_name`→payee, `amount`→total/valută, `iban`→payee IBAN, `purpose`→endUse. Pattern „AI
propune, omul confirmă" cu flag-uri de încredere (<0.7 → la verificare) și un guard pe `document_class`
(semnalează documentele non-financiare). Funcționează în mock mode fără cheie API. Liniile PAR rămân faza 2,
ÎN AFARA acestui scope.

## User stories

- **Ca** requestor, **vreau** ca AI să-mi precompleteze beneficiarul, suma, IBAN-ul și scopul dintr-o
  factură, **pentru că** retastarea lor e lentă și predispusă la greșeli.
- **Ca** requestor, **vreau** să confirm sau corectez fiecare câmp propus, **pentru că** răspund de
  corectitudinea cererii.
- **Ca** finance, **vreau** ca un câmp cu încredere joasă să fie marcat „de verificat", **pentru că** nu
  vreau să se strecoare un IBAN greșit.

## Acceptance criteria

- [ ] Buton „Completează automat din document" în `ParCreateForm.tsx`, cu upload de fișier (contract/factură)
- [ ] Extracția folosește EXCLUSIV `server/lib/ai/captureExtractor.ts` (`ExtractedFields`); fără motor AI nou
- [ ] Mapare: `vendor_name`→`payeeName`, `amount_cents`→total + `currency`, `iban`→`payeeIban`, `purpose`→`endUse`
- [ ] Pattern „AI propune, omul confirmă": câmpurile precompletate sunt editabile, nimic nu se trimite fără confirmarea utilizatorului
- [ ] Flag de încredere per câmp: `confidence < 0.7` → câmpul e marcat vizual „de verificat"
- [ ] Guard `document_class`: dacă documentul nu pare financiar (ex. `not_invoice`), se afișează avertisment non-blocant și nu se forțează maparea
- [ ] Mock mode funcțional fără cheie API (refolosește comportamentul mock din `captureExtractor`)
- [ ] Liniile PAR NU se generează aici (faza 2, în afara scope-ului)
- [ ] Tenant scope respectat; doc stocat conform pattern-ului `fin_captures`/upload existent
- [ ] Fără hex hardcodat; dark-mode ok; câmp fără valoare extrasă rămâne gol, nu crapă

## Files

**New:**
- `server/routes/parAiPrefill.ts` (endpoint: primește doc, cheamă `captureExtractor`, întoarce câmpuri + confidence)
- teste `server/routes/__tests__/par-ai-prefill.test.ts`

**Modified:**
- `server/app.ts` — mount route nou
- `src/pages/par/ParCreateForm.tsx` — buton upload + mapare câmpuri + flag-uri de încredere
- `src/lib/api/par.ts` — client pentru endpoint-ul de prefill

## Tests

- **T-VM1-13-1** [blocant] Given o factură cu vendor+sumă+IBAN+scop, When „Completează automat", Then câmpurile `payeeName`/total/`payeeIban`/`endUse` se precompletează din extracție
- **T-VM1-13-2** [blocant] Live API smoke: login + upload doc → 200 cu câmpuri + confidence
- **T-VM1-13-3** [normal] Given un câmp cu `confidence < 0.7`, When precompletat, Then e marcat „de verificat"
- **T-VM1-13-4** [normal] Given un document `document_class = not_invoice`, When prefill, Then apare avertisment non-blocant și nu se forțează maparea

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
