---
id: GAP-008
title: Auto-billing la epuizare unități
milestone: GAP
phase: 2
priority: MEDIUM
status: pending
dependencies: [GAP-006, FIN-603, COMM-205]
feeds_into: [GAP-010]
branch: feat/GAP-faza-2-abonamente-waitlist
---

## Scop

Când `lesson_packages.unitsRemaining = 0` și `autoRenew = true`, sistemul generează automat o factură pentru un pachet nou. Elimină întreruperile de acces la lecții.

## Criterii de acceptare

- [ ] La `status: 'exhausted'` pe un pachet cu `autoRenew = true`, se generează o factură nouă (POST intern `/api/invoices`) și un pachet nou cu `unitsTotal` identic, `status: 'active'`, `unitsRemaining = unitsTotal`
- [ ] Notificare COMM-205 trimisă: „Pachetul X s-a epuizat. Factură nr. Y generată."
- [ ] Câmp `packageTemplateId uuid null` pe `lesson_packages` pentru a specifica tipul de pachet la reînnoire (dacă null, se copiază `unitsTotal` și `courseId` din pachetul epuizat)
- [ ] Endpoint `POST /api/lesson-packages/run-renewal` pentru declanșare manuală (și cron)
- [ ] Manager poate seta `autoRenew = true/false` pe un pachet din StudentsPage
- [ ] Dacă generarea facturii eșuează, pachetul rămâne `exhausted` și notificarea include „factură manuală necesară"

## Fișiere implicate

- `server/routes/lesson-packages.ts` — logică auto-renewal
- `server/db/schema/lesson_packages.ts` — câmp `packageTemplateId`
- `src/pages/app/StudentsPage.tsx` — toggle autoRenew

## Teste

- Unit: pachet epuizat cu `autoRenew = true` → factură + pachet nou creat
- Unit: pachet epuizat cu `autoRenew = false` → doar notificare, fără factură
- Unit: eșec generare factură → pachet rămâne `exhausted`, notificare manuală

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-2-abonamente-waitlist`.
