---
id: FIX-503
title: "Audit full: toate dead-link-urile sidebar/nav + API-uri nemontate, + guard automat anti-regresie"
milestone: AUDIT-FIX
phase: 1
status: pending
depends_on: [FIX-501, FIX-502]
slug: app-wide-deadlink-audit-guard
---

## Goal

Owner: „peste tot vreau să fac ceva și sunt mesaje de eroare". FIX-501/502 repară cazurile
identificate (FinNav + payroll). Acest item face un **audit sistematic** al întregii aplicații și
adaugă un **guard automat** care împiedică reapariția claselor de bug:
1. **Dead nav-links**: orice `href`/`to` dintr-un sidebar/nav care nu corespunde unei rute reale → eject.
2. **API-uri chemate din client dar nemontate pe server** → fetch primește HTML → `JSON.parse('<!doctype')`
   → „Nu pot încărca …". (Aceeași clasă ca payroll.)

## In scope

### A. Audit manual + reparare (rapid, pe baza grep)
- Inventariază toate sidebar-urile/nav-urile: `src/components/fin/FinNav.tsx`,
  `src/components/business/BusinessShell.tsx`, `src/components/app/AppShell.tsx`, orice altă componentă
  de meniu. Pentru fiecare `href`/`to`, verifică că există o rută în `src/App.tsx` care o prinde
  (prefix match) ÎNAINTE de catch-all `RedirectToBusiness`.
- Pentru fiecare client API helper (`src/lib/api/*.ts`) extrage path-urile (`/...`) și verifică că
  există un `app.route("/api/...")` în `server/app.ts` care le acoperă. Listează discrepanțele.
- Reparează discrepanțele găsite (link greșit → path corect; sau API nemontat → montează ruta dacă
  routerul există, ca în payroll). Dacă reparația e mare (router lipsă întreg), creează un item nou
  în „Backlog descoperit" în loc s-o forțezi aici.
- Scrie rezultatul în `backlog/reports/FIX-503-deadlink-audit.md` (tabel: sursă → link/API → status → fix).

### B. Guard automat (anti-regresie) — `scripts/check-nav-links.mjs` (nou)
- Parsează `src/App.tsx` și extrage prefixele de rută (`path.startsWith("X")`, `path === "X"`,
  regex-uri evidente).
- Parsează componentele de nav (FinNav, BusinessShell, AppShell) și extrage `href`/`to`.
- FAIL (exit 1) dacă un href de nav NU e acoperit de nicio rută (ar duce la catch-all).
- Adaugă scriptul în build (`vercel.json` lângă celelalte check-uri) ȘI în CI `.github/workflows/prod-safety.yml`
  (lângă check-route-mounts), ca să blocheze viitoarele dead-link-uri. Fast, fără secrete.
- Documentează în `docs/solutions/` (o pagină scurtă „nav-link must resolve to a real route").

## Out of scope
- Unificarea vizuală a shell-urilor (SPLIT-401). Aici doar corectitudinea link/API + guard.

## Acceptance criteria
- AC1: `backlog/reports/FIX-503-deadlink-audit.md` listează fiecare sidebar/nav + verdict pe fiecare link.
- AC2: Toate dead-link-urile descoperite sunt reparate SAU mutate ca item nou (nimic lăsat mort).
- AC3: `scripts/check-nav-links.mjs` rulează, dă FAIL pe un href inventat de test și PASS pe codul reparat.
- AC4: Scriptul e wired în build (vercel.json) + CI (prod-safety.yml).
- AC5: Lista API client → server: orice path client are mount server, altfel reparat/raportat.
- AC6: Build+typecheck+lint curate; `npm run check-nav-links` + check-route-mounts + check-refs verzi.

## Tests (Given/When/Then)
- **T-FIX-503-1** [blocant] Given codul reparat, When `node scripts/check-nav-links.mjs`, Then exit 0.
- **T-FIX-503-2** [blocant] Given un href fals `/app/fin/inexistent` injectat temporar, When scriptul rulează, Then exit 1 cu mesaj clar (test pe fixture, nu pe sursa reală).
- **T-FIX-503-3** [blocant] Given raportul, Then conține FinNav, BusinessShell, AppShell cu verdict per link.
- **T-FIX-503-4** [normal] Given `src/lib/api/*.ts`, When extrag path-urile, Then fiecare are mount server (sau e listat ca discrepanță reparată).
- **T-FIX-503-5** [blocant] Given `npm run build`, Then noul guard rulează și e verde.

## DoD
Build+typecheck+lint+test verzi, guard wired în build+CI, raport salvat, reviewer APPROVED,
persona reports salvate, commit pe `feat/AUDIT-FIX-faza-1-sidebar-payroll`.
