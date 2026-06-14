---
id: MASS-002
title: "Facturi recurente bulk: AGREEMENT→BILL→EINV job async + UI"
milestone: FIN
phase: "15"
status: pending
depends_on: [MASS-001, AGREEMENT-001, BILL-001, EINV-001]
spec: backlog/specs/MASS-002.md
branch: feat/FIN-mass
---

## Goal

Implementează generarea în masă a facturilor recurente dintr-un singur click, orchestrând
modulele existente: contracte active (`fin_agreements`) → facturi B2B (`fin_invoices`) → 
trimitere e-Factura SFS (`fin_einvoices`). Job-ul rulează asincron folosind runner-ul din
MASS-001, cu raport per rând și re-try automat (FIN-CORE §1.15).

Fluxul:
1. Directorul apasă "Generează facturi recurente" în `/app/fin/mass`
2. Sistemul identifică toate `fin_agreements` cu `status='active'` și cel puțin un
   `fin_agreement_services` cu `next_bill_date ≤ azi`
3. Se creează un job `fin_bulk_jobs` cu `job_type='recurring_invoices'`
4. Se creează câte un `fin_bulk_rows` per contract eligibil
5. Runner-ul procesează asincron: pentru fiecare contract → creează `fin_invoice` +
   `fin_invoice_lines` + (opțional) trimite `fin_einvoice` via SFS mock
6. Actualizează `fin_agreement_services.last_billed_at` și `next_bill_date`
7. Pagina `/app/fin/mass` afișează lista job-urilor cu progres și raport per rând

---

## User stories

- Ca **director financiar**, vreau să generez toate facturile recurente ale lunii cu un singur
  click, pentru că nu vreau să creez manual câte o factură per contract activ.
- Ca **contabil**, vreau să văd un raport per contract (success/fail + mesaj) după job,
  pentru că pot identifica și rezolva rapid cazurile eșuate.
- Ca **sistem**, vreau ca generarea să fie idempotentă (nu duplică facturi pentru contracte
  deja facturate în luna curentă), pentru că un re-run nu trebuie să creeze duplicate.
- Ca **director**, vreau ca job-ul să trimită automat e-Facturile SFS pentru facturile generate
  (dacă SFS este configurat), pentru că vreau să minimizez pașii manuali.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/mass/recurring-invoices` (autentificat, rol `admin|accountant`):
  - Identifică `fin_agreements` cu `status='active'` ale tenantului curent care au cel puțin
    un `fin_agreement_services` cu `is_active=true` și `next_bill_date <= today`
  - Creează `fin_bulk_jobs` cu `job_type='recurring_invoices'`,
    `meta.period` = luna curentă (YYYY-MM), `meta.include_einv` = boolean din request body
  - Creează `fin_bulk_rows` câte unul per contract eligibil, cu `external_ref = agreement_id`
  - Lansează procesarea asincron (fără a bloca request-ul): returnează imediat `{ jobId, totalRows }`
  - Idempotent: dacă există deja o `fin_invoice` creată pentru acel `agreement_id` în luna
    curentă (`issued_at` sau `created_at` în luna respectivă), rândul se marchează `skipped`

- [ ] AC2: Procesorul async (apelat de `runBulkJob`):
  - Pentru fiecare `fin_bulk_rows` cu `status='pending'`:
    1. Fetch agreement + services din DB
    2. Creează `fin_invoice` cu total calculat (sumă `unit_price_cents × quantity` per linie)
    3. Creează `fin_invoice_lines` per `fin_agreement_services`
    4. Dacă `meta.include_einv=true`: creează `fin_einvoice` cu `sfs_status='pending'`;
       apelează SFS mock (`SubmitInvoice`) — dacă e mock mode, marchează `sfs_status='accepted'`
    5. Actualizează `fin_agreement_services.last_billed_at=now()` și
       `next_bill_date = next_bill_date + 1 lună|trimestru|an` (după `recurrence_period`)
    6. Marchează rândul `status='success'`, `result_ref=invoiceId`
  - La eroare: salvează `error_message` pe rând, retry automat (MASS-001 runner, max 3x)

- [ ] AC3: `GET /api/fin/mass/jobs?limit=20&offset=0` → listă job-uri ale tenantului (descending by created_at).
  Răspuns: `{ jobs: FinBulkJob[], total: number }`.

- [ ] AC4: `GET /api/fin/mass/jobs/:jobId` → detalii job + toate rândurile.
  Răspuns: `{ job: FinBulkJob, rows: FinBulkRow[] }`.

- [ ] AC5: Rută montată în `server/app.ts`: `app.route("/api/fin/mass", finMassRoutes)`.

- [ ] AC6: Pagina `/app/fin/mass` (React):
  - Card „Generează facturi recurente" cu buton + checkbox „Include e-Factura SFS"
  - Tabel job-uri: tip, dată, status (badge colorat), total/success/fail/skipped, acțiuni
  - La click pe job → modal sau secțiune expandată cu rândurile (contract ID, status, mesaj)
  - Badge-uri: `done`=verde, `running`=galben, `failed`=roșu, `pending`=gri
  - Pollingul paginii: refresh automat la 3s dacă există un job cu `status='running'`
  - Link din nav `/app/fin` → `/app/fin/mass`

- [ ] AC7: Design system tokens (fără hex hardcodat). Light + dark mode. WCAG AA (contrast ≥ 4.5:1, touch targets ≥ 44px).

- [ ] AC8: Tenant isolation — nicio query nu returnează date din alt tenant.

- [ ] AC9: Banii în cenți (FIN-CORE regula #10). Calcule exacte integer.

---

## Files to create / modify

**Create:**
- `server/routes/finMass.ts` — Hono router: POST /recurring-invoices, GET /jobs, GET /jobs/:jobId
- `server/lib/finRecurringProcessor.ts` — funcție procesor: agreement → invoice + lines + einv
- `src/pages/fin/FinMassPage.tsx` — pagina bulk operations
- `src/lib/api/finMass.ts` — client API tipizat
- `src/__tests__/fin/fin-mass.test.ts` — teste unit/integrare
- `server/__tests__/fin-mass.routes.test.ts` — teste rute

**Modify:**
- `server/app.ts` — mount `finMassRoutes` la `/api/fin/mass`
- `src/App.tsx` — adaugă ruta `/app/fin/mass` → `FinMassPage`
- `src/pages/fin/FinLayoutOrNav.tsx` (sau echivalent) — link spre Mass dacă există nav fin

---

## Tests

- **T-MASS-002-1** `[blocant]` Given 2 contracte active cu next_bill_date <= azi, When POST /recurring-invoices, Then job creat cu total_rows=2 și răspuns imediat cu jobId.
- **T-MASS-002-2** `[blocant]` Given job creat, When procesorul rulează pentru contract valid, Then fin_invoice + fin_invoice_lines create, rândul status='success'.
- **T-MASS-002-3** `[blocant]` Given contract deja facturat în luna curentă (fin_invoice există), When POST /recurring-invoices, Then rândul status='skipped' (nu duplică factura).
- **T-MASS-002-4** `[blocant]` Given tenant A, When GET /jobs cu token tenant B, Then 403 sau 0 job-uri din tenant A.
- **T-MASS-002-5** `[blocant]` API smoke: login + POST /api/fin/mass/recurring-invoices → 200 cu {jobId}.
- **T-MASS-002-6** [normal] GET /api/fin/mass/jobs → lista job-uri cu structura corectă (job_type, status, total_rows etc.).
- **T-MASS-002-7** [normal] UI: FinMassPage se randează fără crash; buton „Generează" vizibil.
- **T-MASS-002-8** [normal] Given include_einv=true și mock mode, When procesorul rulează, Then fin_einvoice creat cu sfs_status='accepted'.

---

## Definition of Done

- [ ] AC1–AC9 implementate
- [ ] T-MASS-002-1..5 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/app.ts montează /api/fin/mass
- [ ] FinMassPage accesibilă în nav
