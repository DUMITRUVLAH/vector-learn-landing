---
id: FIN-601
title: "Facturi PDF cu serie incrementală + UI /app/invoices"
milestone: FIN
phase: "1 — Invoices"
priority: P0
slug: invoices
depends_on: [MVP-007, CRM-113]
status: pending
---

# FIN-601 — Facturi PDF cu serie incrementală

## Goal

Fiecare plată devine o factură cu serie incrementală (`VECT-2026-0001`), număr auto-calculat
per tenant. Directoarea descarcă PDF-ul sau îl trimite prin email cu un click. Baza pune
temeliul pentru reconciliere (FIN-602) și e-Factura (FIN-604).

## In scope

- Schema nouă `invoices`:
  - `id`, `tenant_id`, `payment_id` (FK → payments), `student_id` (FK → students)
  - `series` VARCHAR(20) (configurabil, default "VECT"), `number` INTEGER (counter per tenant)
  - `invoice_number` VARCHAR(30) GENERATED AS `series || '-' || YYYY || '-' || LPAD(number, 4, '0')`
    (stored in column as varchar, not computed — set on INSERT by server)
  - `amount_cents`, `currency`, `issue_date`, `due_date`
  - `status`: `draft | issued | paid | cancelled`
  - `pdf_key` VARCHAR(500) — path în local storage / S3 (dacă env STORAGE_PATH setat)
  - `notes` TEXT
  - `created_at`, `updated_at`
- Migrare `0011_fin601_invoices.sql`
- `GET /api/invoices` — listă facturi tenant-scoped, cu join student name + payment status
- `POST /api/invoices` — creează factură; auto-incrementează counter per tenant (SELECT MAX(number)+1 WHERE tenant_id)
- `GET /api/invoices/:id/pdf` — generează HTML→text PDF stub (nu necesită wkhtmltopdf); returnează JSON cu `{ invoiceNumber, html }` — frontend poate printa cu `window.print()`
- `PATCH /api/invoices/:id` — update status (draft→issued, issued→paid, issued→cancelled)
- Pagina `/app/invoices`:
  - Tabel cu coloane: Nr. factură, Client, Sumă, Status, Data emisă, Acțiuni (Download / Mark Paid)
  - Badge culori per status (draft=gray, issued=blue, paid=green, cancelled=red)
  - Buton „Crează factură" → modal: selectează payment existent sau introdu manual
  - Buton „Descarcă PDF" → deschide printable HTML în tab nou (`/api/invoices/:id/pdf`)
  - Filtru: status + luna (date range picker simplu)
- Tenant isolation obligatorie: toate query-urile filtrează pe `tenant_id`

## Out of scope

- Stripe integration (FIN-603)
- e-Factura XML (FIN-604)
- Bulk invoice generation (US-PAY-10) — rămâne viitor
- SAGA/1C export

## User stories

- US-PAY-07: Factură PDF cu serie
- US-PAY-03: Marcare ca plătit (din invoices UI)

## Acceptance criteria

- [ ] Tabel `invoices` creat, migrare 0011 commitată
- [ ] `POST /api/invoices` → 201 cu `invoiceNumber` de forma VECT-2026-XXXX
- [ ] Counter autoincrement: 2 facturi consecutive → numere consecutive
- [ ] `GET /api/invoices` → 200, array tenant-scoped cu studentName
- [ ] `GET /api/invoices/:id/pdf` → 200 cu câmpul `html` conținând datele facturii
- [ ] `PATCH /api/invoices/:id` status draft→issued → 200
- [ ] Pagina `/app/invoices` randează lista, badge status, buton creare, buton PDF
- [ ] Dark mode: badges și tabel vizibile în ambele teme
- [ ] Zero hardcoded hex — semantic tokens Vector 365

## Files

### New
- `server/db/schema/invoices.ts`
- `server/routes/invoices.ts`
- `src/pages/InvoicesPage.tsx`
- `src/components/invoices/InvoiceTable.tsx`
- `src/components/invoices/CreateInvoiceModal.tsx`
- `drizzle/0011_fin601_invoices.sql`

### Modified
- `server/db/schema/index.ts` — export invoices
- `server/index.ts` — mount `/api/invoices`
- `src/router.tsx` — add `/app/invoices` route
- `src/components/Sidebar.tsx` (sau NavBar) — link „Facturi"

## Tests

**Given/When/Then — §3.5.1 gates obligatorii**

1. [blocant] Migration gate: `db:generate` nu lasă fișiere uncommitted; `db:reset && db:seed` succed
2. [blocant] POST /api/invoices cu `{ paymentId, studentId, amountCents: 15000, currency: "RON" }` → 201, `invoiceNumber` matches regex `/^VECT-\d{4}-\d{4}$/`
3. [blocant] Al doilea POST → number = first.number + 1 (counter increment)
4. [blocant] GET /api/invoices → 200, array cu obiectele create, `studentName` prezent
5. [blocant] GET /api/invoices/:id/pdf → 200, câmpul `html` conține `invoiceNumber`
6. [blocant] PATCH /api/invoices/:id `{ status: "issued" }` → 200, status updated
7. [blocant] GET /api/invoices cu alt tenant → 0 rezultate (isolation)
8. [normal] PATCH status → cancelled pe factură deja cancelled → 409 sau 422
9. [normal] InvoicesPage renders fără crash în Vitest + @testing-library
10. [normal] Badge „issued" are clasa de culoare corectă (blue token)

## DoD

- Toate criteriile [blocant] verzi
- Reviewer APPROVED + integration-architect CONNECTED
- Persona reports salvate
- PR deschis pe `feat/FIN-601-invoices`
