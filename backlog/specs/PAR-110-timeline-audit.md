---
id: PAR-110
title: "Timeline & audit per PAR (cine/ce/când, diff, semnături)"
milestone: PAR
phase: "C"
status: pending
attempts: 0
depends_on: [PAR-101, PAR-109]
spec: backlog/specs/PAR-110-timeline-audit.md
core: backlog/par/PAR-CORE.md
---

## Goal

Un jurnal complet, append-only, al ciclului de viață al fiecărui PAR (creat, editat, submit, fiecare
aprobare/respingere, finanțe, plată), expus ca timeline cronologic pe pagina de detaliu. Reutilizează
pattern-ul `auditLog` deja existent în repo.

## User stories

- **Ca** auditor, **vreau** istoricul complet al unei cereri, **pentru că** trebuie să reconstitui ce s-a întâmplat și când.
- **Ca** requestor, **vreau** să văd unde e blocată cererea, **pentru că** vreau să știu pe cine să întreb.

## Acceptance criteria

- [ ] Fiecare tranziție de stare + decizie scrie un rând `par_audit` `{par_id, actor_user_id, event, detail(jsonb), created_at}`
- [ ] `GET /api/par/:id/timeline` — evenimentele cronologic (cu nume actor rezolvat)
- [ ] Diff la editări (înainte/după) pentru câmpurile-cheie (total, payee, status)
- [ ] Component UI `ParTimeline` afișat pe detaliu (PAR-118), dar livrabil și standalone aici
- [ ] Tenant + PAR scope; doar roluri cu acces la PAR văd timeline-ul

## Files

**New:**
- `server/routes/parTimeline.ts` (sau extinde `par.ts`)
- `src/components/par/ParTimeline.tsx`
- teste `server/routes/__tests__/par-timeline.test.ts`

**Modified:**
- `server/lib/par/*` — emit audit pe tranziții
- `server/app.ts` dacă router nou

## Tests

- **T-PAR-110-1** [blocant] Given submit→approve→approve, Then `par_audit` are câte un rând per tranziție cu actor+timestamp
- **T-PAR-110-2** [normal] Given pagina detaliu, Then timeline cronologic
- **T-PAR-110-3** [blocant] Live API smoke: login + `GET /api/par/:id/timeline` → 200

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
