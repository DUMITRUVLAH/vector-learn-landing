---
id: SPLIT-202
title: "PAR → FinDesk: PAR aprobat/plătit → cheltuială fin_expenses (source=par); UI link bidirecțional"
milestone: SPLIT
phase: "3"
depends_on: ["SPLIT-201"]
spec: "backlog/specs/SPLIT-202.md"
status: pending
attempts: 0
blockers: []
---

# SPLIT-202 — PAR → FinDesk: punte de plăți (PAR aprobat → cheltuială automată)

## Goal
Când un PAR trece în status `paid` (sau `approved` cu `purpose=execute_payment`), backend-ul creează automat (sau leagă) o înregistrare `fin_expenses` cu `source=par`. Adaugă coloana `par_request_id` pe `fin_expenses` și extinde enum-ul `fin_expense_source` cu valoarea `par`. UI FinDesk arată de unde vine cheltuiala; UI PAR arată cheltuiala legată.

## Reguli critice (§3.5.1quater)
- `ADD COLUMN IF NOT EXISTS par_request_id UUID NULL` pe `fin_expenses`.
- Extinderea enum-ului PostgreSQL: `ALTER TYPE fin_expense_source ADD VALUE IF NOT EXISTS 'par';`
- Ambele în migrarea `0147_split_par_findesk_bridge` (prefix > 146).
- `--> statement-breakpoint` între fiecare instrucțiune.
- Logica de creare cheltuiala este idempotentă (upsert pe `par_request_id` — nu duplicate).

## User stories
- Ca director financiar, vreau ca o cerere de plată aprobată să apară automat ca cheltuială în FinDesk, pentru că nu vreau să o introduc manual de două ori.
- Ca contabil, vreau să văd în cheltuiala FinDesk un link înapoi la PAR-ul sursă, pentru că audit-ul cere trasabilitate.
- Ca aprobator PAR, vreau să văd în dosarul PAR cheltuiala FinDesk creată, pentru că confirmă că plata a fost înregistrată.
- Ca CFO, vreau ca cheltuielile din PAR să fie marcate cu `source=par` în FinDesk, pentru că pot distinge cheltuielile aprobate formal de cele introduse manual.

## Acceptance criteria

### AC-1 Schema: coloana bridge + enum extins
- `fin_expenses.par_request_id UUID NULL` — migrare 0147 cu `ADD COLUMN IF NOT EXISTS`.
- `fin_expense_source` enum extins cu valoarea `'par'` — `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
- Schema Drizzle `finExpenses.ts` actualizată: câmp `parRequestId: uuid("par_request_id")` (nullable) și `'par'` adăugat în `finExpenseSourceEnum`.
- `_journal.json` entry idx 147. `db:reset && db:seed` ✓.

### AC-2 Hook backend: PAR paid → fin_expense auto-creat
- La `PATCH /api/par/requests/:id/status` cu `{ status: 'paid' }` (sau la tranziția `approved` când `purpose=execute_payment`):
  - Backend face upsert pe `fin_expenses` WHERE `par_request_id = <id>`:
    - `source = 'par'`
    - `amount_cents = par_requests.total_estimated_cents`
    - `currency = par_requests.currency`
    - `expense_date = par_requests.paid_at` (sau `approved_at`)
    - `vendor_name = par_requests.payee_name` (sau `par_vendors.name`)
    - `category = 'other'` (default — utilizatorul poate schimba ulterior în FinDesk)
    - `status = 'paid'`
    - `description = 'PAR ' || par_requests.request_no`
    - `tenant_id` = același tenant
  - Dacă `fin_expense` există deja pentru acest `par_request_id` → update (nu insert dublu).

### AC-3 API: citire cheltuiala legată
- `GET /api/par/requests/:id` include câmpul `fin_expense_id` (id-ul cheltuielii FinDesk create, sau null).
- `GET /api/fin/expenses/:id` include câmpul `par_request_id` (sau null) + `par_request_no` (denormlizat pentru afișare).

### AC-4 UI PAR: afișare cheltuiala FinDesk legată
- Pagina de detaliu PAR (`/business/par/:id`) — secțiunea „Plată" sau „FinDesk" afișează:
  - Dacă cheltuiala există: link „Cheltuiala FinDesk: EXP-XXXX" → `/business/fin/expenses/:fin_expense_id`.
  - Dacă nu există (PAR nu e plătit): „—".

### AC-5 UI FinDesk: afișare sursă PAR
- Pagina cheltuiala FinDesk (`/business/fin/expenses/:id`) — câmp „Sursă" afișează:
  - Pentru `source=par`: badge „PAR" + link „PAR-2026-0001" → `/business/par/:par_request_id`.
  - Pentru alte surse: comportament existent neatins.

### AC-6 Idempotență
- Dacă PAR e marcat `paid` de două ori (retry/bug) → a doua rulare a hookului nu creează o a doua cheltuiala; face update la cea existentă.

## Files to touch
- `server/db/schema/finExpenses.ts` — add `parRequestId` field + `'par'` in enum
- `drizzle/0147_split_par_findesk_bridge.sql` — migration
- `drizzle/meta/_journal.json` — append idx 147
- `server/routes/par.ts` — modify status PATCH handler to trigger fin_expense upsert
- `server/routes/fin.ts` (sau fin-expenses route) — include `par_request_id` in expense GET
- `src/pages/business/par/ParDetailPage.tsx` (sau echivalent) — add FinDesk link section
- `src/pages/business/fin/ExpenseDetailPage.tsx` (sau echivalent) — add PAR badge/link

## Tests
- **T-202-1** [blocant] Given schema migrată (0147), When `SELECT column_name FROM information_schema.columns WHERE table_name='fin_expenses' AND column_name='par_request_id'`, Then 1 rând.
- **T-202-2** [blocant] Given PAR cu status `approved` și `purpose=execute_payment`, When `PATCH /api/par/requests/:id/status { status: 'paid' }`, Then `fin_expenses` conține un rând cu `par_request_id = :id` și `source = 'par'`.
- **T-202-3** [blocant] Given cheltuiala creată (T-202-2), When aceeași operație repetată, Then tot 1 rând în `fin_expenses` (nu duplicate).
- **T-202-4** [blocant] Given `db:reset && db:seed`, When seed, Then fără erori.
- **T-202-5** [normal] Given PAR plătit, When `GET /api/par/requests/:id`, Then răspuns include `fin_expense_id` nenull.
- **T-202-6** [normal] Given cheltuiala cu `source=par`, When pagina detaliu cheltuiala FinDesk, Then badge „PAR" și link către PAR sursă sunt vizibile.

## DoD
- [ ] Migrare 0147 commitată, `_journal.json` actualizat
- [ ] Schema Drizzle `finExpenses.ts` actualizată (enum + câmp)
- [ ] Hook backend PAR paid → upsert fin_expenses
- [ ] UI: link bidirecțional PAR ↔ cheltuiala FinDesk
- [ ] `db:reset && db:seed` ✓
- [ ] Reviewer APPROVED, integration-architect CONNECTED
- [ ] Persona reports salvate
