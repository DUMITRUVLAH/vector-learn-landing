---
id: DIPLOMA-801
title: "Diplome: schema templates + certificate emise + token verificare — portat din copy-roas"
milestone: DIPLOMA
phase: 1
status: pending
depends_on: [CX-701]
slug: schema-templates
---

## Goal

Fundația modulului de diplome/certificate (lipsește complet la noi — apare doar în FAQ/landing).
Portează cele două tabele din copy-roas (`certificate_templates`, `issued_certificates`) în Drizzle,
**tenant-safe**, plus storage pentru fundalul certificatului.

## Idei de tabele trase din copy-roas

`supabase/migrations` + `src/integrations/supabase/types.ts`:

- `certificate_templates`: `background_url, course_name, edition, fields_config jsonb, is_global
  boolean, name`. `fields_config` = poziții/stiluri câmpuri (vezi DIPLOMA-802) + bloc `qr_code`.
  Portează ca `certificate_templates` cu `tenantId`, `courseId null` (global dacă null), `cohortId
  null`, `isGlobal boolean`, `fieldsConfig jsonb`, `backgroundUrl`.
- `issued_certificates`: `certificate_id (text, unic per emitere), participant_name, course_name,
  edition, mentor_name, completion_date, verification_token (uuid), issued_at`. Portează cu
  `tenantId`, `verificationToken uuid defaultRandom unique`, `certificateId` format
  `{PREFIX}{EDITION}-{YEAR}VA-{n}` (vezi mai jos), `cohortId null`, `participantName`,
  `courseName`, `mentorName null`, `completionDate null`, `issuedAt`.
- Format ID certificat (din `buildCertificateId`): prefix = primele 6 litere din numele cursului
  upper, fără spații; `{prefix}{edition}-{year}VA-{index+1}` (sau fără ediție: `{prefix}-{year}VA-{n}`).
  Portează ca util `server/lib/certificateId.ts` (parametrizează „VA" pe prefixul tenantului).

## In scope

- `server/db/schema/certificates.ts`: `certificate_templates` + `issued_certificates` ca mai sus.
- Index: templates `(tenantId, isGlobal)`, `(tenantId, courseId)`; issued `(tenantId)`,
  unique pe `verificationToken` și pe `(tenantId, certificateId)`.
- `server/lib/certificateId.ts`: `buildCertificateId(prefix, courseName, edition, index)` — portat 1:1.
- Bucket/stocare fundal certificat: folosește mecanismul nostru de upload existent (sau Supabase
  Storage dacă e deja folosit în proiect) — un endpoint `POST /api/certificates/background` care
  întoarce un URL public. Dacă nu există infra de upload, notează în „Backlog descoperit" și
  stochează URL extern dat manual deocamdată.
- `server/routes/certificateTemplates.ts`: CRUD tenant-safe (get global + per curs/cohortă, upsert).
- Migrație generată + committed; export în `schema/index.ts`.

## Out of scope

- Editorul canvas (DIPLOMA-802).
- Generarea PDF/QR (DIPLOMA-803).
- Export bulk (DIPLOMA-804).
- Pagina publică de verificare (DIPLOMA-805).

## User stories

- **US-1**: Ca sistem, vreau să stochez un template de certificat (fundal + poziții câmpuri) per
  tenant, global sau per curs.
- **US-2**: Ca sistem, vreau ca fiecare certificat emis să aibă un token de verificare unic.

## Acceptance criteria

- [ ] AC1: Ambele tabele cu `tenantId` FK cascade; migrație committed; reset+seed trec.
- [ ] AC2: `buildCertificateId("VA","Facebook Ads","Mai2026",0)` → `FACEBO Mai2026-2026VA-1` (fără
      spațiu în prefix) — reproduce copy-roas (test cu input/output fix).
- [ ] AC3: Fără ediție validă (`null`/"default") → format `{prefix}-{year}VA-{n}`.
- [ ] AC4: `verificationToken` unic; CRUD template tenant-safe; login + endpoints 200 (smoke).
- [ ] AC5: zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/db/schema/certificates.ts`
- `server/lib/certificateId.ts`
- `server/routes/certificateTemplates.ts`
- `server/db/migrations/<generated>_certificates.sql`
- `src/__tests__/diploma/certificate-id.test.ts`
- `server/__tests__/certificate-templates.routes.test.ts`

### Modified
- `server/db/schema/index.ts`
- montare rute

## Tests

- **T-DIPLOMA-801-1** `[blocant]` `buildCertificateId` cu/fără ediție → format exact ca copy-roas.
- **T-DIPLOMA-801-2** `[blocant]` Template upsert global apoi per-curs → ambele coexistă, tenant-safe.
- **T-DIPLOMA-801-3** `[blocant]` `verificationToken` unic la 2 emiteri.

## Definition of Done

- [ ] AC-uri; T-DIPLOMA-801-1..3 trec; build+typecheck+lint+test verzi
- [ ] Migration + API smoke + portability verzi (§3.5.1)
