---
id: CALENDAR-003
title: "Period close: lock postări → imutabil (regula #8) + UI calendar fiscal /app/fin/calendar"
milestone: FIN
phase: "14"
status: pending
depends_on: [CALENDAR-002, CORE-004]
spec: backlog/specs/CALENDAR-003.md
branch: feat/FIN-calendar
---

## Goal

Implementează blocarea perioadelor contabile (FIN-CORE regula #8) și interfața UI pentru
calendarul fiscal al tenantului:

1. **`POST /api/fin/calendar/lock-period`** — blochează o perioadă (lună/an) pentru un tenant:
   inserează în `fin_period_locks`. Odată blocată, nicio operație de write (mark-paid, generate,
   actualizare obligație) nu mai este permisă pentru acea perioadă. Validare: utilizatorul trebuie
   să aibă rol `admin` sau `accountant`. Notificare in-app la blocare.
2. **`DELETE /api/fin/calendar/lock-period/:year/:month`** — deblochează (doar admin).
3. **Pagina `/app/fin/calendar`** — UI calendar fiscal:
   - Calendar lunar cu toate obligațiile vizibile: culori semantice (pending=galben, paid=verde, overdue=roșu)
   - Lista „De plătit" (pending + overdue) cu buton „Marchează plătit"
   - Lista „Plătite" pentru luna selectată
   - Buton „Generează obligații" (POST /generate)
   - Indicator perioadă blocată (badge + tooltip „Blocat de <user> pe <data>")
   - Navigare lună înainte/înapoi
   - Design-system tokens, light+dark, WCAG AA, fără hex hardcodat
   - Ruta `/app/fin/calendar` montată în `src/App.tsx`

---

## User stories

- Ca **director financiar**, vreau să blochez luna Decembrie 2025 după reconciliere, pentru că
  nimeni nu trebuie să mai modifice datele fiscale ale acelei luni.
- Ca **contabil**, vreau să văd un calendar lunar cu toate obligațiile mele fiscale, pentru că
  am nevoie de o vedere de ansamblu, nu doar o listă plată.
- Ca **contabil**, vreau să văd imediat care obligații sunt depășite (roșu), care sunt iminente
  (galben) și care sunt plătite (verde), pentru că prioritizez vizual.
- Ca **administrator**, vreau să pot debloca o perioadă în cazuri excepționale (eroare de
  reconciliere), pentru că uneori se fac greșeli care trebuie corectate.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/calendar/lock-period` acceptă `{ year: number, month: number, notes?: string }`.
  Inserează în `fin_period_locks`. Returnează 200 cu lock-ul creat sau 409 dacă deja există.
  Creează notificare in-app pentru toți adminii tenantului: „Perioada <lună> <an> a fost blocată".
  Returnează 403 dacă user nu e admin/accountant.

- [ ] AC2: `DELETE /api/fin/calendar/lock-period/:year/:month` — șterge lock-ul.
  Returnează 404 dacă nu există, 403 dacă user nu e admin.
  Creează notificare in-app: „Perioada <lună> <an> a fost deblocată de <user>".

- [ ] AC3: Middleware guard pe toate rutele de write din `finCalendar.ts`: dacă perioada obligației
  este blocată → returnează 423 Locked cu `{ error: "Perioadă blocată", locked_by, locked_at }`.

- [ ] AC4: Pagina `src/pages/fin/FinCalendarPage.tsx` la ruta `/app/fin/calendar`:
  - Afișează calendar lunar (grid 7×6 sau listă zilnică); navigare lună prev/next.
  - Pe fiecare zi cu obligații: badge cu numărul obligațiilor și culoarea worst-case (pending/paid/overdue).
  - Panou lateral sau secțiune de detaliu: lista obligațiilor zilei selectate cu buton „Marchează plătit".
  - Header cu: luna curentă, buton „Generează obligații" (loading state), badge „Perioadă blocată" dacă e cazul.
  - Buton „Blochează perioada" (pentru admin/accountant) cu modal de confirmare + câmp notes.
  - Design-system tokens, light+dark, WCAG AA, fără hex hardcodat.

- [ ] AC5: Ruta `/app/fin/calendar` montată în `src/App.tsx` și accesibilă din navigare FinDesk
  (link în sidebar `src/components/AppSidebar.tsx` sau echivalent sub secțiunea Finanțe).

- [ ] AC6: Stări de loading, eroare și empty (nicio obligație pentru lună).

- [ ] AC7: Portabilitate DB: zero raw `.execute().rows`. Tenant isolation.

- [ ] AC8: La click „Marchează plătit" → PATCH /calendar/:id/mark-paid → actualizare optimistă UI.
  La perioadă blocată → afișează eroare „Perioadă blocată — nu se pot modifica date" (nu crash).

---

## Files to create / modify

**Create:**
- `src/pages/fin/FinCalendarPage.tsx` — UI calendar fiscal (React + Tailwind + Vector 365 tokens)
- `src/lib/api/finCalendar.ts` — client API React (fetch wrapper pentru /api/fin/calendar/*)

**Modify:**
- `server/routes/finCalendar.ts` — adaugă lock-period + unlock + middleware guard
- `src/App.tsx` — adaugă ruta `/app/fin/calendar`
- `src/components/AppSidebar.tsx` (sau echivalent) — adaugă link Calendar Fiscal sub Finanțe

---

## Tests

- **T-CALENDAR-003-1** `[blocant]` Render fără crash: `<FinCalendarPage />` se montează fără excepție.
- **T-CALENDAR-003-2** `[blocant]` `POST /api/fin/calendar/lock-period` cu body valid → 200 + lock creat.
- **T-CALENDAR-003-3** `[blocant]` `POST /api/fin/calendar/lock-period` a doua oară pe aceeași perioadă → 409.
- **T-CALENDAR-003-4** [normal] `DELETE /api/fin/calendar/lock-period/2025/12` (dacă există) → 200.
- **T-CALENDAR-003-5** [normal] În UI, perioadă blocată afișează badge „Blocat" (test snapshot/text).
- **T-CALENDAR-003-6** [normal] Dark mode: zero culori hex hardcodate în FinCalendarPage.tsx.

---

## Definition of Done

- [ ] AC1–AC8 implementate
- [ ] T-CALENDAR-003-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] Ruta UI montată în App.tsx + link în sidebar
- [ ] Design-system tokens, WCAG AA, light+dark
