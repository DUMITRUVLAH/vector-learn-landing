---
id: M1-004
title: Comunicare multi-canal — module page
milestone: M1
estimate_hours: 2
priority: P1
---

# M1-004 — Comunicare multi-canal

## Goal
Pagina `/modules/comunicare` cu un builder vizual de automatizare (if-then-else) și preview WhatsApp/Telegram/Email.

## User stories
- **Manager**: "Vreau să văd cum scriu un trigger: dacă elev absent → SMS părinte"
- **Marketing**: "Vreau să trimit campanii segmentate."

## Acceptance criteria
- [ ] Pagina la `/modules/comunicare`
- [ ] Automation builder vizual: 3 noduri (Trigger → Condition → Action) cu select pe fiecare
- [ ] Preview vizual al unui mesaj WhatsApp (chat bubble verde) cu placeholder `{nume}` care se interpolează
- [ ] Toggle canal: WhatsApp / Telegram / SMS / Email — schimbă preview-ul vizual
- [ ] 4 secțiuni: *WhatsApp Business API*, *Automatizări*, *Broadcast*, *Notificări push*
- [ ] FAQ 4 întrebări

## Files
- `src/pages/modules/ComunicarePage.tsx`
- `src/components/modules/comunicare/AutomationBuilder.tsx`
- `src/components/modules/comunicare/MessagePreview.tsx`

## Tests required
- Builder schimbă output-ul corect
- Preview interpolează `{nume}` în text

## DoD
Quality gates trec.
