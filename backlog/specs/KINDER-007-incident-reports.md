---
id: KINDER-007
title: Incident/accident reports + parent acknowledgment signature
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001, KINDER-004]
---

## Goal

Grădinițele trebuie să documenteze orice incident sau accident (cădere, înțepătură, ciocnire)
și să obțină semnătura digitală a părintelui ca dovadă că a fost notificat. Raportul devine
document legal în cazul disputelor. Adăugăm: schema DB `incident_reports`, API CRUD complet,
UI `KinderIncidentsPage`, și coloana "Incidente" în sidebar.

## User stories

- Ca educator, vreau să înregistrez rapid un incident (tip, descriere, martor, ora), pentru că uneori se întâmplă mai multe lucruri simultan și trebuie documentate imediat.
- Ca manager, vreau să văd o listă centralizată a tuturor incidentelor cu statusul semnăturii parentale, pentru că autoritatea de licențiere poate cere aceste documente la orice inspecție.
- Ca părinte, vreau să primesc notificarea și să semnez electronic că am fost informat despre incidentul copilului meu, pentru că am dreptul să fiu informat și să am o copie a documentului.
- Ca manager, vreau să export incidentele ca CSV pentru intervalul dorit, pentru că raportul anual de siguranță al grădiniței îl cere.

## Acceptance criteria

1. Schema DB: tabel `incident_reports` cu coloanele:
   - `id` UUID PK
   - `tenant_id` UUID FK → tenants
   - `student_id` UUID FK → students
   - `reported_by_user_id` UUID FK → users (nullable)
   - `incident_date` DATE NOT NULL
   - `incident_time` VARCHAR(5) (HH:MM, optional)
   - `type` VARCHAR(50): enum-like ('fall', 'bite', 'cut', 'allergy', 'behavioral', 'other')
   - `description` TEXT NOT NULL
   - `injury_location` VARCHAR(200) — zona corpului afectată
   - `first_aid_given` TEXT — ce prim ajutor s-a acordat
   - `witness_name` VARCHAR(200) — martori prezenți
   - `parent_notified_at` TIMESTAMP nullable — când a fost notificat
   - `parent_signature_url` TEXT nullable — base64 canvas sau URL
   - `parent_acknowledged_at` TIMESTAMP nullable — când a semnat
   - `status` VARCHAR(20): 'open' | 'parent_notified' | 'acknowledged' | 'closed'
   - `created_at`, `updated_at` TIMESTAMP

2. Migration generată și comisă.

3. API routes montate sub `/api/kinder`:
   - `GET /api/kinder/incidents` — list, suport query `?from=&to=&studentId=`
   - `POST /api/kinder/incidents` — creare incident nou (status inițial: 'open')
   - `GET /api/kinder/incidents/:id` — detaliu incident
   - `PUT /api/kinder/incidents/:id` — update (toate câmpurile editabile)
   - `POST /api/kinder/incidents/:id/notify` — marchează parent_notified_at = now(), status → 'parent_notified'
   - `POST /api/kinder/incidents/:id/acknowledge` — primește `{ signatureDataUrl }`, salvează semnătura, parent_acknowledged_at = now(), status → 'acknowledged'

4. UI `KinderIncidentsPage` (`/app/kinder/incidents`):
   - Tabel cu coloanele: Dată, Copil, Tip, Descriere (truncat), Status, Acțiuni.
   - Buton "Raport nou" → dialog cu form complet (toate câmpurile din schema).
   - Status badge colorat: open=galben, parent_notified=albastru, acknowledged=verde, closed=gri.
   - La clic pe rând: panel lateral sau modal cu detaliu complet.
   - Dacă statusul e 'parent_notified', arată buton "Înregistrare semnătură" ce deschide un canvas de semnătură (refolosind SignatureCanvas din KINDER-001 dacă există).
   - Filtre: interval de date, copil.
   - Buton "Export CSV" pentru lista curentă.

5. Route `/app/kinder/incidents` adăugat în `App.tsx`.

6. Link "Incidente" adăugat în sidebar (AppShell) sub secțiunea Grădiniță.

7. API helpers în `src/lib/api/kinder.ts`.

## Files

### New
- `server/db/schema/kinderIncidents.ts` — schema incident_reports
- `server/routes/kinderIncidents.ts` — CRUD + notify + acknowledge endpoints
- `src/pages/app/KinderIncidentsPage.tsx` — incident list + form UI
- `src/__tests__/kinder-incidents.test.tsx` — unit tests

### Modified
- `server/db/schema/index.ts` — export kinderIncidents
- `server/app.ts` — mount kinderIncidents routes
- `src/App.tsx` — add route `/app/kinder/incidents`
- `src/lib/api/kinder.ts` — add incident API helpers
- `src/components/app/AppShell.tsx` — add sidebar link "Incidente"

## Tests

- **T-KINDER-007-1** [blocant] Given the app is running, When POST /api/kinder/incidents with auth and valid body, Then returns 201 with the created incident.
- **T-KINDER-007-2** [blocant] Given an incident exists, When POST /api/kinder/incidents/:id/acknowledge with signatureDataUrl, Then returns 200 and status is 'acknowledged'.
- **T-KINDER-007-3** [blocant] KinderIncidentsPage renders without crash.
- **T-KINDER-007-4** [normal] GET /api/kinder/incidents returns 200 with array (possibly empty).
- **T-KINDER-007-5** [normal] GET /api/kinder/incidents?from=2024-01-01&to=2024-01-31 returns only incidents in that range.
- **T-KINDER-007-6** [normal] POST /api/kinder/incidents/:id/notify transitions status to 'parent_notified' and sets parent_notified_at.

## DoD

- [ ] Migration committed (`drizzle/XXXX_kinder007_incidents.sql`)
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/KINDER-faza-1-checkin-diary-ratio`
