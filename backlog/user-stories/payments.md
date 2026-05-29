# Payments — User Stories

## US-PAY-01: Listă plăți cu status
**As a** Recepționer, **I want to** văd toate plățile cu status (pending/paid/overdue), **so that** focusez follow-up pe restanțe.
- **Status**: done ✅ (MVP-007)
- **Priority**: P0

## US-PAY-02: Creare plată manuală
**As a** Recepționer, **I want to** înregistrez o plată cash, **so that** istoricul e complet.
- **Status**: done ✅ (MVP-007)
- **Priority**: P0

## US-PAY-03: Marcare ca plătit
**As a** Recepționer, **I want to** marchez o factură ca plătită când părintele a plătit cash, **so that** dispare din lista de restanțe.
- **Status**: done ✅ (MVP-007)
- **Priority**: P0

## US-PAY-04: Stats luna curentă (paid / pending / overdue)
**As a** Director, **I want to** văd venitul lunii și restanțele, **so that** îmi dau seama de cashflow.
- **Status**: done ✅ (MVP-007 — /stats endpoint)
- **Priority**: P0

## US-PAY-05: Integrare Stripe pentru card
**As a** Părinte, **I want to** plătesc cu cardul direct dintr-un email, **so that** nu mai dau cash la recepție.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Stripe account connect per tenant
  - [ ] Generare Payment Link per factură
  - [ ] Webhook `payment_intent.succeeded` → marchează paid
  - [ ] Fallback la card declined

## US-PAY-06: Abonamente recurente Stripe
**As a** Manager, **I want to** Stripe încasează automat pe 1 a lunii, **so that** nu mai chem părinții să plătească.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Stripe Subscription cu billing_cycle
  - [ ] Webhooks invoice.payment_succeeded / failed
  - [ ] Retry logic (zi+3, +5, +7)
  - [ ] Email notification părinte

## US-PAY-07: Factură PDF cu serie
**As an** Accountant, **I want to** sistemul generează facturi PDF cu serie incrementală (VECT-2026-0142), **so that** sunt conforme ANAF.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Template HTML → PDF
  - [ ] Serie configurabilă în settings
  - [ ] Counter atomic per tenant
  - [ ] Download din UI

## US-PAY-08: e-Factura ANAF (UBL 2.1)
**As an** Accountant, **I want to** sistemul trimite e-Factura în SPV-ANAF automat, **so that** sunt conform OUG 120/2021.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Setup credentiale SPV per tenant
  - [ ] XML UBL 2.1 generat din invoice
  - [ ] Trimitere via REST API ANAF
  - [ ] Status sync (accepted/rejected)
  - [ ] Notificare la error

## US-PAY-09: Plată cu QR (BT Pay, BCR, Revolut)
**As a** Părinte, **I want to** scanez QR și plătesc instant cu bankin app-ul meu, **so that** nu mai introduc IBAN.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Generare QR conform standard EPC069-12 (sau MyEU)
  - [ ] Display QR în factură PDF + portal
  - [ ] Reconciliere manuală cu extras bancar inițial

## US-PAY-10: Bulk invoice generation
**As an** Admin, **I want to** generez facturile lunii pentru toți elevii activi cu un click, **so that** nu fac 200 manual.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Generate monthly invoices" în /app/payments
  - [ ] Confirm cu count + total
  - [ ] Background job
  - [ ] Email per părinte cu link plată

## US-PAY-11: Reminder restanțe automat
**As a** Manager, **I want to** sistemul trimite WhatsApp/email la 3/7/14 zile de la scadență, **so that** nu mai sun individual.
- **Status**: backlog
- **Priority**: P0

## US-PAY-12: Suspendare acces lecții online la 21 zile restanță
**As an** Owner, **I want to** elevii cu restanță >21 zile pierd accesul la lecții online, **so that** îi forțez să plătească.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Configurabil per centru (toggle + threshold)
  - [ ] Notificare clară părinte cu 3 zile înainte
  - [ ] Unblock instant la plată

## US-PAY-13: Refund
**As a** Manager, **I want to** rambursez o plată (parțial sau complet), **so that** gestionez complaint-uri.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Refund" pe plata paid
  - [ ] Stripe refund API
  - [ ] Audit log + motiv

## US-PAY-14: Multi-currency cu cursul BNR
**As a** Director cu profesori în diaspora, **I want to** plătesc unii în USD/EUR, alții în RON, **so that** acoperă realitatea.
- **Status**: partial done ✅ (MVP-002 schema include currency)
- **Priority**: P1
- **Acceptance**:
  - [ ] Cron zilnic 09:00 fetch curs BNR
  - [ ] Conversie la display, păstrare în currency originar
  - [ ] Raport consolidat în RON

## US-PAY-15: Split TVA
**As an** Accountant, **I want to** sistemul gestionează split-ul TVA corect, **so that** sunt conform legii RO.
- **Status**: backlog
- **Priority**: P1

## US-PAY-16: Salariu profesor calculat & marcat
**As an** Admin, **I want to** salariile generate să apară în /payments ca outgoing, **so that** am cashflow real.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `payouts` paralel cu payments (intrări)
  - [ ] Stats agregate: net = paid - payouts

## US-PAY-17: Plan de plată în rate
**As a** Părinte cu cash flow strâns, **I want to** plătesc cursul în 3 rate, **so that** îmi permit.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Toggle "Pay in installments" la create
  - [ ] Auto-generate N payments cu due_date diferite

## US-PAY-18: Export contabilitate (1C / SAGA)
**As an** Accountant, **I want to** export plățile lunii în format SAGA, **so that** import direct fără re-tastare.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Export XML/CSV pe format SAGA/1C
  - [ ] Mapping articol contabil configurabil

## US-PAY-19: Apple Pay / Google Pay
**As a** Părinte pe mobil, **I want to** plătesc cu Apple Pay, **so that** nu introduc cardul.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Stripe Payment Element cu Apple/Google Pay activat

## US-PAY-20: Dispute & chargeback handling
**As a** Manager, **I want to** primesc alert la chargeback Stripe, **so that** răspund cu evidence.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Webhook `charge.dispute.created`
  - [ ] UI cu istoric dispute + buton "Submit evidence" (auto-populate cu factura + atendence)
