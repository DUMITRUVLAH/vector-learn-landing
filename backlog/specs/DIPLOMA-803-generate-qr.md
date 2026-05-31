---
id: DIPLOMA-803
title: "Diplome: generare PDF/JPG per cursant + QR verificare + persistă certificat emis — portat din copy-roas"
milestone: DIPLOMA
phase: 1
status: pending
depends_on: [DIPLOMA-802, CX-703]
slug: generate-qr
---

## Goal

Portează generarea unui certificat individual: randează canvas-ul (DIPLOMA-802) cu numele real al
cursantului, desenează **QR code de verificare**, exportă PDF (A4 landscape) sau JPG, și emite
înregistrarea în `issued_certificates` (DIPLOMA-801) cu token unic.

## Idei de cod trase din copy-roas

`src/pages/DiplomaGenerator.tsx`:
- Sursa de nume: din participanții cohortei (CX-703: studenți CRM + manuali) SAU paste manual din
  Excel (`useManualNames` + textarea, split pe `\n\r\t`, `normalizeCertificateText`). Portează ambele.
- `generateCertificateCanvas(name, index, verificationToken)`: clonează randarea, încarcă fonturile
  (`document.fonts.load`), desenează câmpurile, apoi **QR**: `verifyUrl = {PUBLIC_URL}/verify/{token}`,
  `QRCode.toDataURL(verifyUrl, {width:600,margin:1})`, desenat la poziția/size din `qrConfig`.
- `generateCertificate` → jsPDF landscape A4, `addImage(jpeg, 0,0,297,210)`.
- Persistă înainte de export: `issued_certificates.upsert({certificate_id, participant_name,
  course_name, edition, mentor_name, completion_date})` `onConflict: certificate_id`, citește
  `verification_token` returnat și-l bagă în QR. Portează ca: `POST /api/certificates/issue`
  (tenant-safe) care upsertează și întoarce tokenul, apoi clientul desenează QR-ul cu tokenul.
- Format export selectabil PDF/JPG (toggle).
- Download single („Descarcă Certificat Curent").

## In scope

- Secțiunea 3 din `DiplomaPage`: selectarea participanților (din cohortă + mod manual), preview
  navigabil (← →), toggle PDF/JPG, buton „Descarcă Certificat Curent".
- `POST /api/certificates/issue` (un certificat) tenant-safe → upsert + token.
- Client: `QRCode.toDataURL` + jsPDF (deja în proiect) — desenare QR + export PDF/JPG single.
- Dependențe: `qrcode`, `jspdf` (justificate în PR dacă lipsesc).

## Out of scope

- Generare bulk + ZIP + Drive (DIPLOMA-804).
- Pagina publică `/verify/:token` (DIPLOMA-805) — aici doar emitem tokenul + îl punem în QR.

## User stories

- **US-1**: Ca manager, vreau să generez certificatul unui cursant cu un click, cu QR de verificare.
- **US-2**: Ca manager, vreau să aleg între PDF și JPG.

## Acceptance criteria

- [ ] AC1: Selectez un participant → preview arată numele lui pe certificat.
- [ ] AC2: „Descarcă Certificat Curent" emite în `issued_certificates` (token unic) și descarcă
      fișierul cu QR ce conține `/verify/{token}`.
- [ ] AC3: Re-emiterea aceluiași `certificateId` face upsert (nu duplică), păstrează tokenul.
- [ ] AC4: Toggle PDF/JPG schimbă formatul descărcat.
- [ ] AC5: Nume din paste manual funcționează (normalizat).
- [ ] AC6: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/routes/certificatesIssue.ts` (sau extinde `certificateTemplates.ts`)
- `src/lib/certificateRender.ts` (`generateCertificateCanvas`, `generateCertificatePdf`)
- `src/__tests__/diploma/issue.test.tsx`
- `server/__tests__/certificates-issue.routes.test.ts`

### Modified
- `src/pages/app/DiplomaPage.tsx`
- `package.json` (`qrcode`/`jspdf` dacă lipsesc)

## Tests

- **T-DIPLOMA-803-1** `[blocant]` Issue → rând în `issued_certificates` cu token; QR URL conține tokenul.
- **T-DIPLOMA-803-2** `[blocant]` Re-issue același certificateId → upsert, 1 singur rând, token stabil.
- **T-DIPLOMA-803-3** `[blocant]` Tenant A nu poate emite pe cohorta tenant B.
- **T-DIPLOMA-803-4** Paste manual 3 nume → 3 participanți generabili.

## Definition of Done

- [ ] AC-uri; T-DIPLOMA-803-1..4 trec; build+typecheck+lint+test verzi
- [ ] Migration (dacă e cazul) + API smoke + portability verzi (§3.5.1)
- [ ] ce-adversarial-reviewer (emite token / mutație + cross-tenant): fără finding critic
