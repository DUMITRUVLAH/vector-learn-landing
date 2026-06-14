---
id: APPROVAL-002
title: "UI flux aprobare plăți mari — PaymentApprovalQueue + badge + link PAR"
milestone: FIN
phase: "24"
status: pending
depends_on: ["APPROVAL-001", "CASH-003"]
branch: feat/FIN-approval
spec: backlog/specs/APPROVAL-002.md
---

## Goal

Oferă utilizatorului (director financiar, director de academie) o interfață completă pentru
aprobarea plăților mari care depășesc pragul PAR:

1. **PaymentApprovalQueue** — pagina `/app/payments/approval` — listează toate plățile
   `pending`/`overdue` al căror `amount_cents >= threshold` și nu au un PAR aprobat legat.
2. **PaymentsPage inline badge** — pe lista /app/payments, plățile mari afișează
   `PaymentApprovalBadge` (APPROVAL-001, deja construit) inline în linie.
3. **Link-PAR dialog** — din queue sau din lista de plăți, utilizatorul poate lega un PAR existent
   (aprobat) la o plată via `POST /api/payments/:id/link-par` (endpoint deja construit în
   `finPaymentApproval.ts`).
4. **Backend: GET /api/payments/pending-approval** — returnează plățile ce necesită aprobare
   (status pending/overdue, amount >= threshold, fără par_request_id legat cu status approved).
5. **`parRequestId` în lista de plăți** — endpoint `GET /api/payments` include câmpul
   `par_request_id` în răspuns (lipsea în APPROVAL-001, blocant pentru badge).

REUSE: PAR approval flow existent complet (PAR-107/108/109/113/118). Nu se recreează niciun
sistem de aprobare — se LEAGĂ plata de un PAR existent deja aprobat.

## User stories

- Ca director financiar, vreau să văd rapid ce plăți mari nu au autorizare PAR, pentru că altfel
  risc să plătesc fără aprobare formală.
- Ca director de academie, vreau să pot lega o cerere PAR aprobată la o plată, pentru că procesul
  de control financiar trebuie să fie complet înainte de plată.
- Ca contabil, vreau să văd badge-ul de statut PAR pe lista de plăți, pentru că îmi dă context
  instant fără să deschid PAR separat.
- Ca utilizator mobil, vreau ca queue-ul de aprobare să funcționeze pe ecran mic, pentru că
  aprobările se fac adesea în deplasare.

## Acceptance criteria

- [ ] `GET /api/payments` include câmpul `par_request_id` în fiecare obiect payment
- [ ] `GET /api/payments/pending-approval` returnează `{ items: Payment[] }` — plăți cu
  `amount_cents >= threshold` și fără PAR aprobat; threshold din `par_settings` sau 500_000 cents
- [ ] `PaymentsPage` afișează `PaymentApprovalBadge` în linie pentru plăți cu
  `amount_cents >= threshold`
- [ ] Butonul "Marchează plătit" pe plăți mari e dezactivat cu tooltip când PAR lipsă
- [ ] `/app/payments/approval` există, e montată în `App.tsx`, afișează lista de plăți din
  `pending-approval` cu coloana Sumă, Student, Status, Status PAR, Acțiuni
- [ ] Din `/app/payments/approval` (și din `/app/payments` inline), utilizatorul poate apăsa
  "Leagă PAR" → dialog cu autocomplete `par_request_id` din lista PAR-urilor cu status `approved`
  ale tenantului
- [ ] Linkarea PAR (`POST /api/payments/:id/link-par`) actualizează lista imediat (refresh local)
- [ ] Plata cu PAR aprobat legat nu mai apare în pending-approval queue
- [ ] Design system tokens (fără hex hardcodat); funcționează în dark mode
- [ ] Axe 0 critical+serious
- [ ] TypeScript strict (zero `any`)

## Files

### New files
- `src/pages/app/PaymentApprovalQueuePage.tsx` — pagina /app/payments/approval
- `src/components/fin/LinkParDialog.tsx` — dialog autocomplete PAR aprobat + submit
- `server/routes/finPaymentApproval.ts` — ADD `GET /pending-approval` route (extend)
- `src/__tests__/paymentApprovalQueue.test.tsx` — unit tests

### Modified files
- `server/routes/payments.ts` — adaugă `par_request_id` la GET /api/payments select
- `src/lib/api/payments.ts` — adaugă câmpul `parRequestId` la interface Payment + fn `listPendingApproval()`
- `src/lib/api/par.ts` — adaugă fn `listApprovedPars()` → `GET /api/par?status=approved`
- `src/pages/app/PaymentsPage.tsx` — afișează PaymentApprovalBadge inline + dezactivează buton
- `src/App.tsx` — montează ruta `/app/payments/approval`

## Tests

- **T-APPROVAL-002-1** [blocant] Given un payment cu amount >= 5000 MDL fără PAR, When GET /api/payments, Then câmpul `par_request_id` e `null` în response
- **T-APPROVAL-002-2** [blocant] Given un payment cu amount >= threshold fără PAR aprobat, When GET /api/payments/pending-approval, Then apare în lista returnată
- **T-APPROVAL-002-3** [blocant] Given un payment cu PAR aprobat legat, When GET /api/payments/pending-approval, Then NU apare în listă
- **T-APPROVAL-002-4** [blocant] Given PaymentApprovalQueuePage renderizată, When lista se încarcă, Then nu crapă (render-without-crash)
- **T-APPROVAL-002-5** [normal] Given LinkParDialog deschis, When utilizatorul selectează un PAR și confirmă, Then se apelează POST /api/payments/:id/link-par
- **T-APPROVAL-002-6** [normal] Given un payment peste prag fără PAR, When PaymentsPage renderizează linia, Then butonul "Marchează plătit" e aria-disabled

## DoD

- Build + typecheck + lint verzi
- `npm run check-route-mounts` verde (ruta montată în app.ts)
- Toate `[blocant]` scenarii pass
- Reviewer APPROVED
- Integration-architect CONNECTED (nu competing system)
- Persona reports salvate
