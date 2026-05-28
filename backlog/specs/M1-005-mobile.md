---
id: M1-005
title: Aplicație mobilă — module page
milestone: M1
estimate_hours: 2
priority: P0
---

# M1-005 — Aplicație mobilă

## Goal
Pagina `/modules/mobile` cu mockup interactiv de telefon (swipe între 4 ecrane: Dashboard, Orar, Teme, Plăți).

## User stories
- **Părinte**: "Vreau să văd cum arată aplicația pentru copilul meu."
- **Manager**: "E posibil white-label cu numele meu?"

## Acceptance criteria
- [ ] Pagina la `/modules/mobile`
- [ ] Phone mockup cu 4 ecrane navigabile prin săgeți și swipe (touchstart/end events)
- [ ] Indicator de pagină (4 puncte)
- [ ] Toggle iOS / Android — schimbă mockup-ul (round notch vs. punch hole)
- [ ] 4 secțiuni: *Gamification*, *Teme & quiz-uri*, *Chat profesor*, *White-label*
- [ ] Badge XP & streak animate
- [ ] FAQ 4 întrebări

## Files
- `src/pages/modules/MobilePage.tsx`
- `src/components/modules/mobile/PhoneMockup.tsx`
- `src/components/modules/mobile/AppScreen.tsx`

## Tests required
- Navigare între ecrane funcționează
- Toggle iOS/Android schimbă clasele DOM corect

## DoD
Quality gates trec.
