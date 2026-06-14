---
id: CALENDAR-002
title: "Generator obligații din profil fiscal + FISC + PAY + remindere in-app"
milestone: FIN
phase: "14"
status: pending
depends_on: [CALENDAR-001, FISC-002, PAY-002]
spec: backlog/specs/CALENDAR-002.md
branch: feat/FIN-calendar
---

## Goal

Implementează motorul de generare a obligațiilor fiscale și de plată (DETERMINIST, nu AI) și
sistemul de remindere in-app pentru termenele scadente:

1. **`POST /api/fin/calendar/generate`** — generează obligațiile pentru o lună dată din:
   - Profil fiscal al tenantului (jurisdicție MD/RO din tenants sau din fin_registry_items)
   - Declarații TVA calculate (FISC-002 `fin_tax_declarations.payload.vat_due_cents`)
   - Ruluri payroll (PAY-002 `fin_payroll_runs` → sumă brut → CAS/CNAM/impozit venit)
   Generează sau actualizează `fin_obligations` fără duplicate (UPSERT per tip+perioadă).

2. **`GET /api/fin/calendar`** — listează obligațiile filtrate: `?year=&month=&status=&type=`
   Returnează și perioadele blocate (`fin_period_locks`) pentru luna dată.

3. **`PATCH /api/fin/calendar/:id/mark-paid`** — marchează o obligație ca paid + setează paid_at.
   Refuză dacă perioada este blocată (`fin_period_locks` pentru luna respectivă).

4. **Remindere in-app** — la generare, dacă `due_date - now() <= 7 zile`, creează o notificare
   in-app (`in_app_notifications`) pentru utilizatorii cu rol `admin` sau `accountant` ai tenantului.
   Un singur reminder per obligație pe zi (idempotent). Refolosește `inAppNotifications` existent.

Calcule deterministe: CAS angajat = 24% brut (MD 2026), CAS angajator = 24% brut, CNAM = 9% brut,
impozit venit = TVA din FISC-002 payload. Cotele pot fi suprascrise de `fin_registry_items` (REGISTRY-002).

---

## User stories

- Ca **contabil**, vreau să apăs „Generează obligații" pentru luna curentă și să văd automat
  toate plățile datorete (TVA, CAS, salariu), pentru că calculul manual durează ore și greșesc.
- Ca **director financiar**, vreau să primesc o notificare in-app când un termen fiscal e în 7 zile,
  pentru că nu pot monitoriza tot calendarul fiscal manual.
- Ca **contabil**, vreau să marchez o obligație ca plătită dintr-un click, pentru că îmi confirmă
  că am efectuat plata și nu mai e în lista de urgențe.
- Ca **auditor**, vreau să văd că nu se pot marca plăți în perioadele blocate, pentru că integritatea
  datelor fiscale trebuie garantată.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/calendar/generate` acceptă `{ year: number, month: number }` și returnează
  `{ created: number, updated: number, obligations: FinObligation[] }`.
  Generează obligații pentru:
  - TVA-MD (dacă jurisdicție MD): amount din fin_tax_declarations.payload.vat_due_cents, due_date = ziua 25 luna următoare
  - Salariu: amount din fin_payroll_runs.net_total_cents (dacă există run pentru luna), due_date = ultima zi a lunii
  - CAS angajat (24% din gross): due_date = ziua 25 luna următoare
  - CAS angajator (24% din gross): due_date = ziua 25 luna următoare
  - CNAM (9% din gross): due_date = ziua 25 luna următoare
  Dacă nu există declarație FISC/payroll run → amount_cents = 0 (obligație „de verificat").

- [ ] AC2: UPSERT logic — dacă obligația (tenant_id, obligation_type, period_year, period_month)
  există deja, actualizează amount_cents și due_date; nu creează duplicate.

- [ ] AC3: `GET /api/fin/calendar?year=&month=&status=&type=` returnează
  `{ obligations: FinObligation[], locked_periods: FinPeriodLock[] }`.
  Filtre opționale: `status` (pending|paid|overdue), `type` (tva_md|cas_employee|...).
  Tenant isolation: returnează doar datele tenant-ului autentificat.

- [ ] AC4: `PATCH /api/fin/calendar/:id/mark-paid` returnează 200 cu obligația actualizată, sau
  400 dacă perioada este blocată (`fin_period_locks` are entry pentru (tenant_id, year, month)).

- [ ] AC5: Remindere in-app: la `POST /api/fin/calendar/generate`, dacă `due_date - now() <= 7 zile`,
  inserează în `in_app_notifications` câte o notificare per user cu rol admin/accountant:
  `{ kind: 'fiscal_reminder', payload: { body: 'Termen fiscal în X zile: <description>', obligation_id } }`.
  Idempotent: verifică dacă notificarea există deja înainte de inserare (pe baza kind+obligation_id în payload).

- [ ] AC6: Cotele CAS/CNAM pot fi suprascrise din `fin_registry_items` (cheie `cas_rate_bp`, `cnam_rate_bp`).
  Dacă nu există în REGISTRY → folosește hardcodat 2400bp (24%) și 900bp (9%).

- [ ] AC7: Rute montate în `server/app.ts`: `app.route("/api/fin/calendar", finCalendarRoutes)`.

- [ ] AC8: Portabilitate DB: folosește `db.query.X.findMany()` — zero raw `.execute().rows`.

- [ ] AC9: Design-system tokens în UI (CALENDAR-003 face UI — acest item e backend-only).

---

## Files to create / modify

**Create:**
- `server/lib/fin/obligationGenerator.ts` — motor generare obligații (DETERMINIST, zero AI)
- `server/routes/finCalendar.ts` — Hono router cu generate, list, mark-paid

**Modify:**
- `server/app.ts` — montează `finCalendarRoutes` la `/api/fin/calendar`
- `server/db/schema/finCalendar.ts` — adaugă index pe `status` dacă lipsit (minor)

---

## Tests

- **T-CALENDAR-002-1** `[blocant]` Integration smoke: server pornit, `POST /api/fin/calendar/generate`
  cu body `{year:2026,month:1}` → 200 cu `obligations` array.
- **T-CALENDAR-002-2** `[blocant]` `GET /api/fin/calendar?year=2026&month=1` → 200 cu `obligations` + `locked_periods`.
- **T-CALENDAR-002-3** `[blocant]` `PATCH /api/fin/calendar/:id/mark-paid` pe obligație din perioadă
  neblocată → 200, status devine 'paid'.
- **T-CALENDAR-002-4** [normal] PATCH mark-paid pe perioadă blocată → 400.
- **T-CALENDAR-002-5** [normal] Generare de 2 ori pentru aceeași perioadă produce același număr de
  obligații (nu duplicate — UPSERT funcționează).
- **T-CALENDAR-002-6** [normal] Dacă `due_date - now() <= 7 zile`, in_app_notifications conține
  entry cu kind='fiscal_reminder'.

---

## Definition of Done

- [ ] AC1–AC9 implementate
- [ ] T-CALENDAR-002-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] Ruta montată în app.ts
- [ ] Portabilitate DB (zero raw execute)
