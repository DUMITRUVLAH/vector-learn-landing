---
id: FIX-501
title: "BUG: butoanele din sidebar FinNav scot userul din aplicație (link-uri /app/fin/* moarte → RedirectToBusiness)"
milestone: AUDIT-FIX
phase: 1
status: pending
depends_on: []
slug: finnav-dead-links
---

## Goal

Owner-reported: „pe unele butoane din sidebar dacă apăs mă scoate din aplicație". Cauză confirmată
din cod: **`src/components/fin/FinNav.tsx`** linkează TOATE item-urile la `/app/fin/*`
(`/app/fin/payroll`, `/app/fin/parties`, `/app/fin/expenses`, …, 17 link-uri), dar rutele reale din
`src/App.tsx` sunt sub **`/business/fin/*`**. Niciun `/app/fin/*` nu se potrivește → cade pe catch-all
`return <RedirectToBusiness />` (App.tsx:170) care face `window.location.hash = "/business"` →
**userul e ejectat la landing-ul business la fiecare click**.

## Root cause (dovezi)
- `FinNav.tsx` href-uri: `/app/fin`, `/app/fin/company`, `/app/fin/members`, `/app/fin/parties`,
  `/app/fin/agreements`, `/app/fin/invoices`, `/app/fin/einvoice`, `/app/fin/cash`, `/app/fin/expenses`,
  `/app/fin/capture`, `/app/fin/payroll`, `/app/fin/assets`, `/app/fin/tax`, `/app/fin/insight`,
  `/app/fin/calendar`, `/app/fin/bulk`, `/app/fin/security`.
- App.tsx: NICIO rută `/app/fin/*`; toate sunt `/business/fin/*`. Catch-all → `RedirectToBusiness`.
- Unele label-uri nici nu au rută 1:1 și trebuie mapate corect:
  - `einvoice` → ruta reală e `/business/fin/einvoices` (plural).
  - `insight` → `/business/fin/ledger` (FinInsightsPage e montat acolo).
  - `security` → `/business/fin/settings/security`.
  - `company`, `members` → nu au rută dedicată sub `/business/fin/*` azi: ori se adaugă rută,
    ori se mapează la cea mai apropiată existentă (vezi „In scope"). NU lăsa link mort.

## In scope
- **`src/components/fin/FinNav.tsx`**: schimbă toate `href` din `/app/fin/...` în `/business/fin/...`,
  cu maparea corectă la rutele EXISTENTE din App.tsx:
  - `/app/fin` → `/business/fin/` (FinHome)
  - `/app/fin/parties` → `/business/fin/parties`
  - `/app/fin/agreements` → `/business/fin/agreements`
  - `/app/fin/invoices` → `/business/fin/invoices`
  - `/app/fin/einvoice` → `/business/fin/einvoices`
  - `/app/fin/cash` → `/business/fin/cash`
  - `/app/fin/expenses` → `/business/fin/expenses`
  - `/app/fin/capture` → `/business/fin/captures`
  - `/app/fin/payroll` → `/business/fin/payroll`
  - `/app/fin/assets` → `/business/fin/assets`
  - `/app/fin/tax` → `/business/fin/tax`
  - `/app/fin/insight` → `/business/fin/ledger`
  - `/app/fin/calendar` → `/business/fin/calendar`
  - `/app/fin/bulk` → `/business/fin/mass`
  - `/app/fin/security` → `/business/fin/settings/security`
  - `/app/fin/company`, `/app/fin/members` → dacă nu există rută, scoate item-ul SAU mapează la
    `/business/fin/onboarding` (decide cea mai sensibilă; NU lăsa `/app/fin/*`). Notează decizia.
- Logica „active link" (`path.startsWith(item.href)` / egalitate pe home) trebuie să rămână corectă
  cu noile path-uri (home = `/business/fin` sau `/business/fin/`).
- **Guard anti-regresie**: adaugă în FinNav un comentariu + (dacă există un script de check) o regulă
  că href-urile FinNav trebuie să fie un prefix al unei rute reale din App.tsx. Minim: testul de mai jos.

## Out of scope
- Unificarea shell-urilor (FinNav vs BusinessShell) — e SPLIT-401. Aici DOAR reparăm dead-links.

## Acceptance criteria
- AC1: Niciun `href` din FinNav nu mai începe cu `/app/fin` (grep = 0).
- AC2: Fiecare `href` din FinNav e prefixul unei rute reale din App.tsx (verificat prin test).
- AC3: Click pe orice item din FinNav NU mai duce la `/business` (nu mai ejectează) — duce la pagina corectă.
- AC4: Item-ul activ se evidențiază corect pe noile path-uri.
- AC5: Build+typecheck+lint curate; zero `any`; dark mode OK; zero hex în `.tsx`.

## Tests (Given/When/Then)
- **T-FIX-501-1** [blocant] Given `FinNav.tsx`, When grep `href: "/app/fin`, Then 0 rezultate.
- **T-FIX-501-2** [blocant] Given lista de href din FinNav și lista de rute din App.tsx, When fiecare href, Then există o rută `/business/fin/*` al cărei `startsWith(href)` e adevărat (test de consistență).
- **T-FIX-501-3** [blocant] Given render `<FinNav role="owner" />`, When inspectez link-urile, Then toate sunt `/business/fin/*`.
- **T-FIX-501-4** [normal] Given path `/business/fin/parties`, When render FinNav, Then item-ul „Parteneri" e marcat activ.
- **T-FIX-501-5** [blocant] Given `npm run build`, Then zero erori TS + `check-route-mounts` verde.

## DoD
Build+typecheck+lint+test verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/AUDIT-FIX-faza-1-sidebar-payroll`.
