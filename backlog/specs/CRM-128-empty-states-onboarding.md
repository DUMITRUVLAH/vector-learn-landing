---
id: CRM-128
title: Empty states + onboarding (primul login nu e ecran gol)
milestone: CRM
phase: H
priority: P1
core_ref: [CRM-CORE.md §5, §8]
tests: TEST-SCENARIOS.md#crm-128
depends_on: [CRM-117, CRM-120]
status: pending
---

# CRM-128 — Empty states & onboarding

## Goal
Primul contact cu produsul la demo decide vânzarea. Acum, un tenant nou vede un kanban gol și nu
știe ce să facă. Adăugăm empty states utile + un onboarding scurt care duce omul la prima acțiune.

## In scope
- **Empty states** pentru: pipeline gol („Niciun lead încă — Adaugă primul / Importă CSV / Conectează
  formularul"), coloană goală („Trage carduri aici"), listă filtrată fără rezultate („Niciun lead
  pentru aceste filtre — Resetează"), dashboard „Azi" gol („Ești la zi 🎉").
  Fiecare cu ilustrație/iconiță + 1-2 CTA-uri reale (nu doar text).
- **Tur scurt** (3-4 pași, dismissable, persistat per user): „Aici e pipeline-ul · Așa adaugi un
  lead · Aici vezi ce ai de făcut azi". Fără librărie grea — coachmark-uri simple.
- **Checklist de start** (opțional, pe dashboard) pentru tenant nou: adaugă primul lead, creează o
  vizualizare, conectează o sursă. Bifează automat când e făcut.

## Out of scope
- Date demo seed-uite automat (riscant în prod). Doar ghidaj, nu date false.

## Acceptance criteria
- [ ] Toate cele 4 empty states au CTA real funcțional; nu ecran gol
- [ ] Tur dismissable, persistat per user, nu reapare după dismiss
- [ ] Checklist de start reflectă starea reală (bife corecte)
- [ ] Fără dependență grea nouă; bundle în buget (§3.4)
- [ ] 0 axe critical/serious; dark mode OK; mobil-friendly

## Tests
`TEST-SCENARIOS.md#crm-128`. Blocante verzi.

## DoD
Standard.
