---
id: REGISTRY-003
title: "UI admin cote fiscale + plan de conturi (FinDesk Settings)"
milestone: FIN
phase: "REGISTRY"
status: pending
attempts: 0
depends_on: [REGISTRY-002]
spec: backlog/specs/REGISTRY-003.md
branch: feat/FIN-registry
---

## Goal

Pagină de admin `/app/fin/registry` cu două tab-uri:
1. **Cote fiscale** — tabel cu cotele `fin_tax_rates`; buton „Adaugă cotă" (modal form); inline editare `isDefault`
2. **Plan de conturi** — tabel cu `fin_chart_of_accounts`, groupat pe `accountType`; filtru pe `country`

Scopul: administratorii pot verifica și extinde nomenclatoarele fiscale fără SQL direct.

## User stories

- **Ca** admin, **vreau** să văd toate cotele fiscale actuale și istorice, **pentru că** trebuie să știu ce rate au fost aplicate pentru audituri.
- **Ca** contabil, **vreau** să adaug o cotă TVA nouă prin UI, **pentru că** nu am acces la SQL.
- **Ca** owner, **vreau** să văd planul de conturi al firmei mele, **pentru că** vreau să verific că e corect setat pentru export contabil.

## Acceptance criteria

- [ ] Ruta `/app/fin/registry` adăugată în `src/App.tsx` (lazy import)
- [ ] Pagina `src/pages/app/FinRegistryPage.tsx` — două tab-uri: `Cote fiscale` și `Plan de conturi`
- [ ] Tab Cote fiscale: tabel cu coloane `Țară`, `Tip cotă`, `Denumire`, `Procent`, `De la`, `Până la`, `Implicit`; filtru pe `country` și `kind`
- [ ] Buton „Adaugă cotă" deschide modal cu form validat (zod + react-hook-form): `country`, `kind`, `name`, `ratePct`, `effectiveFrom` (obligatorie), `effectiveTo`, `isDefault`, `notes`
- [ ] POST la `/api/fin/registry/tax-rates` la submit; toast success/error; revalidează lista
- [ ] Tab Plan de conturi: tabel cu coloane `Cod`, `Denumire`, `Tip`, `Cont parent`, `Activ`; grupare vizuală pe `accountType`; filtru pe `country`
- [ ] Design system tokens only (nu hex hardcodat); dark mode funcțional
- [ ] WCAG AA: contrast ≥ 4.5:1, touch targets ≥ 44px, labels pe toate inputurile
- [ ] `axe` 0 critical+serious violations

## Files

**New:**
- `src/pages/app/FinRegistryPage.tsx` — pagina admin
- `src/__tests__/fin/registry-003-ui.test.tsx` — smoke tests (renders without crash, tab switch)

**Modified:**
- `src/App.tsx` — adaugă ruta `/app/fin/registry` cu lazy import
- `src/components/nav/AppSidebar.tsx` (sau echivalent) — link în secțiunea FinDesk/Settings dacă există

## Tests

- **T-REGISTRY-003-1** [blocant] `<FinRegistryPage />` se renderizează fără crash (smoke test)
- **T-REGISTRY-003-2** [blocant] Click pe tab „Plan de conturi" schimbă conținutul afișat
- **T-REGISTRY-003-3** [blocant] Ruta `/app/fin/registry` există în `App.tsx` (grep test)
- **T-REGISTRY-003-4** [normal] Butonul „Adaugă cotă" deschide un dialog/modal
- **T-REGISTRY-003-5** [normal] Form validare: `ratePct` negativ arată eroare, nu trimite request
- **T-REGISTRY-003-6** [normal] Filtrul `country` filtrează lista de cote afișate

## DoD

- Pagina renderizează în light + dark mode
- Smoke tests + tab switch + route existence tests verzi
- axe 0 critical+serious
- Reviewer APPROVED (design system tokens, a11y, dark mode)
- Integration-architect CONNECTED (UI consumă API-ul REGISTRY-002, datele sunt reale)
- Persona reports salvate
- Branch: feat/FIN-registry (aceeași ca REGISTRY-001/002, aceeași PR #154)
- Ends Phase REGISTRY (PR #154 complet)
