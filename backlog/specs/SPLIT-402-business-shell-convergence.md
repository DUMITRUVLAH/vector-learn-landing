---
id: SPLIT-402
title: "Un singur shell pe /business/* — toate paginile FinDesk pe BusinessShell, fără nume școală în header"
milestone: SPLIT
phase: SHELL
status: pending
depends_on: []
slug: business-shell-convergence
branch: feat/SPLIT-faza-SHELL2-one-shell
priority: high
reported_by: owner
reported_at: 2026-06-17
---

## Context — de ce SPLIT-401 NU a rezolvat (bug-ul persistă)

SPLIT-401 a corectat doar `FinLayout` și *header-ul* din `AppShell`, dar bug-ul raportat de owner
persistă pe `/business/fin/banklink` (și pe celelalte pagini FinDesk). Două capturi confirmă:

- **Dashboard** (`/business/dashboard`) → shell-ul corect: header „Business Suite" + sidebar
  **`BusinessShell.NAV_GROUPS`** (Acasă FinDesk / Facturi / Cheltuieli / Plăți / Conturi bancare /
  Parteneri / Rapoarte · PAR · ITPark · Document Merge).
- **Bancă** (`/business/fin/banklink`) → shell DIFERIT: același logo „Business Suite", dar
  - sidebar-ul e **`AppShell.BUSINESS_NAV_GROUPS`** (altă listă: Cont de plată, e-Factura,
    Încasări, Acorduri, Registru general, TVA & declarații, Salarii, Mijloace fixe, Stocuri,
    Buget, Bancă...), și
  - header-ul afișează **„Demo Lingua School"** (numele tenant-ului) + **„Andreea Mitran / Admin"**.

Owner: *„bugu persistă"* + a confirmat că deranjează: **sidebar diferit**, **„Demo Lingua School"
în header**, și **tot chrome-ul diferit**. Vrea EXACT același header ȘI sidebar peste tot în
`/business/*`, fără brandingul școlii.

## Cauza-rădăcină (confirmată în cod)

1. **Două shell-uri concurente cu două nav-uri diferite:**
   - `BusinessShell` ([src/components/business/BusinessShell.tsx](../../src/components/business/BusinessShell.tsx))
     cu `NAV_GROUPS` (lista scurtă) — folosit de Dashboard (corect).
   - `AppShell` ([src/components/app/AppShell.tsx](../../src/components/app/AppShell.tsx)) cu
     `BUSINESS_NAV_GROUPS` (lista lungă, alt set de iteme) — folosit de ~32 pagini FinDesk.
2. **~32 de pagini FinDesk încă importă și folosesc `AppShell`** (nu `BusinessShell`):
   `BankLinkPage`, `BankLinkTransactionsPage`, `BankLinkImportPage`, `BankLinkQueuePage`,
   `CashPage`, `CashImportPage`, `AgreementsPage`, `CapturesListPage`, `CapturePage`,
   `ReconcilePage`, `PaymentsPage`, `TaxPage`, `TaxDashboardPage`, `FinLedgerPage`,
   `FinLedgerCarteMare`, `FinMassPage`, `FinCalendarPage`, `PayrollPage`, `PayrollEmployeesPage`,
   `PayrollRunDetailPage`, `FinAiAuditPage`, `FinSecuritySettingsPage`,
   `src/pages/app/fin/PartiesPage`, `PartyDetailPage`, `ExportCenter`, și
   `src/pages/app/fin/itpark/*` (SelfDeclaration, ReadinessChecklist, Anexa2/3/4, Letters).
3. **Header-ul printează numele tenant-ului** (`bizData.tenant.name` în `AppShell`,
   `companyName` în `FinLayout`) → apare „Demo Lingua School", brandingul școlii CRM, pe care
   owner-ul NU îl vrea în Business Suite.

## Obiectiv

**UN SINGUR shell pe tot `/business/*`** = exact header-ul + sidebar-ul din `BusinessShell`
(cel de pe Dashboard, considerat corect de owner). Zero nume de școală/tenant în header.
Zero apariție a `AppShell` pe rutele `/business/*`.

## In scope

### 1. Converge toate paginile FinDesk pe `BusinessShell`
Pentru FIECARE fișier din lista de la „Cauza-rădăcină §2", înlocuiește
`import { AppShell } from "@/components/app/AppShell"` → `BusinessShell` și `<AppShell ...>` →
`<BusinessShell ...>`. `BusinessShell` are același shape de props (`pageTitle`, `pageDescription`,
`actions`/`headerActions` — verifică numele exact și adaptează). Conținutul paginii rămâne
neschimbat; se schimbă DOAR wrapper-ul de shell.

> Notă: paginile sunt deja montate sub `BusinessGuardPage` în `App.tsx`, deci sesiunea e validată;
> `BusinessShell` re-verifică sesiunea — OK, nu dublează guard-ul logic (doar UI consistent).

### 2. `BusinessShell` — header fără nume de tenant/școală
În [BusinessShell.tsx](../../src/components/business/BusinessShell.tsx), header-ul afișează doar
brandingul **„Business Suite"** (cu opțional userul + logout business). **NU** afișează
`tenant.name` / numele organizației CRM. Dacă se dorește totuși un nume, e numele entității de
business (nu „Demo Lingua School") — dar default: fără nume de școală.

### 3. Un singur sidebar canonic
`BusinessShell.NAV_GROUPS` devine SINGURUL nav pe `/business/*`. Dacă itemele utile din
`AppShell.BUSINESS_NAV_GROUPS` (ex. e-Factura, Acorduri, Registru general, TVA, Salarii, Mijloace
fixe, Stocuri, Buget, Bancă, Reconciliere, Calendar fiscal, Operațiuni în masă, Export, Setări)
lipsesc din `NAV_GROUPS` și owner-ul le folosește, **mută-le în `NAV_GROUPS`** ca să nu pierdem
funcționalitate — dar lista finală e UNA singură, identică pe toate paginile. (Reconciliază cele
două liste într-una; nu lăsa două surse de adevăr.)

### 4. Retragerea nav-ului business din `AppShell` (anti-regresie)
După ce nicio rută `/business/*` nu mai folosește `AppShell`, scoate ramura business din `AppShell`
(`isBusiness`, `BUSINESS_NAV_GROUPS`, `useBusinessSession` din AppShell, header-ul business) ca să
nu existe a doua implementare care să diveargă din nou. `AppShell` redevine strict shell-ul CRM
(`/app/*`). (Dacă ștergerea e riscantă în acest PR, măcar marcheaz-o clar și adaugă un guard de test
care eșuează dacă vreo pagină `/business/*` randează `AppShell`.)

## Out of scope
- Logica de business / API-urile paginilor (doar wrapper-ul de shell se schimbă).
- `BusinessGuardPage` (rămâne; doar nu mai trebuie să lase shell-uri inconsistente).
- Rutele CRM `/app/*` (rămân pe `AppShell` cu chrome Vector Learn — NU le regresa).
- PAR/ITPark dacă deja folosesc `BusinessShell` corect (verifică; dacă folosesc `AppShell`, intră în §1).

## User stories
- Ca user Business Suite, navighez Dashboard → Bancă → Parteneri → Facturi și văd EXACT același
  header și sidebar pe fiecare; nu simt că „am sărit în alt produs".
- Ca user Business Suite, nu văd niciodată „Demo Lingua School" (e școala din CRM, nu firma mea).

## Acceptance criteria
- AC1 [blocant]: `grep -rl 'from "@/components/app/AppShell"' src/pages/fin src/pages/app/fin`
  întoarce **zero** fișiere (nicio pagină FinDesk nu mai folosește AppShell).
- AC2 [blocant]: Pe `/business/fin/banklink`, `/business/fin/parties`, `/business/fin/invoices`,
  `/business/fin/payments`, `/business/fin/captures`, `/business/fin/reconcile`,
  `/business/fin/payroll` — sidebar-ul randat e identic cu cel de pe `/business/dashboard`
  (același set de iteme, aceeași ordine).
- AC3 [blocant]: Header-ul pe orice `/business/*` NU conține textul „Demo Lingua School" și nu
  afișează numele tenant-ului CRM.
- AC4 [blocant]: Logout din orice pagină `/business/*` → `/business/login`.
- AC5: Build + typecheck + lint curate; zero `any` nou; dark mode + a11y OK (icon-only buttons au
  aria-label, contrast ≥ 4.5:1).
- AC6: Itemele de meniu utile din vechiul `BUSINESS_NAV_GROUPS` nu se pierd (sunt mutate în
  `NAV_GROUPS` dacă lipseau) — owner-ul nu rămâne fără acces la e-Factura/Bancă/Salarii/etc.
- AC7: `npm run check-nav-links` (sau echivalentul check-route-mounts) verde — zero link-uri moarte.

## Tests (Given/When/Then)
- **T-SPLIT-402-1** [blocant] Given render `<BankLinkPage>` sub path `/business/fin/banklink`,
  When mount, Then DOM-ul conține `aria-label="Navigare Business Suite"` (sidebar-ul BusinessShell)
  și NU `aria-label` de nav CRM.
- **T-SPLIT-402-2** [blocant] Given render orice pagină FinDesk sub `/business/*`, When mount,
  Then header-ul nu conține „Demo Lingua School".
- **T-SPLIT-402-3** [blocant] Given grep `from "@/components/app/AppShell"` în `src/pages/fin` și
  `src/pages/app/fin`, Then zero match-uri.
- **T-SPLIT-402-4** [blocant] Given `npm run build`, Then zero erori TypeScript.
- **T-SPLIT-402-5** [normal] Given sidebar-ul de pe `/business/dashboard` și cel de pe
  `/business/fin/banklink`, Then listele de iteme sunt egale (snapshot identic).
- **T-SPLIT-402-6** [blocant] E2E (real-browser, vezi memory e2e): login business → Dashboard →
  Bancă → Parteneri → Facturi; pe fiecare, sidebar identic + header „Business Suite" + zero
  „Demo Lingua School".

## DoD
Build+typecheck+lint curate, check-nav-links verde, AC blocante verzi, e2e-smoke verde,
reviewer APPROVED după review→improve (integration-architect confirmă un singur shell pe
`/business/*`), personas salvate, PR cu capturi înainte/după pentru Bancă + Dashboard pe
`feat/SPLIT-faza-SHELL2-one-shell`.
