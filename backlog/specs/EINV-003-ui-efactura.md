---
id: EINV-003
title: "UI e-Factura Moldova — panou integrare SFS (listă, status, conectare)"
milestone: FIN
phase: einv
branch: feat/FIN-einv
depends_on: [EINV-001, EINV-002]
spec: backlog/specs/EINV-003-ui-efactura.md
status: pending
attempts: 0
blockers: []
---

## Goal

Construiește pagina React `/app/fin/einvoices` cu două secțiuni:

1. **Lista facturi electronice** — tabel cu toate facturile trimise la SFS (fin_einvoices),
   badge-uri de status (pending/sent/accepted/rejected/cancelled), data trimiterii, serial SFS,
   butoane Sincronizează / Anulează per rând.

2. **Panou integrare SFS** — formular pentru configurarea conexiunii:
   - IDNO (13 cifre companie furnizor)
   - Cont bancar (IBAN/local max 34 chars)
   - Environment selector: `mock | test | prod`
   - Username + Parolă API SFS (opțional, afișate ca ••••••• dacă sunt salvate)
   - Buton „Salvează" → PUT /api/fin/sfs-settings
   - Indicator vizual dacă sunt credențialele configurate (hasCredentials)

Pagina se înregistrează la ruta `/app/fin/einvoices` în App.tsx.
Navbar-ul lateral FIN (dacă există) primește link-ul, altfel se adaugă în meniu.

Reutilizează design-system: tokens Vector 365 (`bg-card`, `text-muted-foreground`), dark mode parity, WCAG AA.

## User stories

- Ca director de academie, vreau să văd toate facturile trimise la SFS cu statusul lor, pentru că am nevoie să știu care sunt acceptate și care au erori.
- Ca director, vreau să configurez credențialele SFS din UI, fără să ating codul, pentru că îmi schimb periodic parola API.
- Ca director, vreau să sincronizez statusul unei facturi cu SFS dintr-un click, pentru că statusul se actualizează asincron.
- Ca director, vreau să anulez o factură SFS din UI, pentru că uneori trebuie corectată înainte de acceptare.

## Acceptance criteria

- [ ] Pagina `/app/fin/einvoices` se randează fără crash (render smoke)
- [ ] Tabelul apelează `GET /api/fin/einvoices` (lista paginată sau adaptată la DB existent)
- [ ] Fiecare rând are badge status + data trimitere + serial SFS
- [ ] Buton „Sincronizează" → POST /api/fin/einvoices/:id/sync
- [ ] Buton „Anulează" activ doar dacă status `sent` sau `accepted` → POST /api/fin/einvoices/:id/cancel
- [ ] Panoul SFS afișează setările curente (GET /api/fin/sfs-settings)
- [ ] Formularul salvează setările (PUT /api/fin/sfs-settings)
- [ ] Environment selector are opțiunile mock/test/prod cu label clar
- [ ] Câmpurile username/parolă se afișează ca •••••• dacă hasCredentials=true
- [ ] Dark mode funcționează — niciun hex hardcodat
- [ ] WCAG AA: orice input are <label> sau aria-label; butoane icon-only au aria-label
- [ ] Ruta adăugată în App.tsx

## Files

### New
- `src/pages/app/FinEinvoicesPage.tsx` — pagina principală
- `src/lib/api/finEinvoices.ts` — apeluri API (getSfsSettings, upsertSfsSettings, listEinvoices, syncEinvoice, cancelEinvoice)
- `src/__tests__/fin/einvoices-ui.test.tsx` — teste UI

### Modified
- `src/App.tsx` — adaugă import + ruta `/app/fin/einvoices`

## Tests

- **T-EINV-003-1** [blocant] Given pagina /app/fin/einvoices, When se randează, Then nu apare eroare și titlul „e-Factura Moldova" este vizibil
- **T-EINV-003-2** [blocant] Given GET /api/fin/sfs-settings returnează settings, When se încarcă panoul, Then IDNO și environment sunt afișate
- **T-EINV-003-3** [normal] Given formularul SFS, When utilizatorul completează IDNO + bankAccount + selectează „mock" + apasă Salvează, Then PUT /api/fin/sfs-settings este apelat cu datele corecte
- **T-EINV-003-4** [normal] Given o factură cu status „sent", When se afișează rândul în tabel, Then butonul Anulează este activ și butonul Sincronizează este prezent
- **T-EINV-003-5** [normal] Given o factură cu status „pending", When se afișează rândul, Then butonul Anulează este disabled
- **T-EINV-003-6** [blocant] Given mock API, When se apasă Sincronizează, Then POST /sync este apelat și statusul se actualizează

## DoD

- Build + typecheck + lint verzi
- Toate testele [blocant] trec
- Reviewer APPROVED
- integration-architect CONNECTED
- Pagina /app/fin/einvoices accesibilă prin meniu/link
