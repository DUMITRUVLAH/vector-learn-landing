---
id: AGREEMENT-003
title: "UI contracte: listă, status, expirări, servicii recurente"
milestone: FIN
phase: "4"
status: pending
attempts: 0
depends_on: [AGREEMENT-002, CORE-004]
spec: backlog/specs/AGREEMENT-003.md
branch: feat/FIN-agreement
---

## Goal

Pagina `/app/fin/agreements` oferă contabilului o vedere completă a contractelor comerciale:
tabel cu filtre, badge de status, alertă pentru contracte care expiră în 30 de zile, și un
panou lateral (drawer) cu detalii contract + lista serviciilor recurente și one-time.
Acțiunile CRUD (creare, editare, anulare) sunt disponibile direct din UI fără navigare separată.

Refolosire: design tokens Vector 365 (`bg-primary`, `text-muted-foreground`, etc.), componente
existente `Badge`, `Dialog`/`Sheet` din `src/components/ui/`. API-ul de pe AGREEMENT-002.

## User stories

- **Ca** contabil, **vreau** să văd lista contractelor active cu status și dată de expirare,
  **pentru că** trebuie să știu care expiră curând și necesită reînnoire.
- **Ca** director, **vreau** să creez un contract nou cu partener și servicii direct din UI,
  **pentru că** nu vreau să operez în DB direct.
- **Ca** contabil, **vreau** să văd serviciile recurente ale unui contract și `next_bill_date`,
  **pentru că** vreau să știu când urmează să generez factura.
- **Ca** contabil, **vreau** să anulez un contract și să fie marcat ca `cancelled`,
  **pentru că** contractele inactive trebuie să nu mai genereze facturi.

## Acceptance criteria

- [ ] Pagina `src/pages/fin/AgreementsPage.tsx` montată la ruta `/app/fin/agreements` în router
- [ ] Tabel cu coloanele: Nr. contract / Titlu, Partener, Status (badge), Valutã, Data start, Data end, Acțiuni
- [ ] Badge de status colorat: `draft`=gray, `active`=green, `paused`=yellow, `cancelled`=red
  (semantic tokens, zero hex hardcodat)
- [ ] Alertă vizibilă (banner galben) dacă există contracte cu `endDate` în următoarele 30 de zile
- [ ] Filtru: dropdown Status + input căutare (titlu / partener)
- [ ] Buton "Contract nou" → Dialog/Sheet cu formular: titlu, partener (select din `/api/fin/parties`),
  status, valută, date start/end, note; submit → POST `/api/fin/agreements`
- [ ] Click pe rând → Sheet lateral cu detalii contract + tab "Servicii":
  - Lista serviciilor: denumire, tip facturare, preț unitar, TVA, `next_bill_date` (pentru recurente)
  - Buton "Adaugă serviciu" → formular inline (tipul de facturare determină dacă recurrencePeriod apare)
- [ ] Acțiune "Anulează" pe contractele non-cancelled → PATCH status `cancelled` + confirmare
- [ ] Loading state (skeleton) și empty state ("Niciun contract găsit")
- [ ] Dark mode: toate elementele vizibile în ambele teme (bg-card, text-foreground, border-border)
- [ ] Link în Sidebar sau NavFinDesk la `/app/fin/agreements`
- [ ] Zero hardcoded hex, zero `any` TypeScript

## Files

**New:**
- `src/pages/fin/AgreementsPage.tsx` — pagina principală contracte
- `src/components/fin/AgreementTable.tsx` — tabel acorduri cu filtre
- `src/components/fin/AgreementDrawer.tsx` — panou lateral detalii + servicii
- `src/components/fin/CreateAgreementDialog.tsx` — dialog creare contract
- `src/__tests__/fin/agreement-003-ui.test.tsx` — teste UI

**Modified:**
- `src/router.tsx` — adaugă ruta `/app/fin/agreements`
- `src/components/fin/NavFinDesk.tsx` (sau sidebar) — link "Contracte"

## Tests

- **T-AGREEMENT-003-1** [blocant] `AgreementsPage` se randează fără crash (render + queryByText)
- **T-AGREEMENT-003-2** [blocant] Badge status `active` are clasa de culoare verde (design token)
- **T-AGREEMENT-003-3** [blocant] Dacă există contract cu `endDate` în 25 zile, bannerul de expirare apare
- **T-AGREEMENT-003-4** [blocant] Ruta `/app/fin/agreements` există în router și renderează pagina
- **T-AGREEMENT-003-5** [normal] Filtrul de status actualizează request-ul API cu param `status`
- **T-AGREEMENT-003-6** [normal] Dialog "Contract nou" se deschide la click pe butonul corespunzător

## DoD

- TypeScript strict, zero any
- Zero hardcoded hex — semantic tokens Vector 365
- Dark mode funcțional
- check-undefined-refs + check-route-mounts verzi
- vite build verde
- Toate testele T1-T4 (blocant) verzi
