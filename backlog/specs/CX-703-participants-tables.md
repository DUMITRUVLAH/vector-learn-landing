---
id: CX-703
title: "CX: participanți per cohortă din 2 surse (înrolări CRM + manual) cu 3 tabele — portat din copy-roas"
milestone: CX
phase: 1
status: pending
depends_on: [CX-702, CRM-111]
slug: participants-tables
---

## Goal

Portează inima modulului CX din copy-roas: lista de participanți a unei cohorte, **fuzionată din
două surse** (CRM + manual), împărțită în 3 tabele după statusul de plată. La noi sursa „CRM" sunt
**studenții convertiți din leads** (`students` + relația lead→student din CRM-111) plus un tabel nou
de **participanți manuali** (echivalentul `cx_manual_participants`).

## Idei de cod / tabele trase din copy-roas

`src/hooks/useCXData.ts` + `src/pages/CX.tsx`:

- Tabel `cx_manual_participants` (copy-roas): `course_name, edition, participant_name, email, phone,
  notes, whatsapp_joined boolean, payment_status ('full'|'half'|'free'|null), amount`. Portează ca
  `cohort_participants` legat de `cohortId` + `tenantId` (NU pe nume curs liber).
- Maparea statusurilor: copy-roas folosește `won` (full), `achitat_12` (½ plată), `pending_payment`
  (cont de plată), `free`. La noi mapăm pe enum nou `participant_payment_status`:
  `full | half | pending | free`, plus sursă `crm | manual`.
- **Fuziune surse**: participanții CRM = studenți înrolați în cohortă (din conversia lead→student,
  cu suma din `payments`/contract); participanții manual = rândurile din `cohort_participants`.
  Hook-ul `getParticipantsForEdition` combină ambele liste (portează această fuziune).
- **3 tabele în UI** (din `EditionContent`):
  - „Cursanți Înscriși" — status full + half (achitat full și 1/2).
  - „Gratuit" — status free.
  - „Cont de Plată" — status pending (lead-uri în așteptare).
- Bara de stat (din `EditionContent`): `paidCount` (full+half), split `(N full, N ½)`,
  `pendingCount`, **Încasat** (sumă full+half), **Expected** (full + half×2 + pending).
- Toggle `whatsapp_joined` per participant (coloană în tabel). Portează ca buton/checkbox.
- Optimistic add/update/delete pentru participanți manuali (copy-roas face optimistic + rollback).

## In scope

- Schema `server/db/schema/cohortParticipants.ts`:
  - `cohort_participants`: `id, tenantId(FK), cohortId(FK→cohorts cascade), studentId(FK→students null
    pentru manual), fullName, email, phone, notes, whatsappJoined boolean default false,
    paymentStatus enum, amountCents integer default 0, source enum('crm'|'manual'), timestamps`.
  - Index `(tenantId, cohortId)`.
- `server/routes/cohortParticipants.ts`:
  - `GET /api/cohorts/:cohortId/participants` → fuziune: studenți înrolați (din CRM) + manuali, cu
    statusul de plată dedus. Tenant-safe.
  - `POST` (adaugă manual), `PATCH /:id` (nume/email/phone/amount/status/whatsapp), `DELETE /:id`.
- UI `src/components/modules/cx/ParticipantTable.tsx` (reutilizabil pt cele 3 tabele) + integrare în
  `CXPage` sub header-ul cohortei.
- Bara de stat (Înscriși / Paid / Plată / Încasat / Expected) — `src/components/modules/cx/CohortStats.tsx`.
- Optimistic updates pe acțiunile manuale.

## Out of scope

- Export CSV (CX-704).
- Break-even/profit badge (CX-705).
- SMS/WhatsApp send real (doar toggle-ul de stare aici, fără gateway).

---

## User stories

- **US-1**: Ca manager, vreau să văd toți cursanții unei cohorte, indiferent dacă au venit din CRM
  sau i-am adăugat manual.
- **US-2**: Ca manager, vreau să adaug rapid un cursant care nu e în CRM (ex. plătit cash).
- **US-3**: Ca manager, vreau să văd cât am încasat și cât aștept (expected) pe cohortă.

## Acceptance criteria

- [ ] AC1: `cohort_participants` cu `tenantId`+`cohortId` FK cascade; migrație committed; reset+seed trec.
- [ ] AC2: `GET .../participants` întoarce fuziunea CRM+manual; manualii au `source='manual'`,
      studenții înrolați `source='crm'`.
- [ ] AC3: 3 tabele afișează corect: full+half în „Înscriși", free în „Gratuit", pending în „Cont Plată".
- [ ] AC4: „Încasat" = Σ(full+half); „Expected" = Σ(full) + Σ(half)×2 + Σ(pending) — reprodus din copy-roas.
- [ ] AC5: Adăugare manual = optimistic, cu rollback la eroare; persistă în DB.
- [ ] AC6: Toggle WhatsApp persistă; tenant isolation testat; zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/db/schema/cohortParticipants.ts`
- `server/routes/cohortParticipants.ts`
- `server/db/migrations/<generated>_cohort_participants.sql`
- `src/components/modules/cx/ParticipantTable.tsx`
- `src/components/modules/cx/CohortStats.tsx`
- `src/hooks/useCohortParticipants.ts`
- `src/__tests__/cx/participants.test.tsx`
- `server/__tests__/cohort-participants.routes.test.ts`

### Modified
- `server/db/schema/index.ts`
- `src/pages/app/CXPage.tsx`

## Tests

- **T-CX-703-1** `[blocant]` Cohortă cu 2 studenți CRM + 1 manual → `GET` întoarce 3, surse corecte.
- **T-CX-703-2** `[blocant]` „Expected" = full + half×2 + pending (valori fixe).
- **T-CX-703-3** `[blocant]` Add manual → apare optimistic, persistă, reload îl arată.
- **T-CX-703-4** Tenant A nu vede participanții cohortei tenant B.

## Definition of Done

- [ ] AC-uri; T-CX-703-1..4 trec; build+typecheck+lint+test verzi
- [ ] Migration + API smoke + portability verzi (§3.5.1)
- [ ] integration-architect: CONNECTED (lead→student→cohort→participant chain reală)
