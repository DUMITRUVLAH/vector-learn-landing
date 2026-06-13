---
id: CORE-004
title: "UI /app/fin shell + navigație module + gating pe rol (light/dark)"
milestone: FIN
phase: "1"
status: pending
attempts: 0
depends_on: [CORE-002]
spec: backlog/specs/CORE-004-shell-nav.md
core: backlog/fin/FIN-CORE.md
---

## Goal

Shell-ul de UI al FinDesk sub `/app/fin`: layout, navigație laterală cu modulele, gating pe rol,
light + dark, WCAG AA, tokeni Vector 365 (fără hex hardcodat). Toate ecranele de modul se montează aici.

## User stories

- **Ca** utilizator, **vreau** o navigație clară între module, **pentru că** vreau să ajung rapid la facturi/cheltuieli/dashboard.
- **Ca** viewer, **vreau** să nu văd acțiuni pe care nu le pot face, **pentru că** UI-ul reflectă rolul meu.

## Acceptance criteria

- [ ] Rută `/app/fin` + layout `src/pages/fin/FinLayout.tsx` (sidebar + topbar + outlet)
- [ ] Navigație cu intrările de modul (Compania mea, Parteneri, Acorduri, Facturi, e-Factura, Cheltuieli, Documente AI, Încasări, TVA & declarații, Salarii, Mijloace fixe, Tablou de bord, Calendar fiscal, Operațiuni în masă, Securitate) — fiecare disabled/hidden după rol
- [ ] Gating pe rol (din `fin_members.role`): viewer/cfo nu văd butoanele de creare/editare
- [ ] Light + dark mode complet; tokeni semantici (`bg-primary`, `text-muted-foreground`...), zero hex în `.tsx`
- [ ] Touch targets ≥44px, aria-label pe butoane icon-only, navigație la tastatură
- [ ] Empty states pentru module fără date încă
- [ ] Link-uri către rute reale (`#/app/fin/...`), fără anchor moarte

## Files

**New:**
- `src/pages/fin/FinLayout.tsx`
- `src/pages/fin/FinHome.tsx` (overview gol cu carduri către module)
- `src/components/fin/FinNav.tsx`
- `src/pages/fin/__tests__/FinLayout.test.tsx`

**Modified:**
- `src/App.tsx` — rute `/app/fin/*` (import verificat — check-refs)

## Tests

- **T-CORE-004-1** [blocant] `/app/fin` randează fără crash (smoke)
- **T-CORE-004-2** [blocant] Given viewer, navigația ascunde acțiunile de editare
- **T-CORE-004-3** [blocant] axe: 0 violări critical+serious
- **T-CORE-004-4** [normal] Dark mode: fără hex hardcodat (grep în .tsx)
- **T-CORE-004-5** [blocant] `check-undefined-refs.mjs` verde (toate importurile din App.tsx)

## DoD

- Build + typecheck + lint verzi; check-refs verde
- Reviewer APPROVED (design-system, a11y, dark mode); integration-architect `CONNECTED`
- Persona reports salvate (Andreea/Maria/Cristina + Veronica contabil)
