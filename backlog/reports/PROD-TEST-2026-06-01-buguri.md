# Prod functional test — 2026-06-01

Live functional test against `https://vector-learn-landing.vercel.app` (Demo Lingua School tenant).
Tested READ on all 28 routes + WRITE (create student/lead/invoice/payment/task) + ACTIONS
(edit, stage move, mark-paid, convert lead→student, invoice PDF). Test data created as `TEST-*`
and cleaned up (students archived, lead deleted, invoice cancelled).

## ✅ Ce FUNCȚIONEAZĂ (verificat live)
- **Elevi**: listă, creare (201), editare status (200), arhivare (soft-delete 200)
- **CRM Leads**: listă, pipeline, creare lead (201), mutare stadiu (200), adăugare task (201), **convert lead→elev (200, fluxul core)**
- **Facturi**: listă, creare (201), mark-paid (200), cancel (200), **PDF download (200)**
- **Plăți**: listă, stats, creare (201)
- **Module read-OK**: teachers, courses, lessons, rooms, contracts, feedback, payroll, teacher-stats/:id, notifications, cadences, automations, templates, saved-views, pipeline-stages, team/members, audit-log, hr/audit-log, analytics/crm/funnel|roas|forecast

## 🐞 BUGURI GĂSITE

### 🔴 SEVER
**BUG-1 — `/api/cohorts` → 500 și `/api/certificate-templates` → 404 pe prod**
- Modulele CX (Cohorte/Ediții) și DIPLOMA (Certificate) au cod montat în `app.ts` pe main, dar
  **tabelele `cohorts` / `certificate_templates` nu există pe Supabase prod** (migrările 0025/0026
  + DIPLOMA n-au rulat). Orice pagină CX/Diplome va da 500 la client.
- Cauză: aceeași clasă ca bug-ul de azi-dimineață — cod livrat fără migrare pe prod.
- Fix: rulează migrările CX pe prod (acum că auto-migrate la deploy e activ, următorul deploy
  ar trebui să le aplice — DE VERIFICAT). DIPLOMA e doar pending (cod scos), deci scoate și ruta
  `/api/certificate-templates` din `app.ts` până e construit, altfel rămâne 404 montat degeaba.

### 🟡 NORMAL
**BUG-2 — Plăți default `EUR`, dar Facturi default `RON` (inconsecvent pt școală RO)**
- `server/routes/payments.ts:12` + `schema/payments.ts:24` → `currency` default `"EUR"`.
- `server/routes/invoices.ts:14` → `currency` default `"RON"`.
- Pentru un client din România, o plată creată fără currency explicit apare în EUR, dar factura
  aceluiași elev în RON → sume afișate inconsecvent. Ar trebui ambele `RON` default.
- Fix: schimbă default-ul payments la `RON` (rută + schema + migrare pentru coloana existentă).

### 🟢 MINOR / DE CONFIRMAT
**BUG-3 — `dueDate` la factură cere ISO datetime, nu dată simplă**
- `POST /api/invoices` validează `dueDate` ca `z.string().datetime()` → un `<input type="date">`
  (`2026-07-01`) ar da 400. Momentan formularul NU trimite dueDate (deci nu lovește utilizatorul),
  dar dacă se adaugă câmpul „scadență" în UI, va pica. De normalizat la `.toISOString()` în client
  sau de acceptat dată simplă pe server.

**BUG-4 — DELETE student e soft-archive, dar lista default arată și `archived`**
- `DELETE /api/students/:id` setează `status=archived` (corect, GDPR/audit). Dar `GET /api/students`
  fără filtru de status întoarce și elevii arhivați. Posibil intenționat (UI filtrează cu tab-uri),
  dar de confirmat că vederea „activi" nu-i amestecă.

## NU sunt buguri (false-positive din test, verificate)
- `/api/analytics` 404 pe bază → corect, are doar sub-căi (`/crm/funnel` etc.) → 200
- `/api/hr/teacher-stats` 404 pe bază → corect, e `/:id` → 200
- `/api/team` 404 → corect, e `/members` → 200
- `/api/payments/export` 404 → nu există endpoint; PaymentsPage nu-l cheamă
- Factura `dueDate` 400 inițial → payload-ul meu de test, nu bug de UI
