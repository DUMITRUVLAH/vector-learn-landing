---
id: BUDGET-002
title: "Buget — API buget vs realizat + alerte depășire + UI pagina /app/fin/budget"
milestone: FIN
phase: "20"
status: pending
depends_on: [BUDGET-001, SPEND-002]
spec: backlog/specs/BUDGET-002.md
branch: feat/FIN-budget
---

## Goal

API și UI pentru modulul Buget FinDesk (GAP-ANALYSIS G4):
- Endpoint-uri CRUD pentru bugete și linii.
- Raport „buget vs realizat": compară liniile de buget cu cheltuielile reale (fin_expenses)
  per categorie, folosind soft reference (fin_expenses poate fi absent dacă SPEND nu a fost mersat).
- Alerte depășire: trimite notificare inAppNotification când o linie atinge 80% / 100% din buget.
- Pagina UI `/app/fin/budget` cu tabel bugete + dialog creare + detaliu buget cu linii.

---

## User stories

- Ca **director financiar**, vreau să văd câți lei am cheltuit față de buget per categorie, pentru că trebuie să aprob sau blochez cheltuielile care depășesc planul.
- Ca **contabil**, vreau alertă automată când o categorie ajunge la 80% din buget, pentru că pot ajusta planul înainte de depășire.
- Ca **manager**, vreau să creez un buget nou clonând structura unui buget existent, pentru că nu refac categoriile de la zero în fiecare an.
- Ca **director**, vreau să văd toate bugetele active ale centrului, cu procentul de execuție, pe o singură pagină.

---

## Acceptance criteria

- [ ] AC1: Router `finBudgetRoutes` (Hono) montat în `server/app.ts` la `/api/fin/budget`.
  Endpoint-uri:
  - `GET /` — lista bugete pentru tenant (cu filtre: status, fiscal_year).
  - `POST /` — creare buget nou (cu linii opționale în body).
  - `GET /:id` — detaliu buget + linii.
  - `PUT /:id` — actualizare antet buget (name, status, notes).
  - `POST /:id/lines` — adaugă linie la buget.
  - `PATCH /:id/lines/:lineId` — actualizează o linie (budgeted_cents, label).
  - `DELETE /:id/lines/:lineId` — șterge o linie.
  - `GET /:id/report` — buget vs realizat (linii + cheltuieli reale per categorie).
    Dacă fin_expenses nu există → returnează actuals: 0 pentru toate liniile.

- [ ] AC2: **Raport buget vs realizat** (`GET /:id/report`):
  - Per linie de buget: `{ category, label, budgetedCents, actualCents, remainingCents, pct }`.
  - `actualCents` = SUM(amount_cents) din fin_expenses unde category = linia.category
    și expense_date în intervalul fiscal al bugetului (1 ian → 31 dec pentru an fiscal).
  - Tenant isolation: numai cheltuielile tenant-ului.
  - `pct` = actualCents / budgetedCents * 100, rotunjit la 1 zecimală. `null` dacă budgetedCents = 0.

- [ ] AC3: **Alerte depășire** (post-save pe orice cheltuială sau la cerere via `POST /:id/check-alerts`):
  - Pentru fiecare linie unde `pct >= 80` și `pct < 100`: notificare tip `budget_warning_80`.
  - Pentru fiecare linie unde `pct >= 100`: notificare tip `budget_overrun`.
  - Notificări trimise prin `inAppNotifications` (tabelă existentă) pentru `createdBy` al bugetului.
  - Nu se duplică (verifică dacă notificarea de același tip pentru aceeași linie și buget există în ultimele 24h).

- [ ] AC4: **Pagina UI** `src/pages/app/BudgetPage.tsx` la ruta `/app/fin/budget`:
  - KPI cards: Total bugete active, Total bugetat (MDL), Total realizat (MDL), Procentaj execuție medie.
  - Tabel bugete: Nume | An fiscal | Departament | Status | Execuție (progress bar) | Acțiuni.
  - Buton „Buget nou" → dialog cu form: name, fiscal_year, department, notes, + linii inițiale.
  - Click pe buget → detaliu cu tabel linii: Categorie | Bugetat | Realizat | Rămas | % | Alert.
  - Design-system tokens, dark mode, WCAG AA.

- [ ] AC5: API client `src/lib/api/finBudget.ts` cu funcții tipizate.

- [ ] AC6: Route `/app/fin/budget` înregistrată în `src/App.tsx`.

- [ ] AC7: Zero raw `.execute().rows`. Tenant isolation pe toate endpoint-urile. `requireAuth`.

---

## Files to create / modify

**Create:**
- `server/routes/finBudget.ts`
- `src/pages/app/BudgetPage.tsx`
- `src/lib/api/finBudget.ts`
- `src/__tests__/fin/budget-002.test.tsx`

**Modify:**
- `server/app.ts` — montare `finBudgetRoutes` la `/api/fin/budget`
- `src/App.tsx` — ruta `/app/fin/budget` → `<BudgetPage />`

---

## Tests

- **T-BUDGET-002-1** `[blocant]` Given render BudgetPage, Then nu crează erori (smoke).
- **T-BUDGET-002-2** `[blocant]` Given buget cu 2 linii (500 MDL + 300 MDL), When GET /:id/report, Then actualCents corect per categorie.
- **T-BUDGET-002-3** `[blocant]` Given linie la 85% din buget, When check-alerts, Then notificare budget_warning_80 creată.
- **T-BUDGET-002-4** `[blocant]` Given live API smoke: POST /api/auth/login + GET /api/fin/budget, Then 200 + JSON.
- **T-BUDGET-002-5** [normal] Given buget fără cheltuieli (fin_expenses absent), When GET /:id/report, Then actualCents=0, pct=0 pentru toate liniile.
- **T-BUDGET-002-6** [normal] Given 3 bugete în tabel, When filtru status=active, Then doar bugetele active returnate.

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Router montat în app.ts + ruta înregistrată în App.tsx
- [ ] Build + typecheck + lint verzi
- [ ] Static guards verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
