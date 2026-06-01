---
id: KINDER-001
title: Digital check-in / sign-out — QR/PIN + authorized-pickup + e-signature
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: []
---

## Goal

Grădinițele/daycarele au nevoie de check-in/sign-out digital per copil, cu validare că persoana
care ridică copilul este autorizată. Fără această funcționalitate, un centru daycare nu poate
obține licențiere. Adăugăm: lista de persoane autorizate per copil, un cod PIN/QR de ridicare,
jurnal de intrări/ieșiri cu timestamp + semnătură electronică (canvas base64), și un dashboard
de prezență în timp real vizibil pentru personalul de zi.

## User stories

- Ca educator, vreau să scanez/introduc PIN-ul unui copil la sosire și să văd cine îl poate ridica, pentru că nu pot lăsa un copil cu o persoană neautorizată.
- Ca manager de grădiniță, vreau un jurnal al tuturor intrărilor/ieșirilor zilei cu semnăturile părinților, pentru că inspectoratul poate cere oricând dovada.
- Ca părinte autorizat, vreau să semnez electronic la ridicarea copilului, pentru că nu am timp de formalități pe hârtie.
- Ca educator, vreau să văd în timp real câți copii sunt prezenti în centru, pentru că trebuie să respect raportul legal personal/copii.

## Acceptance criteria

1. Schema: tabelul `authorized_pickups` (id, tenant_id, student_id, name, relation, phone, pin_hash, is_default); tabelul `checkin_log` (id, tenant_id, student_id, checked_in_at, checked_out_at, pickup_person_name, signature_data_url TEXT, staff_user_id, notes).
2. API `GET /api/kinder/checkin/today` — returnează toți copiii tenantului cu status prezent/absent astăzi; date necesare: student name, checked_in_at, checked_out_at, authorized pickups list.
3. API `POST /api/kinder/checkin` — body: `{ studentId, action: "in"|"out", pickupPersonName?, signatureDataUrl?, pin? }`. Validează pin dacă furnizat. Creează/actualizează rândul din `checkin_log` pentru ziua curentă. Returnează log entry.
4. API `GET /api/kinder/students/:id/pickups` — lista de persoane autorizate.
5. API `POST /api/kinder/students/:id/pickups` + `DELETE /api/kinder/students/:id/pickups/:pickupId` — CRUD persoane autorizate.
6. UI `KinderCheckinPage` (`/app/kinder/checkin`): grid de copii (card per copil) cu buton Check-In / Check-Out. La check-out: modal cu câmpul pentru semnătură canvas + dropdown persoane autorizate. Prezenta totala afișată în header (e.g. "8 / 15 copii prezenți").
7. UI `KinderPickupsPage` (`/app/kinder/students/:id/pickups`): tabel cu persoane autorizate, buton Adaugă, formular cu Nume + Relație + Telefon + PIN.
8. Route-urile `/app/kinder/checkin` și `/app/kinder/students/:id/pickups` adăugate în `App.tsx`.
9. Link "Grădiniță → Check-in" adăugat în `AppShell` sidebar.
10. Migrare SQL generată și commitată: `0028_kinder001_checkin.sql`.
11. Test: `KinderCheckinPage` se renderizează fără crash cu date mock. API `POST /api/kinder/checkin` returnează 200 cu log entry valid.

## Files

### New
- `server/db/schema/kinder.ts` — `authorized_pickups` + `checkin_log` tables
- `server/routes/kinder.ts` — routes: checkin today, checkin POST, pickups CRUD
- `src/pages/app/KinderCheckinPage.tsx` — check-in/out grid UI
- `src/pages/app/KinderPickupsPage.tsx` — authorized pickups CRUD
- `src/__tests__/kinder-checkin.test.tsx` — unit tests
- `drizzle/0028_kinder001_checkin.sql` — migration

### Modified
- `server/db/schema/index.ts` — export kinder
- `server/app.ts` — mount kinder routes
- `src/App.tsx` — add routes `/app/kinder/*`
- `src/components/AppShell.tsx` — add sidebar link

## Tests

- **T-KINDER-001-1** [blocant] Given the app is running, When GET /api/kinder/checkin/today is called with auth, Then it returns 200 with an array of student check-in statuses.
- **T-KINDER-001-2** [blocant] Given a student exists, When POST /api/kinder/checkin with action "in", Then checkin_log has a new entry with checked_in_at set and returns 200.
- **T-KINDER-001-3** [blocant] Given KinderCheckinPage renders with empty data, When the component mounts, Then it renders without throwing (smoke test).
- **T-KINDER-001-4** [normal] Given a checkin log entry exists for today with action "in", When POST /api/kinder/checkin with action "out" and signatureDataUrl, Then checked_out_at is set and signature_data_url is stored.
- **T-KINDER-001-5** [blocant] Given the DB schema is migrated, When db:reset && db:seed run, Then no error is thrown.
- **T-KINDER-001-6** [normal] Given authorized_pickups table has entries for a student, When GET /api/kinder/students/:id/pickups, Then returns the list with name and relation fields.

## DoD

- [ ] Migration committed (`0028_kinder001_checkin.sql`)
- [ ] `db:reset && db:seed` green
- [ ] API integration smoke: login + GET /api/kinder/checkin/today → 200
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/KINDER-faza-1-checkin-diary-ratio`
