---
title: Nav-link must resolve to a real App.tsx route
problem_type: dead-link-eject
module: FinNav, BusinessShell, AppShell
tags: [navigation, routing, dead-links, sidebar, redirect, FinDesk]
symptoms: "clicking sidebar item ejects user to /business; mă scoate din aplicație"
severity: critical
date: 2026-06-17
---

## Symptom

Clicking a sidebar/nav item redirects the user to `/business` instead of the target page.
Owner report: "pe unele butoane din sidebar dacă apăs mă scoate din aplicație".
Error in console: none (silent redirect).

## Root cause

App.tsx has a catch-all at the bottom:
```tsx
return <RedirectToBusiness />;  // window.location.hash = "/business"
```
Any href that doesn't match a route above the catch-all silently ejects the user.

FinNav had 17 hrefs at `/app/fin/*` but App.tsx routes are all `/business/fin/*`.
Every FinNav click → catch-all → eject.

Common patterns that cause dead links:
- Route moved/renamed but nav not updated (e.g. `insight` → `ledger`, `capture` → `captures`)
- Wrong prefix (e.g. `/app/fin/*` instead of `/business/fin/*`)
- Route never existed (e.g. `/business/itpark` vs `/business/fin/itpark`)
- Copy-paste from old code before a module migration

## Fix

1. For every nav href, verify it matches at least one `path.startsWith("X")` or `path === "X"` in App.tsx.
2. Key mappings that tripped us (FinDesk):
   - `/app/fin/*` → `/business/fin/*` (all FinNav items)
   - `einvoice` → `einvoices` (plural)
   - `capture` → `captures` (plural)
   - `insight` → `ledger` (FinInsightsPage mounted at ledger)
   - `bulk` → `mass` (FinMassPage mounted at mass)
   - `security` → `settings/security`
   - `/business/itpark` → `/business/fin/itpark`

## How to avoid next time

`scripts/check-nav-links.mjs` now runs in the build (vercel.json) and CI (prod-safety.yml).
It fails with exit 1 if any FinNav/BusinessShell/AppShell(BUSINESS) href has no App.tsx route.
Add new nav items only after verifying the target route exists.
