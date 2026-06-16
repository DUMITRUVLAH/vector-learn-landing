---
id: SPLIT-401
title: "Business Suite shell unificat — toate paginile /business/* rămân în chrome-ul Business Suite"
milestone: SPLIT
phase: SHELL
status: pending
depends_on: []
slug: business-shell-unification
branch: feat/SPLIT-faza-SHELL-business-chrome
---

## Goal

Orice pagină sub `/business/*` trebuie să randeze în **chrome-ul Business Suite**: logo
„Business Suite", headerul arată identitatea sesiunii Business (`useBusinessSession`), sidebar-ul
Business — nu CRM-ul (Vector Learn, tenant „Demo Lingua School", user Andreea Mitran).

**Problema raportată de owner:**
- Paginile fin (`/business/fin/parties`, `/business/fin/banklink` etc.) se randează în `AppShell`
  care afișează headerul CRM (logo Vector Learn, tenant CRM, user CRM).
- `FinLayout` folosește `useSession()` (sesiunea CRM) pentru companyName + userInitials, deci
  headerul arată `"Demo Lingua School / FinDesk"` cu userul CRM, nu cel business.
- `BusinessGuardPage` nu învelește în `BusinessShell`, lăsând paginile delegate cu propriile
  shell-uri inconsistente.

**Fix-uri necesare (fără a rescrie logica de business din paginile individuale):**

1. **`AppShell` header context-aware** — când `isBusiness = path.startsWith("/business")`,
   headerul afișează identitatea din `useBusinessSession()` (name, organizație, logout business)
   în loc de `useSession()` (CRM). Sidebar-ul e deja context-aware (BUSINESS_NAV_GROUPS).

2. **`FinLayout` header** — înlocuiește `useSession()` cu `useBusinessSession()` pentru
   companyName (din `profile.legalName ?? session.tenant.name`) și userInitials. Logout-ul
   FinLayout merge la `/business/login` (nu `/app/login`). Linkul logo se întoarce la
   `/business/fin/` (nu `/app/fin`).

3. **Paginile fin care folosesc `AppShell` direct** — `BankLinkPage`, `BankLinkTransactionsPage`,
   `BankLinkImportPage`, `BankLinkQueuePage`, `CashPage`, `AgreementsPage`, `CapturesListPage`
   etc. — înlocuiesc `import { AppShell } from "@/components/app/AppShell"` cu
   `import { BusinessShell } from "@/components/business/BusinessShell"` și adaptează
   atributele (BusinessShell are `pageTitle`, `pageDescription`, `actions` — same shape).

## In scope

### 1. `src/components/app/AppShell.tsx`
- Adaugă `useBusinessSession()` call conditionat: dacă `isBusiness`, folosește `businessSession.data`
  pentru header (name, org name, logout → business logout).
- Header condiționat: pe `/business/*` afișează `<Briefcase>` + „Business Suite" + biz user name
  + biz logout. Pe `/app/*` rămâne comportamentul actual.
- Dacă `businessSession.status === "loading"` și `isBusiness` → afișează spinner în header în loc
  de datele CRM.

### 2. `src/pages/fin/FinLayout.tsx`
- Înlocuiește `useSession()` cu `useBusinessSession()`.
- `companyName = profile?.legalName ?? bizSession?.data?.tenant?.name ?? "FinDesk"`.
- `userInitials` din `bizSession?.data?.user?.name`.
- `handleLogout` → `bizSession.logout()` + `navigate("/business/login")`.
- Link logo → `/business/fin/` (era `/app/fin`).

### 3. Paginile fin cu `AppShell` direct
Înlocuiește `AppShell` cu `BusinessShell` în:
- `src/pages/fin/AgreementsPage.tsx`
- `src/pages/fin/BankLinkPage.tsx`
- `src/pages/fin/BankLinkQueuePage.tsx`
- `src/pages/fin/BankLinkTransactionsPage.tsx`
- `src/pages/fin/BankLinkImportPage.tsx`
- `src/pages/fin/CashPage.tsx`
- `src/pages/fin/CapturesListPage.tsx`
- Orice alt fișier din `src/pages/fin/` care importă `AppShell`.

## Out of scope
- Nu modificăm rutele sau logica de business din pagini.
- Nu modificăm `BusinessGuardPage` (gurdul e corect, problema e în shell-uri).
- Nu modificăm paginile PAR sau ITPark (deja folosesc `BusinessShell` sau `AppShell` cu
  isBusiness=true corect).

## User stories
- Ca user business, vreau să văd „Business Suite" în header pe orice pagină `/business/*`,
  pentru că altfel cred că am ieșit din aplicație (vector learn vs findesk).
- Ca admin, vreau ca butonul „Ieșire" din FinDesk să mă deconecteze din Business Suite,
  nu din CRM-ul Vector Learn.

## Acceptance criteria
- AC1: `/business/fin/parties` → header arată „Business Suite" + user-ul business (nu CRM).
- AC2: `/business/fin/banklink` → `AppShell`/`BusinessShell` corect, nu logo Vector Learn.
- AC3: Logout din orice pagină `/business/*` → redirect `/business/login` (nu `/app/login`).
- AC4: FinLayout's logo link → `/business/fin/` (nu `/app/fin`).
- AC5: Build+typecheck+lint curate; zero `any` nou; dark mode OK.
- AC6: `npm run check-nav-links` verde (zero nav links moarte).

## Tests (Given/When/Then)
- **T-SPLIT-401-1** [blocant] Given render `<AppShell>` cu path `/business/fin/parties`, When mount, Then header nu conține text „Demo Lingua School" (CRM tenant).
- **T-SPLIT-401-2** [blocant] Given render `<FinLayout>` sub `/business/fin/*`, When mount, Then link logo href conține `/business/fin/`.
- **T-SPLIT-401-3** [blocant] Given `npm run build`, Then zero erori TypeScript.
- **T-SPLIT-401-4** [normal] Given grep pe `/src/pages/fin/*.tsx`, Then zero `import.*AppShell` în paginile banklink/cash/agreements/captures.
- **T-SPLIT-401-5** [blocant] Given `npm run check-nav-links`, Then exitcode 0.

## DoD
Build+typecheck+lint curate, check-nav-links verde, reviewer APPROVED, personas salvate,
commit pe `feat/SPLIT-faza-SHELL-business-chrome`.
