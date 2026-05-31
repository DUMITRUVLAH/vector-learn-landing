---
id: DIPLOMA-805
title: "Diplome: pagină publică de verificare certificat /verify/:token (no-auth) — portat din copy-roas"
milestone: DIPLOMA
phase: 1
status: pending
depends_on: [DIPLOMA-803]
slug: public-verify
---

## Goal

Portează pagina publică de verificare a unui certificat (din `src/pages/VerifyCertificate.tsx`
copy-roas). QR-ul de pe diplomă duce aici; oricine scanează vede dacă certificatul e autentic, fără
autentificare. Aliniat cu pattern-ul nostru de rute publice (avem deja `feedbackPublic` — la fel,
o rută publică ce NU cere tenant/login).

## Idei de cod trase din copy-roas

`src/pages/VerifyCertificate.tsx` + ruta `/verify/:token`:
- Citește `verification_token` din URL, caută în `issued_certificates`, afișează: nume participant,
  curs, ediție, mentor, dată finalizare, `certificate_id`, data emiterii — cu un marcaj „✓ Certificat
  autentic". Dacă tokenul nu există → stare „Certificat negăsit / invalid".
- E o pagină publică, în afara `PasswordGate` (la noi: în afara auth-ului de app, ca `feedbackPublic`).

## In scope

- `server/routes/certificatesPublic.ts`: `GET /api/public/certificates/:token` — NU cere auth/tenant;
  întoarce DOAR câmpuri non-sensibile (nume, curs, ediție, mentor, dată, certificateId, issuedAt).
  Nu expune email/telefon/sume. Rată-limită (avem `hono-rate-limiter`).
- Pagina `src/pages/public/VerifyCertificatePage.tsx` montată pe `/verify/:token` (rută publică,
  în afara layout-ului autentificat).
- Stări: loading, valid (card cu detalii + badge verde), invalid/negăsit (card neutru).
- Design system tokens, dark mode, mobil-first (se scanează de pe telefon).

## Out of scope

- Revocarea/expirarea certificatelor.
- PDF re-download din pagina publică.

## User stories

- **US-1**: Ca angajator/terț, vreau să scanez QR-ul de pe diplomă și să confirm că e reală.
- **US-2**: Ca absolvent, vreau un link public care dovedește certificatul meu.

## Acceptance criteria

- [ ] AC1: `/verify/:token` valid → afișează nume/curs/ediție/mentor/dată/ID + badge „autentic".
- [ ] AC2: Token inexistent → stare „certificat invalid", fără crash, fără leak de date.
- [ ] AC3: Endpoint public NU întoarce email/telefon/sume; nu cere auth.
- [ ] AC4: Rate limiting activ pe endpoint.
- [ ] AC5: 0 axe critical/serious; dark mode; mobil; zero `any`.
- [ ] AC6: Lighthouse a11y/perf/SEO ≥ 90 (pagină publică).

## Files

### New
- `server/routes/certificatesPublic.ts`
- `src/pages/public/VerifyCertificatePage.tsx`
- `src/__tests__/diploma/public-verify.test.tsx`
- `server/__tests__/certificates-public.routes.test.ts`

### Modified
- router (rută publică `/verify/:token`)
- montare rută publică în server (lângă `feedbackPublic`)

## Tests

- **T-DIPLOMA-805-1** `[blocant]` Token valid → 200 cu câmpurile publice; FĂRĂ email/telefon/sumă.
- **T-DIPLOMA-805-2** `[blocant]` Token inexistent → 404/stare invalid, fără leak.
- **T-DIPLOMA-805-3** `[blocant]` Endpoint accesibil fără header de auth (public).
- **T-DIPLOMA-805-4** Round-trip: issue (DIPLOMA-803) → token → `/verify/:token` arată acel cursant.

## Definition of Done

- [ ] AC-uri; T-DIPLOMA-805-1..4 trec; build+typecheck+lint+test verzi
- [ ] API smoke + portability verzi (§3.5.1)
- [ ] ce-security-reviewer (endpoint public + date personale): fără finding critic
- [ ] Lighthouse + axe verzi
