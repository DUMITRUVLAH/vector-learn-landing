---
title: Blocajul de derulare supraviețuiește navigării
category: frontend
date: 2026-09-26
tags: [scroll, dialog, overlay, navigation, crm]
---

# Blocajul de derulare supraviețuiește navigării

**Simptom.** Ownerul: „nu pot face scroll pe pagina act”, apoi „nici aici” pe Automatizări → Distribuire.
Deschisă direct, pagina se derula normal.

**Cauza, într-o propoziție.** `document.body.style.overflow` trăiește în afara React, așa că un
`hidden` rămas de la ferestrele suprapuse (fișa leadului + „Act nou”, fiecare salvând „valoarea
anterioară”) nu îl curăță nicio navigare. De aceea strică FIECARE pagină deschisă după aceea.

**Reparat în două straturi.**
1. `src/lib/scrollLock.ts` — contor în loc de „salvează și pune la loc”; pagina se deblochează când
   se închide ultima fereastră, în orice ordine (CRM-U01).
2. `src/lib/scrollLockGuard.ts` — la fiecare schimbare de rută, `BusinessShell` ridică blocajul dacă
   nu mai e deschisă nicio fereastră `aria-modal` (CRM-A01). Prinde orice cauză viitoare.

**Regula.** Orice efect care scrie pe `document.body` / `documentElement` trebuie gândit ca o stare
globală ce trăiește peste pagini, nu ca o stare a componentei. Folosește `lockBodyScroll()`, nu
`body.style.overflow` direct.

**Teste.** `src/lib/__tests__/scrollLock.test.tsx`, `src/lib/__tests__/scrollLockGuard.test.tsx`,
`scripts/e2e-crm-automatizari.mjs` (pasul 6: blocaj injectat → navigare → pagina se derulează).
