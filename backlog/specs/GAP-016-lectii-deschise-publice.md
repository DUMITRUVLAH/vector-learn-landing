---
id: GAP-016
title: Lecții deschise cu înregistrare externă
milestone: GAP
phase: 5
priority: LOW
status: pending
dependencies: [lessons, cohorts, CRM-101, COMM-205]
feeds_into: [leads, GAP-003]
branch: feat/GAP-faza-5-operational
---

## Scop

O lecție cu link public de înregistrare. Vizitatorii externi se înregistrează fără cont — creează automat un lead în CRM. Canal de achiziție ieftin (link pe social media).

## Criterii de acceptare

- [ ] Câmp `isOpenEvent boolean default false` și `publicSlug varchar unique null` adăugate pe `lessons`
- [ ] Pagina publică `/public/events/:slug` — 200 fără autentificare, afișează detalii lecție + formular (nume, telefon, email)
- [ ] Înregistrarea externă creează un `lead` cu `leadSource: 'webform'` și o interacțiune `type: 'system'` cu `{ origin: 'open_lesson', lessonId }`
- [ ] Generare și copiere link public din SchedulePage sau CXPage (buton „Generează link public")
- [ ] Lista participanților (interni din `student_lessons` + externi din leads) vizibilă pe cardul lecției
- [ ] `publicSlug` e unic per tenant

## Fișiere implicate

- `server/db/schema/lessons.ts` — `isOpenEvent`, `publicSlug`
- `server/routes/public-events.ts` — endpoint public
- `src/pages/app/SchedulePage.tsx` — buton generare link
- `src/pages/public/PublicEventPage.tsx` — pagina publică nouă

## Teste

- Unit: `/public/events/:slug` → 200 fără auth
- Unit: formular completat → lead creat cu sursă corectă
- Unit: slug unic per tenant

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-5-operational`.
