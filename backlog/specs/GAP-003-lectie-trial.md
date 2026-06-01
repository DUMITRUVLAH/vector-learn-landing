---
id: GAP-003
title: Lecție Trial (tip distinct de lecție)
milestone: GAP
phase: 1
priority: HIGH
status: pending
dependencies: [lessons, leads, SCHED-503, GAP-002]
feeds_into: [GAP-004, GAP-009]
branch: feat/GAP-faza-1-trial-flow
---

## Scop

Introduce un tip de lecție `trial` distinct. O lecție trial leagă un lead de o grupă. Profesorul marchează rezultatul. La trial reușit, se oferă conversia directă (GAP-004). Fără tip distinct, trial-urile poluează orarul și generează facturi greșite.

## User stories

- Ca profesor, vreau să văd clar că o lecție e „Trial" (nu o lecție normală) pe orar.
- Ca manager, vreau să văd pe cardul unui lead toate lecțiile trial programate și rezultatele lor.
- Ca sistem, lecțiile trial nu trebuie să genereze deducere din sold de unități și nu intră în calculul de payroll.

## Criterii de acceptare

- [ ] Coloane `is_trial boolean default false` și `trial_lead_id uuid references leads(id) null` adăugate pe `lessons` printr-o migrare Drizzle
- [ ] `POST /api/lessons` acceptă `{ isTrial: true, trialLeadId: "uuid" }` și le stochează corect
- [ ] `GET /api/lessons` returnează câmpul `isTrial` și `trialLeadId`
- [ ] Pe SchedulePage, lecțiile trial afișează un badge vizual „Trial" distinct (culoare/iconă diferită) — fără hex hardcodat, doar tokeni semantici
- [ ] Pe Lead Card (`/app/leads/:id`), secțiunea „Lecții trial" listează lecțiile cu `trialLeadId = leadId`: dată, oră, grupă, status prezență, rezultat
- [ ] Câmp `trial_result enum('interested','not_interested','no_show') null` adăugat pe `lessons`
- [ ] Profesorul poate marca rezultatul trial-ului din pagina lecției sau din SchedulePage
- [ ] Lecțiile cu `is_trial = true` sunt excluse din calculul soldului de unități (GAP-007, dacă implementat)
- [ ] Migrarea trecute: `db:reset && db:seed` trece

## Fișiere implicate

- `server/db/schema/lessons.ts` — `isTrial`, `trialLeadId`, `trialResult`
- `server/routes/lessons.ts` — acceptă și returnează noile câmpuri
- `src/pages/app/SchedulePage.tsx` — badge „Trial" pe card lecție
- `src/pages/app/LeadCardPage.tsx` — secțiunea lecții trial

## Teste

- Unit: `POST /api/lessons` cu `isTrial: true, trialLeadId` → salvat corect
- Unit: `GET /api/lessons?leadId=` → returnează doar lecțiile trial ale lead-ului
- Unit: lecție normală (`isTrial: false`) nu are `trialLeadId`
- Smoke: badge „Trial" vizibil pe SchedulePage

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-1-trial-flow`.
