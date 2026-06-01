---
id: CONSENT-001
title: "Formulare de consimțământ (foto, excursii, medical, GDPR) cu e-semnătură"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-001, GUARDIAN-001]
slug: consent-forms-esignature
---

## Goal

Permite unui admin să creeze **șabloane de formulare de consimțământ** (model foto/video, excursie,
tratament medical, prelucrare date GDPR) și să le trimită tutorelui/părintelui elevului.
Tutorele **semnează electronic** (nume tastat + timestamp), adminul vede statusul (pending/signed/declined)
per tutore per formular.

Conectat la: `students` (pentru care se creează formularul), `student_guardians` (GUARDIAN-001)
(cine semnează), `tenants` (tenant-safe).

## In scope

### Schema nouă `server/db/schema/consent.ts`
- `consent_templates`:
  - `id` uuid PK defaultRandom
  - `tenantId` FK → tenants cascade
  - `title` varchar(200) not null
  - `body` text not null — conținut HTML/text al formularului
  - `category` varchar(50) — ex. „photo_video", „field_trip", „medical", „gdpr" (nu enum, varchar
    pentru flexibilitate)
  - `isActive` boolean not null default true
  - timestamps
  - Index pe `(tenantId, isActive)`.
- `consent_requests`:
  - `id` uuid PK defaultRandom
  - `tenantId` FK → tenants cascade
  - `templateId` FK → consent_templates cascade
  - `studentId` FK → students cascade
  - `guardianId` FK → student_guardians cascade
  - `status` varchar(20) not null default 'pending' — 'pending' | 'signed' | 'declined'
  - `signedAt` timestamp with time zone (null dacă pending/declined)
  - `signedByName` varchar(200) — numele tastat de tutore la semnare
  - `declinedAt` timestamp with time zone (null dacă pending/signed)
  - `declineReason` varchar(500)
  - `sentAt` timestamp with time zone default now()
  - timestamps
  - Unique pe `(templateId, studentId, guardianId)` — un tutore semnează un formular o singură dată.
  - Index pe `(tenantId, status)`.
  - Index pe `(tenantId, studentId)`.
- Export în `server/db/schema/index.ts`.

### Migrare
- Fișier manual `drizzle/0036_consent001_forms.sql` (prefix 0036 > max 0035).
- Orice `CREATE TYPE` enum înfășurat în `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;`.
  (Această migrare nu folosește enum-uri, deci guard-ul nu e necesar, dar pattern-ul se respectă.)
- Journal `drizzle/meta/_journal.json` actualizat (idx=36).
- `db:reset && db:seed` trec.

### `server/routes/consent.ts`
Toate rutele cer `requireAuth`. Montat la `/api/school/consent`.

**Șabloane:**
- `GET /api/school/consent/templates` — listează șabloanele active ale tenant-ului. Limit ≤ 100.
- `POST /api/school/consent/templates` body `{title, body, category?, isActive?}` → 201.
- `PATCH /api/school/consent/templates/:templateId` — actualizează titlu/body/category/isActive.
- `DELETE /api/school/consent/templates/:templateId` → 204.

**Cereri (requests):**
- `GET /api/school/consent/requests` — listează cererile tenant-ului.
  Query params: `?studentId=`, `?status=`, `?templateId=`. Limit ≤ 100.
  Include join cu template (title, category) + student (name) + guardian (fullName).
- `POST /api/school/consent/requests` body `{templateId, studentId, guardianIds: string[]}` →
  creează o cerere per guardian (skip dacă există deja același (templateId, studentId, guardianId)).
  Validare: templateId și studentId trebuie să aparțină tenant-ului. guardianIds trebuie să fie
  tutori ai elevului respectiv. Max 20 cereri create odată (limitare anti-spam).
  Returnează `{created: N, skipped: N}`.
- `POST /api/school/consent/requests/:requestId/sign` body `{name: string}` →
  semnează (status→signed, signedAt=now(), signedByName=name).
  Dacă `name` e gol → 400 `{error:"name_required"}`.
  Dacă status ≠ pending → 409 `{error:"already_processed"}`.
- `POST /api/school/consent/requests/:requestId/decline` body `{reason?: string}` →
  refuză (status→declined, declinedAt=now()).
  Dacă status ≠ pending → 409 `{error:"already_processed"}`.

Montare în `server/app.ts` la `/api/school/consent`.

### UI `src/pages/app/SchoolConsentPage.tsx`
La ruta `/app/school/consent`.

Trei tab-uri:
1. **Șabloane** — card grid cu șabloanele active. Buton „Șablon nou" → modal cu formular (title,
   category dropdown, body textarea). Edit / Delete per card.
2. **Cereri** — tabel cu cererile (elev, tutore, șablon, categorie, status badge, data trimiterii,
   data semnării). Filter chips: Pending / Semnat / Refuzat. Buton „Trimite cerere" → modal cu
   select elev + select tutori (checkbox) + select șablon.
3. **Semnare publică** (preview) — vizualizarea ce ar vedea tutorele: conținut formular +
   câmp „Semnez ca (nume complet)" + buton „Semnez" / „Refuz". (Mockup UX — în prod ar fi un link
   public unic; în această versiune adminul poate semna din interfața admin cu un buton „Simulare
   semnare".)

Status badges: `pending` = galben, `signed` = verde, `declined` = roșu (tokeni semantici).

Tokeni Vector 365, dark-mode, RO. Fără hex-uri hardcodate.

**`src/lib/api/consent.ts`**: funcțiile client:
- `listConsentTemplates()`, `createConsentTemplate(data)`, `updateConsentTemplate(id, data)`,
  `deleteConsentTemplate(id)`
- `listConsentRequests(filters?)`, `createConsentRequests(data)`, `signConsentRequest(id, name)`,
  `declineConsentRequest(id, reason?)`

### Integrare nav
- Link în AppShell: „Consimțământ" cu icon `ClipboardSignature` sau `FileCheck`, în secțiunea Școală.
- Ruta în `src/app.tsx` → `<SchoolConsentPage />`.

## Out of scope
- Link public unic de semnare (JWT one-time token) — varianta completa e pentru o iterație ulterioară.
- Notificări automate email/SMS la trimiterea cererii — se face în COMM.
- Arhivare / audit-trail avansat al semnăturilor.

## Acceptance criteria
- AC1: Pot crea un șablon cu titlu + conținut + categorie; il văd în lista de șabloane.
- AC2: Pot trimite o cerere de consimțământ pentru un elev la 1–N tutori; cererea apare cu
  status „pending" în tabel.
- AC3: Nu se poate crea o cerere duplicat (același templateId + studentId + guardianId) — se
  raportează `skipped`.
- AC4: Semnarea cu un nume valid schimbă status-ul în „signed" + salvează signedAt + signedByName.
- AC5: Semnarea cu câmp gol întoarce 400 `name_required`.
- AC6: O cerere deja semnată sau refuzată nu poate fi procesată din nou — 409 `already_processed`.
- AC7: Tot e tenant-scoped; un tenant nu vede șabloanele/cererile altui tenant.
- AC8: Migrare 0036 committed, fără collision; `db:reset && db:seed` trec; API live → 200.

## Tests (Given/When/Then)

- **T-CONSENT-001-1** [blocant] Given migrare 0036 aplicată, When `SELECT * FROM consent_templates`,
  Then tabelul există cu coloanele corecte și prefixul 0036 > 0035 (gate migrare + collision).
- **T-CONSENT-001-2** [blocant] Given un tenant logat, When `POST /api/school/consent/templates`
  cu `{title:"Foto-video",body:"Consimt...",category:"photo_video"}`, Then 201 + template creat.
- **T-CONSENT-001-3** [blocant] Given un template + un student + 2 tutori (GUARDIAN-001),
  When `POST /api/school/consent/requests` cu `{templateId, studentId, guardianIds:[g1,g2]}`,
  Then `{created:2, skipped:0}` (201) și 2 cereri status pending în GET.
- **T-CONSENT-001-4** [blocant] Given o cerere pending, When `POST .../sign` cu `{name:"Ion Popescu"}`,
  Then status→signed, signedByName→"Ion Popescu", signedAt setat (verificat în GET requests).
- **T-CONSENT-001-5** [blocant] Given o cerere deja semnată, When `POST .../sign` din nou,
  Then 409 `{error:"already_processed"}`.
- **T-CONSENT-001-6** [blocant] Given o cerere pending, When `POST .../sign` cu `{name:""}`,
  Then 400 `{error:"name_required"}`.
- **T-CONSENT-001-7** [blocant] Given serverul pornit, When login + `GET /api/school/consent/templates`,
  Then 200 + JSON cu `{templates:[]}` (live API smoke).
- **T-CONSENT-001-8** [normal] Given SchoolConsentPage, When randat cu mock-uri,
  Then se randează fără crash și afișează tab-ul Șabloane (render test).
- **T-CONSENT-001-9** [normal] Given un request trimis de 2 ori cu aceleași (templateId,studentId,guardianId),
  When al doilea POST /requests, Then `{created:0, skipped:1}` (dedup funcționează).

## DoD
Build+typecheck+lint+unit verzi, migrare 0036 committed fără collision, `db:reset`+`db:seed` OK,
API live 200, reviewer APPROVED după review→improve, persona reports salvate, commit pe
`feat/SCHOOL-faza-1-fundatie`.
