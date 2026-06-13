---
id: ITPARK-602
title: "Status dosar „Ready\" (gate consistență) + checklist documente + audit + notificare"
milestone: ITPARK
phase: "G"
status: pending
attempts: 0
depends_on: ["ITPARK-601"]
spec: backlog/specs/ITPARK-602-ready-checklist.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Închiderea fluxului: un checklist al pieselor necesare + butonul „Marchează gata de semnat", blocat
până când gate-ul de consistență (ITPARK-403) e verde și piesele obligatorii există. Notificare la owner.

## User stories
- **Ca** contabil, **vreau** o listă clară cu ce mai lipsește, **pentru că** nu vreau să predau un
  dosar incomplet.
- **Ca** owner, **vreau** o notificare „dosarul X e gata de semnat", **pentru că** apoi îl semnez.

## Acceptance criteria
- [ ] Checklist (din lista oficială de documente): Anexa 2/3/4 complete, cele 5 scrisori, declarația,
  consistență OK, prag evaluat — fiecare cu bifă verde/roșie
- [ ] Buton „Ready" activ DOAR când consistency OK + piesele obligatorii prezente; altfel dezactivat cu motivul
- [ ] La „Ready" → `engagement.status=ready`, notificare in-app (refolosește `inAppNotifications`), audit
- [ ] design-system, dark mode, a11y

## Files
**New:** `src/components/itpark/ReadyChecklist.tsx` (+ test)
**Modified:** `ItparkDetail.tsx`, `server/routes/itparkEngagements.ts` (status ready + notificare + audit)

## Tests
- **T-602-1** [blocant] „Ready" blocat când consistency roșu; permis când verde + piese prezente
- **T-602-2** [normal] „Ready" → notificare + audit log

## DoD
- vitest + check-refs verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED (reutilizează notifications)
- Persona reports salvate
