---
id: CASH-003
title: "Alocare plată↔factură + credit nealocat per client + coada nepotrivite"
milestone: FIN
phase: "9"
status: pending
depends_on: [CASH-002, BILL-002]
spec: backlog/specs/CASH-003.md
branch: feat/FIN-cash
---

## Goal

Implementează motorul de alocare plată↔factură: o plată poate acoperi parțial sau total
una sau mai multe facturi; creditul rămas nealocat se calculează și expune per client.
Coada „nepotrivite" devine acționabilă: contabilul poate aloca manual o tranzacție bancară
la o plată existentă sau la una nouă, sau o poate marca ca `ignored`.

Nicio stocare redundantă: `fin_payments.allocated_cents` este suma din `fin_payment_allocations`
și se actualizează atomic la fiecare operație de alocare/dealocare.

---

## User stories

- Ca **contabil**, vreau să aloc o plată la una sau mai multe facturi, pentru că o singură plată acoperă frecvent mai multe servicii.
- Ca **contabil**, vreau să văd creditul nealocat per client (plăți primite dar neapliciate), pentru că altfel nu știu pe cine pot factura suplimentar fără să cer bani în plus.
- Ca **director**, vreau ca suma alocată să nu depășească nici plata, nici factura, pentru că o alocare excedentară este o eroare contabilă.
- Ca **contabil**, vreau să pot dealoca o alocare greșită, pentru că erorile de operare se întâmplă și corectarea nu trebuie să implice suportul tehnic.

---

## Acceptance criteria

- [ ] `POST /api/fin/cash/payments/:paymentId/allocate` — alocă un `amount_cents` din plată la un `invoice_id`
  - Validare: `amount_cents > 0`, `amount_cents ≤ plată.unallocated_cents`, factură și plată aparțin aceluiași tenant
  - Creează rând în `fin_payment_allocations`
  - Actualizează atomic `fin_payments.allocated_cents += amount_cents`
  - Returnează plata actualizată cu `unallocated_cents` recalculat
- [ ] `DELETE /api/fin/cash/allocations/:allocationId` — șterge alocarea și scade `allocated_cents` din plată
- [ ] `GET /api/fin/cash/payments` — lista plăților cu `unallocated_cents = amount_cents − allocated_cents`
- [ ] `GET /api/fin/cash/payments/:id` — detalii plată cu lista alocărilor (`fin_payment_allocations`)
- [ ] `GET /api/fin/cash/credit-summary` — per `party_id`: total `unallocated_cents` agregat (credit nealocat per client)
- [ ] `POST /api/fin/cash/payments` — înregistrare manuală plată nouă (fără import bancar): `{ party_id?, received_date, amount_cents, currency, account_label?, notes? }`
- [ ] `POST /api/fin/cash/transactions/:id/ignore` — marchează tranzacție bancară ca `ignored`
- [ ] `POST /api/fin/cash/transactions/:id/create-payment` — crează plată nouă din tranzacție bancară nepotrivită (`unmatched → matched`, `fin_payments.bank_tx_id = txId`)
- [ ] Supraalocarea este imposibilă (HTTP 422 dacă `amount_cents > unallocated_cents`)
- [ ] Tenant isolation pe toate rutele

---

## Files to create / modify

**Create:**
- `server/routes/finCashAllocations.ts` — rutele de alocare `/api/fin/cash/payments/*` și `/api/fin/cash/allocations/*`
- `src/lib/api/finCashAllocations.ts` — hooks React Query + tipuri TypeScript
- `server/__tests__/finCash.allocations.test.ts` — unit tests motor alocare

**Modify:**
- `server/routes/finCash.ts` — adaugă `POST /transactions/:id/ignore` și `POST /transactions/:id/create-payment`
- `server/app.ts` — montează `finCashAllocationsRoutes` la `/api/fin/cash`
- `src/lib/api/finCash.ts` — adaugă `ignoreTransaction` și `createPaymentFromTx`

---

## Tests

- **T-CASH-003-1** [blocant] Given o plată de 500 MDL cu `allocated_cents=0`, When POST /api/fin/cash/payments/:id/allocate cu `{ invoice_id, amount_cents: 300 }`, Then răspuns 200 cu `unallocated_cents: 200` și rând nou în `fin_payment_allocations`.
- **T-CASH-003-2** [blocant] Given același scenariu, When se încearcă alocare de 300 MDL dintr-o plată cu doar 200 MDL disponibili, Then răspuns 422 cu eroare `insufficient_credit`.
- **T-CASH-003-3** [blocant] Given o alocare existentă de 300 MDL, When DELETE /api/fin/cash/allocations/:id, Then alocarea dispare și `fin_payments.allocated_cents` scade cu 300.
- **T-CASH-003-4** [blocant] Given server pornit + login, When GET /api/fin/cash/credit-summary, Then răspuns 200 cu array (nu `.rows`) cu `{ party_id, unallocated_cents }` — portabilitate DB.
- **T-CASH-003-5** [blocant] Given o tranzacție `unmatched`, When POST /api/fin/cash/transactions/:id/create-payment, Then plată nouă creată cu `bank_tx_id = txId` și tranzacția devine `matched`.
- **T-CASH-003-6** [normal] Given o tranzacție `unmatched`, When POST /api/fin/cash/transactions/:id/ignore, Then `match_status = ignored` și nu apare în coada `unmatched`.

---

## Definition of Done

- Acceptance criteria bifate
- Scenariile blocante T-CASH-003-1..5 verzi
- Ruta `finCashAllocationsRoutes` montată în `server/app.ts`
- Design tokens, light+dark, WCAG AA
- Raport persona-manager + persona-student salvat
- Commit pe `feat/FIN-cash`
