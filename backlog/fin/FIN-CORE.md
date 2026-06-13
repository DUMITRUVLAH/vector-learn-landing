# FinDesk — CORE (sursa de adevăr a comportamentului)

> **Ce este FinDesk.** SaaS B2B de finanțe + automatizare pentru firme din Moldova/România: un strat
> operațional care leagă **clienți → contracte → facturi → e-Factura SFS → plăți/reconciliere →
> taxe → salarii → mijloace fixe → rapoarte**, AI-native (OCR + narativ) și cu **contabilitate
> reală** (declarații, salarii, amortizare) — exact golurile pe care concurenții locali (contafirm.md,
> sirius.expert) NU le acoperă. Vezi [CONTAFIRM-ANALYSIS.md](CONTAFIRM-ANALYSIS.md),
> [SIRIUS-ANALYSIS.md](SIRIUS-ANALYSIS.md), [FIN-RESEARCH.md](FIN-RESEARCH.md),
> [FIN-FLOW-TEST.md](FIN-FLOW-TEST.md).
>
> **Acesta este contractul de comportament.** Fiecare item `<COD>-xxx` se construiește ca să respecte
> acest document. Dacă o implementare diferă de CORE, se actualizează CORE în același PR (CLAUDE.md §0.2).

> **Reuse, don't rebuild (CLAUDE.md §3.7).** FinDesk e o zonă NOUĂ în repo-ul Vector Learn existent.
> REFOLOSEȘTE platforma:
> - **Auth / sesiuni / 2FA / roluri** — `server/middleware/requireAuth.ts`, `users`, `sessions`.
> - **Multi-tenant** — fiecare rând poartă `tenant_id` (firma). Copiază pattern-ul
>   `eq(table.tenantId, c.get("user").tenantId)` din `server/routes/invoices.ts`.
> - **DB** — Drizzle ORM, PGlite local / Postgres (Supabase) prod. Disciplină migrări §3.5.1.
> - **Facturi / plăți / salarii / plan de conturi** — `invoices.ts`, `payments.ts`,
>   `paymentAccounts.ts`, `payroll.ts`, `accounting.ts`, `accountingMappings.ts`.
> - **e-Factura SFS** — clientul SOAP din integrarea existentă (`server/routes/par.ts` SFS + `parPdf`).
> - **AI** — `ai.ts`, `aiAuditLog.ts`, `aiFeatureFlags.ts`, `aiSettings.ts` (cost + audit + flags).
> - **PDF** — `src/lib/paymentAccountPdf.ts` / `parPdf.ts` (html2canvas → A4, diacritice corecte).
> - **Notificări** — `notifications`, `inAppNotifications`. **Audit** — `auditLog`.
> - **Design system** — Vector 365 (`src/index.css`), tokeni semantici, light + dark, WCAG AA.
>
> Tabelele noi trăiesc în `server/db/schema/fin*.ts` (+ `export * from` în `schema/index.ts`, ACELAȘI
> commit — §3.5.1). Rutele noi se montează în `server/app.ts` (ACELAȘI commit — route-mount rule).
> Frontend sub `/app/fin/*`.
>
> **ATENȚIE — coexistență cu facturarea existentă (anti `COMPETING_SYSTEM`).** Repo-ul are deja
> `invoices.ts` (facturi legate de `students` — context educațional/CRM) + `recurring.ts` +
> `invoiceReminders.ts` din FIN-601..604 (`done`). FinDesk e facturare **B2B generică (firmă→partener,
> fără student)** — un context DIFERIT, nu o redublare. Tabelele FinDesk se numesc `fin_invoices`
> (NU `invoices`) tocmai ca să coexiste. Unde logica e identică (numerotare, reminder, PDF, recurring),
> **extrage helperi comuni și refolosește**, nu copia. Integration-architect trebuie să confirme
> `CONNECTED`, nu `COMPETING_SYSTEM`. Migrările pornesc de la prefixul `> max(origin/main)` la momentul
> build-ului (la 2026-06-13 main e la `0114`; e-Factura `0115` e încă pe branch nemerged — renumerotează
> dacă se merge înainte).

---

## 0. Glosar & denumiri proprii (NU le numi ca la concurenți)

Owner-ul nu vrea să pară copiat. Codurile interne de modul și denumirile UI proprii:

| Cod | Denumire UI (RO) | Acoperă |
|-----|------------------|---------|
| `CORE` | Compania mea | workspace, profil fiscal, serie, roluri, onboarding |
| `REGISTRY` | Cote & nomenclatoare | cote fiscale versionate, plan de conturi |
| `PARTY` | Parteneri | clienți + furnizori (CRM financiar) |
| `AGREEMENT` | Acorduri | contracte + servicii recurente |
| `BILL` | Facturi | emitere + creanțe (AR) |
| `EINV` | e-Factura | integrare SFS Moldova |
| `SPEND` | Cheltuieli | cheltuieli + furnizori (AP) |
| `CAPTURE` | Documente AI | OCR + extragere AI |
| `CASH` | Încasări | plăți + reconciliere bancară |
| `FISC` | TVA & declarații | calcul TVA + declarații |
| `PAY` | Salarii | salarizare + angajați |
| `ASSET` | Mijloace fixe | active + amortizare |
| `INSIGHT` | Tablou de bord | dashboard + narativ AI |
| `CALENDAR` | Calendar fiscal | termene + conformitate + period close |
| `MASS` | Operațiuni în masă | bulk |
| `TRUST` | Securitate | audit + anonimizare + GDPR |

---

## 1. Modelul de date (toate tabelele, cu coloane reale)

> Convenții comune (TOATE tabelele): `id uuid pk default gen_random_uuid()`,
> `tenant_id uuid not null → tenants(id) on delete cascade`, `created_at`, `updated_at` (timestamptz).
> Bani: ÎNTOTDEAUNA `*_cents integer` + `currency text default 'MDL'` (NICIODATĂ float). Index pe
> `tenant_id` + pe FK-urile interogate des. Fișiere schema: grupate logic (`finCore.ts`, `finParty.ts`,
> `finBilling.ts`, `finSpend.ts`, `finFisc.ts`, `finOps.ts`).

### 1.1 CORE — `finCore.ts`
- **`fin_org_profile`**: `legal_name`, `idno` (cod fiscal MD/RO), `country enum(MD|RO)`,
  `vat_regime enum(payer|non_payer)`, `vat_number` nullable, `base_currency text default 'MDL'`,
  `address`, `logo_url`, `fiscal_year_start int default 1`. (1 rând / tenant.)
- **`fin_invoice_series`**: `prefix text` (ex. `VEGA-2026-`), `next_number int default 1`,
  `pad_width int default 4`, `doc_type enum(invoice|proforma|receipt)`, `is_default bool`.
- **`fin_members`**: `user_id → users`, `role enum(owner|accountant|cfo|viewer)`,
  `permissions jsonb` (override granular). Mapping user↔rol în workspace-ul FinDesk.
- **`fin_onboarding`**: `step enum(company|parties|first_invoice|done)`, `completed_steps jsonb`,
  `started_at`, `completed_at`. (Tur de onboarding <10 min.)

### 1.2 REGISTRY — `finCore.ts`
- **`fin_tax_rates`**: `country enum(MD|RO)`, `kind enum(vat_standard|vat_reduced|vat_zero|
  income_tax|cas|cass|salary_income_tax)`, `value_bp int` (basis points: 20% = 2000),
  `effective_from date`, `effective_to date` nullable, `note`. **Versionat — niciodată hardcodat.**
- **`fin_chart_of_accounts`**: `code text`, `name text`, `kind enum(asset|liability|equity|income|
  expense)`, `country`, `parent_code` nullable. Seed per țară.

### 1.3 PARTY — `finParty.ts`
- **`fin_parties`**: `kind enum(client|supplier|both)`, `legal_name`, `idno` nullable,
  `vat_number` nullable, `segment text` nullable, `default_currency`, `email`, `phone`, `address`,
  `notes`, `is_active bool default true`. (Model unificat client+furnizor.)
- **`fin_party_contacts`**: `party_id → fin_parties`, `name`, `role`, `email`, `phone`.
- *Derivate (calculate, nu stocate):* venit cumulat, sold restant, aging — din `BILL`/`CASH`.

### 1.4 AGREEMENT — `finBilling.ts`
- **`fin_agreements`**: `party_id → fin_parties`, `title`, `type enum(recurring|one_time)`,
  `status enum(active|on_hold|expired|cancelled)`, `start_date`, `end_date` nullable,
  `currency`, `notes`.
- **`fin_agreement_services`**: `agreement_id`, `name` (ex. „Hosting"), `unit_price_cents`,
  `quantity numeric`, `vat_rate_kind` (→ `fin_tax_rates`), `recurrence enum(monthly|quarterly|yearly|
  none)`, `next_bill_date` nullable. (Reține „ce se facturează și când".)

### 1.5 BILL — `finBilling.ts`
- **`fin_invoices`**: `party_id`, `agreement_id` nullable, `series_id`, `number text` (din serie),
  `doc_type enum(invoice|proforma|receipt)`, `issue_date`, `due_date`, `currency`,
  `status enum(draft|issued|partially_paid|paid|overdue|cancelled)`,
  `subtotal_cents`, `vat_cents`, `total_cents`, `paid_cents default 0`, `language enum(ro|ru|en)`,
  `signature_url` nullable, `pdf_url` nullable, `notes`.
- **`fin_invoice_lines`**: `invoice_id`, `description`, `quantity numeric`, `unit_price_cents`,
  `vat_rate_kind`, `vat_cents`, `line_total_cents`.
- **`fin_invoice_reminders`**: `invoice_id`, `sent_at`, `channel enum(email|in_app)`, `kind`.

### 1.6 EINV — `finBilling.ts`
- **`fin_einvoices`**: `invoice_id → fin_invoices`, `sfs_status enum(pending|sent|accepted|rejected|
  error)`, `sfs_uuid` nullable, `environment enum(mock|test|prod)`, `last_test_at`, `payload_xml`
  nullable, `error_message` nullable, `income_tax_estimate_cents`, `vat_estimate_cents`.
- **`fin_sfs_settings`**: `api_user` (criptat AES-256-GCM), `api_secret` (criptat),
  `environment`, `connected bool`, `last_test_at`, `last_test_ok bool`.

### 1.7 SPEND — `finSpend.ts`
- **`fin_expenses`**: `supplier_party_id → fin_parties` nullable, `category enum(salaries|taxes|
  office|software|rent|travel|internal_transfer|depreciation|other)`, `description`,
  `expense_date`, `currency`, `net_cents`, `vat_cents`, `total_cents`, `vat_deductible bool default
  true`, `status enum(pending|paid)`, `source enum(manual|capture|payroll|asset)`,
  `source_ref uuid` nullable (link la salariu/activ care a generat-o).
- **`fin_expense_attachments`**: `expense_id`, `file_url`, `kind`.

### 1.8 CAPTURE — `finSpend.ts`
- **`fin_captures`**: `file_url`, `mime`, `status enum(uploaded|extracted|confirmed|rejected)`,
  `extracted jsonb` (vendor/date/amount/vat/iban/category + confidence per field),
  `ai_model`, `ai_cost_cents`, `confirmed_expense_id` nullable. (Mereu propunere → confirmare om.)

### 1.9 CASH — `finBilling.ts`
- **`fin_bank_transactions`**: `account_label`, `tx_date`, `amount_cents`, `currency`, `reference`,
  `counterparty`, `direction enum(in|out)`, `import_batch_id`, `match_status enum(unmatched|matched|
  duplicate|ignored)`.
- **`fin_payments`**: `party_id`, `received_date`, `amount_cents`, `currency`, `account_label`,
  `allocated_cents default 0`, `bank_tx_id` nullable.
- **`fin_payment_allocations`**: `payment_id`, `invoice_id`, `amount_cents`. (Surplus payment −
  Σ alocări = **credit nealocat** per client, derivat.)

### 1.10 FISC — `finFisc.ts`
- **`fin_tax_periods`**: `period text` (ex. `2026-05`), `country`, `vat_collected_cents`,
  `vat_deductible_cents`, `vat_payable_cents`, `income_tax_cents`, `status enum(open|computed|filed)`,
  `computed_at`, `filed_at`.
- **`fin_tax_declarations`**: `period_id`, `kind enum(tva12|d394|d301|other)`, `payload jsonb`,
  `pdf_url`, `generated_at`.

### 1.11 PAY — `finFisc.ts`
- **`fin_employees`**: `full_name`, `idnp` nullable, `position`, `base_salary_cents`, `currency`,
  `is_active bool`, `hired_at`, `terminated_at` nullable.
- **`fin_payroll_runs`**: `period text`, `status enum(draft|computed|paid)`, `total_gross_cents`,
  `total_net_cents`, `total_contributions_cents`, `expense_id` nullable (cheltuiala postată).
- **`fin_payroll_items`**: `run_id`, `employee_id`, `gross_cents`, `cas_cents`, `cass_cents`,
  `income_tax_cents`, `net_cents`. (Calcul determinist din `fin_tax_rates`.)

### 1.12 ASSET — `finFisc.ts`
- **`fin_assets`**: `name`, `acquisition_date`, `acquisition_cost_cents`, `useful_life_months int`,
  `method enum(linear|degressive)`, `salvage_cents default 0`, `status enum(active|disposed)`,
  `disposed_at` nullable.
- **`fin_depreciation_entries`**: `asset_id`, `period text`, `amount_cents`, `expense_id` nullable
  (cheltuiala postată automat).

### 1.13 INSIGHT — `finOps.ts`
- **`fin_saved_views`**: `name`, `config jsonb` (filtre/perioadă/widget-uri), `owner_user_id`.
- **`fin_narratives`**: `period`, `kind enum(monthly|board|budget_variance)`, `text`,
  `source_metrics jsonb` (cifrele reale citate), `ai_model`, `generated_at`.

### 1.14 CALENDAR — `finOps.ts`
- **`fin_obligations`**: `kind enum(vat_return|payroll|income_tax|other)`, `country`, `period`,
  `due_date`, `status enum(pending|done|overdue)`, `source_ref uuid` nullable, `amount_cents` nullable.
- **`fin_period_locks`**: `period text`, `locked bool`, `locked_by`, `locked_at`. (Period close.)

### 1.15 MASS — `finOps.ts`
- **`fin_bulk_jobs`**: `kind enum(recurring_invoices|bulk_import|bulk_einvoice)`,
  `status enum(queued|running|done|failed)`, `total int`, `succeeded int`, `failed int`,
  `started_at`, `finished_at`, `params jsonb`.
- **`fin_bulk_rows`**: `job_id`, `row_index int`, `status enum(pending|ok|error)`, `error_message`,
  `result_ref uuid` nullable.

### 1.16 TRUST — reuse `auditLog` + `aiAuditLog`
- **`fin_data_settings`**: `anonymize_pii_for_ai bool default true`, `retention_months int`,
  `export_requested_at` nullable. (Audit AI și acțiuni → `aiAuditLog`/`auditLog` existente.)

---

## 2. Reguli transversale (NON-NEGOTIABLE — din testul de flow, [FIN-FLOW-TEST.md])

1. **TVA obligatoriu** pe fiecare linie de factură (`BILL`) și pe fiecare cheltuială (`SPEND`).
   Fără el, `FISC` (TVA de plată) e greșit. (Regula #1 din flow-test.)
2. **Cotele fiscale sunt un registru versionat** (`fin_tax_rates`, cu `effective_from`), partajat de
   `FISC` și `PAY`. NICIODATĂ hardcodate în `.tsx`/cod. (Regula #2.)
3. **Salariul calculat (`PAY`) postează automat o cheltuială** (`SPEND`, categoria `salaries`,
   `source=payroll`). Amortizarea (`ASSET`) la fel (`source=asset`). Anti dublă-introducere. (Regula #3.)
4. **Calculele sunt deterministe în COD** (TVA, salarii, amortizare). **AI doar extrage și
   narrează** — NU calculează cifre, NU le inventează. Orice cifră dintr-un narativ AI provine dintr-un
   query real (`fin_narratives.source_metrics`). (Regula #4 — workshop modul 08.)
5. **AI = accelerator peste o cale manuală.** `CAPTURE` (OCR) propune → om confirmă; reconcilierea
   automată are mereu coada „nepotrivite" pentru alocare manuală; SFS neconfigurat → `mock` mode.
   Niciun modul AI nu e singur punct de eșec.
6. **Tenant isolation** pe FIECARE query (`eq(table.tenantId, user.tenantId)`). Test obligatoriu
   per modul: un user din tenant A NU vede date din tenant B.
7. **Roluri:** `owner` (tot), `accountant` (creare/editare documente, calcule), `cfo` (citește tot +
   rapoarte/narativ), `viewer` (doar citește). Gating pe rută + UI.
8. **Period lock:** după închiderea unei perioade (`fin_period_locks`), documentele din ea devin
   imutabile (no edit/delete) — doar storno.
9. **Numerotare facturi** strict secvențială per serie, fără găuri (gap = problemă fiscală).
10. **Bani în cents + currency** peste tot. Conversii valutare explicite, niciodată implicite.

---

## 3. Fluxul end-to-end (validat în FIN-FLOW-TEST.md)
```
CORE (companie+serie+roluri) + REGISTRY (cote)
  → PARTY (client) → AGREEMENT (contract recurent) → BILL (factură) → EINV (SFS)
  → CASH (încasare+reconciliere → marchează factura plătită → credit nealocat)
  SPEND (cheltuieli) ← CAPTURE (OCR AI)
  FISC (TVA de plată = colectat[BILL] − deductibil[SPEND])
  PAY (salarii → postează cheltuială) ; ASSET (amortizare → postează cheltuială)
  INSIGHT (consumă tot → dashboard + narativ AI) ; CALENDAR (termene) ; MASS (bulk orchestrează)
  TRUST (transversal: audit + anonimizare + roluri)
```
Fără dependențe circulare: `INSIGHT` e doar consumator. Fiecare cale are excepție (factură fără
contract, plată nepotrivită, SFS mock, AI absent).

---

## 4. Definition of Done — la nivel de modul (peste DoD-ul per item)
Un modul e „ero final" doar dacă:
- Toate item-urile lui `done`, fiecare cu testele `[blocant]` verzi.
- Migration gate verde (0 uncommitted; `db:reset`+`db:seed` OK; prefix > max pe `main`; breakpoints OK).
- Live API smoke verde (login + endpoint-urile modulului → 200 cu JSON corect).
- Tenant-isolation test verde (regula #6).
- Reviewer APPROVED după review→improve loop; integration-architect `CONNECTED` (fără `COMPETING_SYSTEM`
  — reutilizează invoices/payments/payroll/ai/SFS existente, nu le redublează).
- Persona reports salvate (Andreea/Maria/Cristina — sau persona contabil dedicată, vezi §5).
- Light + dark, WCAG AA, fără hex hardcodat, fără dead link.

---

## 5. Persona dedicată (peste cele 3 existente)
Pentru FinDesk, persona-cheie de validare e **„Veronica, contabilă cu 12 clienți"**: time-poor,
verifică conformitatea, urăște dubla-introducere, vrea export pentru declarații, suspicioasă pe AI
în cifre. Friction-ul ei se notează în `backlog/reports/<ID>-accountant.md` și alimentează următoarele
item-uri (nu blochează).
