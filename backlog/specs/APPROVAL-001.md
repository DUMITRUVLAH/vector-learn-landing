---
id: APPROVAL-001
title: Flux aprobare plăți FIN — integrare cu modulul PAR existent (REUSE)
milestone: FIN
phase: approval
status: pending
depends_on: []
spec: backlog/specs/APPROVAL-001.md
---

## Goal

Conectează modulul FIN (plăți cheltuieli — tabela `payments` cu `status='pending'`) la
fluxul de aprobare PAR existent, astfel încât cheltuielile mari (>5.000 MDL sau orice
cheltuială de tip SPEND configurabilă per-tenant) să necesite un PAR aprobat înainte de
a fi procesate. **REFOLOSEȘTE PAR** — nu reconstrui un sistem de aprobare separat.

Integrarea înseamnă:
1. Un câmp `par_request_id` (FK nullable la `par_requests`) pe tabela `payments`.
2. Un endpoint `POST /api/payments/:id/link-par` care leagă o plată de un PAR aprobat.
3. Un validator care blochează `PATCH /api/payments/:id` cu `status='paid'` dacă `amount_cents`
   depășește pragul și `par_request_id` este null sau PAR-ul nu are `status='approved'`.
4. O secțiune „Aprobare necesară" în UI-ul de detaliu plată (`/app/fin/payments/:id`) care
   afișează starea PAR-ului legat (sau un CTA să creeze un PAR dacă lipsește).

## User stories

- Ca director financiar, vreau că plățile > 5.000 MDL să fie blocate până la un PAR aprobat,
  astfel încât să respect politica internă de aprobare a cheltuielilor.
- Ca contabil, vreau să leg o plată de un PAR existent (aprobat), astfel încât să pot marca
  plata ca „plătită" fără să creez un flux nou.
- Ca manager, vreau să văd în UI-ul plății dacă are un PAR asociat și ce stare are,
  astfel încât să știu dacă pot autoriza plata.
- Ca sistem, vreau că integrarea FIN↔PAR să refolosească tabelele și rutele PAR existente,
  astfel încât să nu existe două sisteme de aprobare paralele.

## Acceptance criteria

- [ ] Coloana `par_request_id uuid nullable` adăugată la tabela `payments` via migrare
  `drizzle/0117_fin_approval_link.sql` cu FK la `par_requests.id` (SET NULL on delete).
- [ ] Schema `server/db/schema/payments.ts` actualizată cu câmpul `parRequestId`.
- [ ] `drizzle/meta/_journal.json` conține entry `{ idx: 117, tag: "0117_fin_approval_link" }`.
- [ ] Endpoint `POST /api/payments/:id/link-par` cu body `{ par_request_id: uuid }`:
  - Verifică că PAR-ul există și aparține aceluiași tenant.
  - Verifică că PAR-ul are `status = 'approved'`.
  - Actualizează `payments.par_request_id`.
  - Returnează 200 cu plata actualizată.
- [ ] Validator în `PATCH /api/payments/:id` (update status):
  - Dacă `new_status == 'paid'` AND `amount_cents >= threshold_cents` (default 500000 = 5000 MDL)
    AND `par_request_id IS NULL` → returnează 422 cu `{ error: "approval_required", threshold_mdl: 5000 }`.
  - Pragul e configurabil per-tenant din `par_settings.approval_threshold_cents` (dacă coloana există)
    sau fallback la 500000.
- [ ] Rute montate în `server/app.ts` cu comentariul `// APPROVAL-001`.
- [ ] Componentă React `src/components/fin/PaymentApprovalBadge.tsx`:
  - Props: `{ parRequestId: string | null, paymentAmountCents: number }`.
  - Dacă `parRequestId` null și `amount_cents >= threshold` → afișează badge roșu „Aprobare necesară" + link „Creează PAR".
  - Dacă `parRequestId` nu-null → fetch stare PAR + afișează badge colorat: verde (approved), galben (pending), roșu (rejected).
  - Tokens Vector 365; dark mode; WCAG AA (contrast ≥ 4.5:1 pe badge-uri).
- [ ] Componenta e folosită în pagina de detaliu plată existentă (sau stub page `/app/fin/payments/:id`).
- [ ] TypeScript strict; zero `any`; nicio duplicare a logicii de aprobare PAR.
- [ ] `integration-architect` confirmă că FIN↔PAR e CONNECTED (nu COMPETING_SYSTEM).

## Files

- `drizzle/0117_fin_approval_link.sql` — migrare SQL (ADD COLUMN + FK)
- `drizzle/meta/0117_snapshot.json` — snapshot
- `drizzle/meta/_journal.json` — entry nouă
- `server/db/schema/payments.ts` — adaugă `parRequestId`
- `server/routes/finPaymentApproval.ts` — `POST /api/payments/:id/link-par`
- `server/app.ts` — mount rute + validator în ruta payments existentă
- `src/components/fin/PaymentApprovalBadge.tsx` — componentă badge
- `server/__tests__/finPaymentApproval.test.ts` — teste unitare

## Tests

- **T-APPR001-1** [blocant] Given: migrare 0117, When: `db:reset`, Then: coloana `par_request_id` există în tabela `payments`.
- **T-APPR001-2** [blocant] Given: plată cu `amount_cents = 600000` și `par_request_id = null`, When: `PATCH /api/payments/:id` cu `{ status: "paid" }`, Then: 422 `{ error: "approval_required" }`.
- **T-APPR001-3** [blocant] Given: server pornit + auth valid + PAR aprobat, When: `POST /api/payments/:id/link-par` cu `{ par_request_id: <approved_par_id> }`, Then: 200 + `payments.par_request_id` actualizat.
- **T-APPR001-4** [blocant] Given: PAR cu `status = 'pending_approval'` (nu aprobat), When: `POST /api/payments/:id/link-par`, Then: 422 `{ error: "par_not_approved" }`.
- **T-APPR001-5** [normal] Given: `PaymentApprovalBadge` randat cu `parRequestId = null` și `paymentAmountCents = 600000`, When: render, Then: badge „Aprobare necesară" vizibil fără crash.
- **T-APPR001-6** [normal] Given: plată cu `amount_cents = 400000` (sub prag), When: `PATCH /api/payments/:id` cu `{ status: "paid" }`, Then: actualizare OK (fără cerință aprobare).

## DoD

- Migrare 0117 commitată; `db:reset` trece.
- Validator blocat verificat prin test T-APPR001-2.
- Link-par flow verificat prin T-APPR001-3.
- `PaymentApprovalBadge` randează; dark mode; zero hardcoded hex.
- PR pe branch `feat/FIN-approval` (branch separat de multicurrency).
