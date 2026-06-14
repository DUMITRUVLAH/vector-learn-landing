---
id: SPLIT-101
title: BusinessShell — sidebar (Dashboard, FinDesk, PAR, ITPark) + layout + role gating
milestone: SPLIT
phase: "2"
branch: feat/SPLIT-business-shell
status: pending
depends_on: ["SPLIT-003"]
---

## Goal
Creează `BusinessShell` — echivalentul `AppShell` pentru aplicația Business Suite. Are sidebar propriu cu secțiunile Dashboard / FinDesk / PAR / ITPark, header cu logo Business Suite, buton logout, light+dark, WCAG AA, Vector 365 tokens. Nu rescrie AppShell-ul educațional — doar adaugă un shell nou paralel. Gating: orice pagină `BusinessShell`-wrapped face `requireApp('business')` și redirecționează la `/business/login` dacă lipsește sesiunea business.

## User stories
- Ca CFO (user business), vreau un sidebar clar cu Dashboard / FinDesk / PAR / ITPark, pentru că nu am nevoie de modulele educaționale (elevi, orar) care sunt în CRM.
- Ca admin Business Suite, vreau să fiu redirecționat la `/business/login` când sesiunea mea expiră, pentru că nu vreau să ajung pe loginul CRM.
- Ca developer, vreau BusinessShell separat de AppShell, pentru că modificările shell-ului educațional nu trebuie să afecteze Business Suite și invers.
- Ca tester a11y, vreau că sidebar-ul Business Suite respectă WCAG AA (contrast 4.5:1, touch targets ≥44px, aria-labels pe iconuri), pentru că produsul trebuie accesibil.

## Acceptance criteria
- [ ] `src/components/business/BusinessShell.tsx` exportat ca named export, acceptă `{ children: ReactNode, pageTitle: string, pageDescription?: string, actions?: ReactNode }`.
- [ ] Sidebar conține secțiunile: top-level `LayoutDashboard` → `/business/dashboard`; secțiunea FinDesk (Building2 sau Landmark) cu sub-items: Acasă → `/business/fin/`, Facturi, Cheltuieli, Plăți, Conturi bancare (minimum 5); secțiunea PAR cu sub-items: Cereri, Inbox, Rapoarte; secțiunea ITPark cu sub-items: Rezidenți, Dashboard.
- [ ] Header: logo Business Suite (text "Business Suite" + icon `Briefcase`), `NotificationBell` (reused), buton logout (apelează `/api/business/auth/logout`, redirecționează la `/business/login`).
- [ ] Guard `useBusinessSession` hook — dacă nu există sesiune business (cookie/localStorage lipsă) → redirecționare la `/business/login`. Hook verifică prin `GET /api/business/auth/me`.
- [ ] Light mode + dark mode funcțional (semantic tokens, niciun hex hardcodat).
- [ ] Toate icoanele din sidebar au `aria-hidden="true"` + textul vizibil / `sr-only` unde e necesar.
- [ ] Touch targets ≥ 44×44px (`.touch-target` sau `min-h-[44px] min-w-[44px]`).
- [ ] `BusinessDashboardPage` (stubul din SPLIT-003) e înlocuit cu versiunea învelită în `BusinessShell`.
- [ ] TypeScript strict: 0 `any`, props interfaces definite, build + typecheck verde.

## Files
- `src/components/business/BusinessShell.tsx` — shell nou (NOU)
- `src/hooks/useBusinessSession.ts` — hook de verificare sesiune business (NOU)
- `src/pages/business/BusinessDashboardPage.tsx` — înlocuiește stubul cu versiunea wrapped în BusinessShell
- `src/components/business/index.ts` — barrel export (NOU)

## Tests
- **T-SPLIT-101-1** [blocant] Given `<BusinessShell pageTitle="Test">content</BusinessShell>`, When render, Then se randează fără crash și "content" e vizibil în DOM.
- **T-SPLIT-101-2** [blocant] Given nicio sesiune business (mock `GET /api/business/auth/me` → 401), When se montează BusinessShell, Then `navigate('/business/login')` e apelat.
- **T-SPLIT-101-3** [normal] Given sidebar randat, When queryAllByRole('link'), Then există link-uri către /business/dashboard, /business/fin/, /business/par, /business/itpark.
- **T-SPLIT-101-4** [normal] Given sidebar randat, When queryAllByLabelText sau verificat aria-hidden pe SVG, Then toate icoanele icon-only au aria-hidden sau text accesibil.
- **T-SPLIT-101-5** [normal] Given dark mode (class `dark` pe html), When render BusinessShell, Then niciun element nu are culori hardcodate (visual smoke: nu aruncă eroare de render).

## DoD
- `BusinessShell` randat fără crash în unit test
- Redirecționare la `/business/login` când sesiune lipsă
- Sidebar cu secțiuni Dashboard / FinDesk / PAR / ITPark
- Light+dark, WCAG AA, 0 hex hardcodat
- Build + typecheck verde
