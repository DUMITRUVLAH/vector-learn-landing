---
id: SPLIT-301
title: "AppShell CRM: scoate din sidebar-ul educațional modulele business"
milestone: SPLIT
phase: "4"
status: done
branch: feat/SPLIT-crm-cleanup
depends_on: [SPLIT-101]
spec: backlog/specs/SPLIT-301.md
---

## Goal

Verifică și confirmă că AppShell nu conține entry-uri de navigare pentru FinDesk, PAR, sau ITPark.
Adaugă link discret "Business Suite" la baza sidebar-ului educațional.

## Acceptance Criteria

- [ ] AppShell.tsx nu conține entry-uri de navigare cu href-uri spre /app/fin/*, /app/par*, /app/itpark*.
- [ ] Link discret "Business Suite" la baza sidebar-ului → /business.
- [ ] Finanțe educaționale (Plăți, Facturi, Contracte, Salarizare) rămân.
- [ ] Build green.
