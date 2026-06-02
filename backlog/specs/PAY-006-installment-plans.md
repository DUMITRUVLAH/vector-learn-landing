---
id: PAY-006
title: "Plan de plată în rate — N facturi cu scadențe automate"
milestone: PAY
phase: "3"
status: pending
depends_on: [PAY-004, PAY-005]
slug: installment-plans
---

## Goal

Permite managerilor să ofere părinților posibilitatea de a plăti cursul în rate. La crearea unei plăți, 
se poate activa "Plată în rate" cu N rate și interval (lunar/săptămânal). Sistemul generează automat 
N facturi cu scadențe diferite și le afișează grupate ca "plan de plată" în UI. Fiecare rată e o
factură separată (poate fi marcată paid individual). Dacă se activează Stripe, fiecare rată primește
Payment Link separat.

## User stories

- **US-1**: Ca Párinte cu cash flow limitat, vreau să plătesc cursul de 1200 RON în 3 rate a 400 RON, pentru că nu pot plăti tot dintr-o dată.
- **US-2**: Ca Recepționer, vreau să creez un plan de plată în rate la înscrierea elevului, pentru că directorul a acceptat această aranjare.
- **US-3**: Ca Manager, vreau să văd toate planurile de rate active și situația lor (câte rate plătite / total), pentru că trebuie să monitorizez cashflow-ul.
- **US-4**: Ca Director, vreau să configurez opțiunile de rate permise (2x, 3x, 4x, max 12x), pentru că fiecare centru are politica lui.

## Acceptance criteria

- [ ] AC1: Tabel `payment_plans` — (id, tenant_id, student_id, course_id, total_amount, installments_count, interval_days, created_by, created_at, status: active/completed/cancelled).
- [ ] AC2: `POST /api/payment-plans` cu `{student_id, course_id, total_amount, installments: 3, interval_days: 30, first_due_date}` → creează plan + N invoices cu amounts egale (rotunjire la ultimul) și due_dates calculate.
- [ ] AC3: `GET /api/payment-plans` → lista planurilor active per tenant, cu progress `{paid: N, total: N, paid_amount, remaining_amount}`.
- [ ] AC4: `GET /api/payment-plans/:id` → detaliu plan + lista tuturor facturilor incluse (cu status individual).
- [ ] AC5: UI — la crearea plății în `/app/payments/new` sau din profilul elevului: checkbox "Plată în rate", selector N rate (2/3/4), prima scadență. Preview calcul (suma fiecare rată).
- [ ] AC6: UI — pagina `/app/payment-plans` listează planurile active cu progress bar. Click → detaliu cu lista rate + status.
- [ ] AC7: Anulare plan (`DELETE /api/payment-plans/:id`) → marchează planul `cancelled`, facturile rămase (nepaid) → `cancelled`. Facturile deja paid rămân paid.
- [ ] AC8: La plata ultimei rate → planul devine automat `completed`.

## Files to create / modify

- `server/db/schema/paymentPlans.ts` — tabel `payment_plans` + FK la invoices
- `server/routes/paymentPlans.ts` — CRUD + endpoint calcul preview
- `server/app.ts` — montare route
- `src/pages/PaymentPlansPage.tsx` — lista planuri active
- `src/components/payments/PaymentPlanForm.tsx` — form creare plan cu rate preview
- `src/components/payments/PaymentPlanCard.tsx` — card cu progress bar
- `drizzle/0034_pay006_payment_plans.sql` — migrare

## Tests

- **T-PAY-006-1** [blocant] Given POST /api/payment-plans cu {total_amount: 1200, installments: 3, interval_days: 30}, Then se creează 3 invoices cu 400 RON fiecare și due_dates la 30/60/90 zile.
- **T-PAY-006-2** [blocant] Given plan cu 3 rate, When ultima rată marcată paid, Then status plan devine "completed" automat.
- **T-PAY-006-3** [blocant] Given API smoke — boot server, POST /api/auth/login → 200, POST /api/payment-plans → 201, GET /api/payment-plans → 200.
- **T-PAY-006-4** [normal] Given rotunjire inegală (1201 RON / 3), When creare plan, Then primele 2 rate = 400, ultima = 401 (total 1201 exact).
- **T-PAY-006-5** [normal] Given DELETE /api/payment-plans/:id cu 2 rate nepaid, When anulare plan, Then cele 2 rate devin "cancelled", rata deja paid rămâne "paid".

## Definition of Done

- [ ] Migrare SQL commitată și `db:reset && db:seed` trec
- [ ] Toate testele T-PAY-006-* trec
- [ ] Pagina `/app/payment-plans` funcțională cu lista și progress
- [ ] Form creare rată integrat în fluxul de plăți
- [ ] Reviewer APPROVED, integration-architect CONNECTED
