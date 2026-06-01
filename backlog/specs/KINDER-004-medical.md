---
id: KINDER-004
title: Medical — allergies, immunization records, medication log
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001]
---

## Goal

Grădinițele/daycarele sunt obligate legal să dețină evidența alergiilor, vaccinurilor și
medicamentelor administrate. Brightwheel și Procare fac din aceasta o funcționalitate centrală
de compliance. Adăugăm: profil medical per copil (alergii + note medic), registru de
vaccinuri cu status/dată scadentă, și jurnal de medicamente administrate cu doza + ora +
confirmarea personalului — totul vizibil pentru personalul autorizat din centru.

## User stories

- Ca educator, vreau să văd imediat alergiile unui copil înainte de masă, pentru că o reacție alergică poate fi fatală.
- Ca manager, vreau să știu care copii nu au vaccinurile la zi, pentru că inspectoratul poate suspenda licența dacă nu sunt respectate normele.
- Ca asistent medical, vreau să înregistrez administrarea unui medicament cu doză și oră, pentru că trebuie să existe o dovadă scrisă că am dat medicamentul corect.
- Ca parties (management), vreau un raport al stării vaccinărilor pentru toată grădinița, pentru că trebuie să îl prezint la reînnoire licenței.

## Acceptance criteria

1. Schema `kinder_medical`:
   - `child_allergies` (id, tenant_id, student_id, allergen VARCHAR(200), reaction_type ENUM('mild','moderate','severe'), notes TEXT, created_at, updated_at)
   - `immunization_records` (id, tenant_id, student_id, vaccine_name VARCHAR(200), administered_date DATE, next_due_date DATE, provider VARCHAR(200), notes TEXT, created_at)
   - `medication_log` (id, tenant_id, student_id, log_date DATE, medication_name VARCHAR(200), dosage VARCHAR(100), administered_at TIMESTAMP WITH TIME ZONE, administered_by_user_id UUID → users.id, parent_consent BOOLEAN DEFAULT false, notes TEXT, created_at)

2. API `GET /api/kinder/medical/:studentId` — returnează profilul medical complet: `{ allergies[], immunizations[], todayMedications[] }`. Autentificare obligatorie (tenant-scoped).

3. API `POST /api/kinder/medical/:studentId/allergies` + `DELETE /api/kinder/medical/:studentId/allergies/:allergyId` — CRUD alergii.

4. API `POST /api/kinder/medical/:studentId/immunizations` + `PUT /api/kinder/medical/:studentId/immunizations/:immId` — creare/actualizare vaccinuri.

5. API `POST /api/kinder/medical/:studentId/medications` — adăugare intrare jurnal medicamente pentru ziua curentă. Body: `{ medicationName, dosage, administeredAt, parentConsent }`. Returnează log entry.

6. API `GET /api/kinder/immunization-status` — raport tenantului: toți copiii cu vaccinuri `next_due_date <= today + 30 days` (cu risc de expirare) sau `administered_date null` (fără vaccinare înregistrată).

7. UI `KinderMedicalPage` (`/app/kinder/students/:studentId/medical`):
   - Tab "Alergii": tabel cu Alergen + Tip reacție + Note; buton Adaugă; badge roșu dacă `reaction_type === 'severe'`.
   - Tab "Vaccinuri": tabel cu Vaccin + Data admin + Scadența; badge galben/roșu dacă scadent/scadent în 30 zile.
   - Tab "Medicamente azi": tabel cu Medicament + Doză + Ora adminstrare + Administrat de; buton Adaugă.

8. UI `KinderImmunizationReportPage` (`/app/kinder/immunization-report`): tabel cu toți copiii, coloana "Status vaccinare" (verde/galben/roșu), filtrabil, exportabil CSV.

9. Route-urile `/app/kinder/students/:studentId/medical` și `/app/kinder/immunization-report` adăugate în `App.tsx`.

10. Link "Grădiniță → Vaccinuri" adăugat în sidebar sub "Grădiniță".

11. Migrare SQL `0031_kinder004_medical.sql` commitată. `db:reset && db:seed` tree.

12. Test: `KinderMedicalPage` se renderizează fără crash. API `POST /api/kinder/medical/:studentId/allergies` returnează 201 cu alergia creată.

## Files

### New
- `server/db/schema/kinderMedical.ts` — `child_allergies`, `immunization_records`, `medication_log`
- `server/routes/kinderMedical.ts` — toate endpoint-urile medicale
- `src/pages/app/KinderMedicalPage.tsx` — pagina cu 3 taburi
- `src/pages/app/KinderImmunizationReportPage.tsx` — raport vaccinuri
- `src/__tests__/kinder-medical.test.tsx` — unit tests
- `drizzle/0031_kinder004_medical.sql` — migration

### Modified
- `server/db/schema/index.ts` — export kinderMedical
- `server/app.ts` — mount kinderMedical routes
- `src/App.tsx` — add routes `/app/kinder/students/:studentId/medical`, `/app/kinder/immunization-report`
- `src/components/AppShell.tsx` — add sidebar link

## Tests

- **T-KINDER-004-1** [blocant] Given the app is running, When GET /api/kinder/medical/:studentId with auth, Then returns 200 with `{ allergies, immunizations, todayMedications }`.
- **T-KINDER-004-2** [blocant] Given a student exists, When POST /api/kinder/medical/:studentId/allergies with `{ allergen: "Lactoza", reaction_type: "severe" }`, Then returns 201 with the allergy record.
- **T-KINDER-004-3** [blocant] Given KinderMedicalPage renders with mock data, When the component mounts, Then it renders without throwing (smoke test).
- **T-KINDER-004-4** [blocant] Given schema is migrated, When db:reset && db:seed run, Then no error is thrown.
- **T-KINDER-004-5** [normal] Given a student has 2 allergies, When GET /api/kinder/medical/:studentId, Then allergies array length is 2.
- **T-KINDER-004-6** [normal] Given a student has an immunization with next_due_date in the past, When GET /api/kinder/immunization-status, Then the student appears in the at-risk list.
- **T-KINDER-004-7** [normal] Given POST /api/kinder/medical/:studentId/medications with valid body, When the request completes, Then medication_log has a new row with correct dosage.

## DoD

- [ ] Migration committed (`0031_kinder004_medical.sql`)
- [ ] `db:reset && db:seed` green
- [ ] API integration smoke: login + GET /api/kinder/medical/:studentId → 200
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/KINDER-faza-1-checkin-diary-ratio`
