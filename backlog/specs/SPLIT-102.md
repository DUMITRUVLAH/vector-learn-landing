---
id: SPLIT-102
title: Landing page /business — hero finanțe, 3 module, CTA → /business/login
milestone: SPLIT
phase: "2"
branch: feat/SPLIT-business-shell
status: pending
depends_on: ["SPLIT-001"]
---

## Goal
Creează pagina de landing dedicată aplicației Business Suite la ruta `/business`. Conține: hero cu titlu și tagline orientate pe finanțe/business, cards cu cele 3 module (FinDesk — gestiune financiară, PAR — cereri de plată, ITPark — rezidenți tech), CTA primar "Intră în cont" → `/business/login`. Ruta `/` rămâne neatinsă (CRM educațional). Pagina respectă Vector 365 design system, light+dark, WCAG AA.

## User stories
- Ca potențial client Business Suite, vreau să văd la `/business` ce oferă platforma (FinDesk + PAR + ITPark), pentru că vreau să înțeleg valoarea înainte de a mă loga.
- Ca utilizator existent Business Suite, vreau un CTA vizibil "Intră în cont", pentru că vreau să ajung rapid la `/business/login`.
- Ca owner de produs, vreau că landing `/business` e complet separat de landing-ul CRM (`/`), pentru că cele două produse au audiențe diferite (director educațional vs CFO/admin financiar).
- Ca developer, vreau că ruta `/business` e tratată în `App.tsx` înainte de `/app/*` și `/`, pentru că altfel ar cădea în landing-ul CRM.

## Acceptance criteria
- [ ] Ruta `#/business` (sau `/business` în hash router) randează `BusinessLandingPage`, NU `HomePage` sau altceva.
- [ ] `src/pages/business/BusinessLandingPage.tsx` există ca named export.
- [ ] Hero section: titlu proeminent (ex. „Business Suite — FinDesk · PAR · ITPark"), tagline scurt (max 2 rânduri), CTA primar buton "Intră în cont" care navighează la `/business/login`.
- [ ] 3 module cards/sections: **FinDesk** (icon Landmark/Building2, descriere gestiune financiară), **PAR** (icon ClipboardCheck, descriere cereri de plată, aprobări), **ITPark** (icon Building/Server, descriere rezidenți tech/parc IT).
- [ ] Semantic tokens: `bg-background`, `text-foreground`, `text-primary`, `bg-card`, etc. Niciun hex hardcodat.
- [ ] Light + dark mode funcțional (testează prin class `dark` pe `html`).
- [ ] WCAG AA: contrast ≥ 4.5:1 pe text, CTA ≥ 44px touch target.
- [ ] `App.tsx` adaugă `if (path.startsWith('/business') && !path.startsWith('/business/login') && !path.startsWith('/business/dashboard') && ...) return <BusinessLandingPage />` — sau equivalent mai curat cu prefix check.
- [ ] Build + typecheck verde.

## Files
- `src/pages/business/BusinessLandingPage.tsx` — landing page nou (NOU)
- `src/App.tsx` — adaugă ruta `/business` (înaintea rutelor `/business/login`, `/business/dashboard`)

## Tests
- **T-SPLIT-102-1** [blocant] Given path = '/business', When render Routes(), Then `BusinessLandingPage` e montat (nu `HomePage`).
- **T-SPLIT-102-2** [blocant] Given `<BusinessLandingPage />`, When render, Then se randează fără crash și conține textele "FinDesk", "PAR", "ITPark".
- **T-SPLIT-102-3** [normal] Given landing randat, When queryByRole('link', { name: /intră în cont/i }) sau queryByRole('button', { name: /intră în cont/i }), Then elementul există și href/onClick → /business/login.
- **T-SPLIT-102-4** [normal] Given dark mode class pe document.documentElement, When render BusinessLandingPage, Then nu aruncă erori de render (smoke test dark mode).

## DoD
- `/business` randează landing nou, `/` rămâne neatins
- Hero + 3 module cards + CTA vizibil
- Light+dark, WCAG AA, 0 hex hardcodat
- Build + typecheck verde
