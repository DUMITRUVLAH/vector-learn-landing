---
id: ITPARK-701
title: "Sugestie CAEM AI + OCR factură → linie venit (accelerator, confirmat de om)"
milestone: ITPARK
phase: "H"
status: pending
attempts: 0
depends_on: ["ITPARK-203", "ITPARK-301"]
spec: backlog/specs/ITPARK-701-ai-capture.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Stratul AI (diferențiatorul): pe lângă sugestia deterministă (ITPARK-203), AI propune cod CAEM pe
descrieri ambigue și extrage linii de venit din PDF-uri de factură. Mereu propunere confirmată de om;
AI nu atinge niciodată cifrele calculate.

## User stories
- **Ca** contabil, **vreau** ca AI-ul să-mi citească factura PDF și să-mi propună linia, **pentru că**
  altfel transcriu manual.

## Acceptance criteria
- [ ] `POST /api/itpark/ai/suggest-caem` → cod + scor + motiv, pe descrieri unde regula deterministă nu decide; refolosește `ai.ts`, gating `aiFeatureFlags`
- [ ] Upload PDF/imagine factură → AI extrage client/sumă/dată/CAEM → linie propusă, confirmată cu 1 click
- [ ] AI NU recalculează totaluri/pondere/prag (rămân deterministe ITPARK-301/302); anonimizare PII spre prompt; toate sugestiile în `aiAuditLog`
- [ ] Degradează grațios dacă AI dezactivat (rămâne sugestia deterministă)

## Files
**New:** `server/routes/itparkAi.ts`, `src/lib/api/itparkAi.ts`, UI integrată în import/tabel, teste
**Modified:** `server/app.ts` (mount), `PasteImportDialog.tsx`

## Tests
- **T-701-1** [blocant] AI propune cod/linie dar totalurile rămân identice; sugestiile în `aiAuditLog`
- **T-701-2** [normal] AI dezactivat → fallback determinist, fără crash

## DoD
- check-route-mounts + check-refs + vitest verzi
- Reviewer APPROVED; adversarial-reviewer (AI + date) fără blocant; integration-architect CONNECTED
- Persona reports salvate
