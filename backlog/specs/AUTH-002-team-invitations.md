---
id: AUTH-002
title: "Invitații echipă + verificare email la signup"
milestone: AUTH
phase: "1"
status: pending
attempts: 0
depends_on: [AUTH-001]
spec: backlog/specs/AUTH-002-team-invitations.md
---

## Goal

Permite adminilor să invite colegi prin email cu un rol specific. Invitatul primește email cu link valid 7 zile, setează parola și devine activ. Bonus: verificare email la signup nou (banner până confirmă).

## User stories

- **Ca** Admin, **vreau să** invit un coleg recepționer cu email + rol, **pentru că** echipa să acceseze sistemul fără să știu parola lor.
- **Ca** utilizator invitat, **vreau să** primesc un link clar care mă duce direct la setarea parolei, **pentru că** să nu fiu confuzat de interfața de signup normală.
- **Ca** Admin, **vreau să** retrimită invitația dacă colegul nu a văzut emailul, **pentru că** să nu blochez onboardingul echipei.
- **Ca** utilizator nou prin signup, **vreau să** primesc un email de confirmare, **pentru că** să știu că adresa mea e validă și contul e sigur.

## Acceptance criteria

- [ ] Pagina `/app/team` → buton "Invită coleg" → modal cu email + role select (admin/manager/teacher/receptionist)
- [ ] `POST /api/team/invite` creează user cu status `invited`, token invitație (SHA-256, 7 zile expirare), trimite email
- [ ] Tabel `user_invitations`: `id`, `tenant_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`
- [ ] Pagina publică `/app/accept-invitation?token=...` cu form "Setează parola" (nu cere email — pre-completat)
- [ ] `POST /api/team/accept-invitation` validează token, setează parola, activează user, șterge token
- [ ] Buton "Retrimite invitație" regenerează token + retrimite email (resetează expirare la 7 zile)
- [ ] Email verification la signup: după signup, user primește email cu link `/api/auth/verify-email?token=...`; banner persistent în app până confirmă; endpoint marchează `email_verified_at`
- [ ] Utilizatorii cu `status = 'invited'` nu pot face login până acceptă invitația
- [ ] Migrare `0036_auth002_user_invitations.sql` committed

## Files

**New:**
- `server/db/schema/userInvitations.ts` — tabelul `user_invitations`
- `server/routes/team/invite.ts` — POST /api/team/invite
- `server/routes/team/acceptInvitation.ts` — POST /api/team/accept-invitation
- `server/routes/auth/verifyEmail.ts` — GET /api/auth/verify-email
- `src/pages/auth/AcceptInvitationPage.tsx` — pagina /app/accept-invitation
- `drizzle/0036_auth002_user_invitations.sql`

**Modified:**
- `server/db/schema/index.ts` — export userInvitations
- `src/pages/app/team/TeamPage.tsx` — buton "Invită", tabel utilizatori, badge invited/active
- `src/App.tsx` — ruta /app/accept-invitation
- `server/db/schema/users.ts` — adaugă `email_verified_at`, `status` enum ('active','invited','disabled')

## Tests

- **T-AUTH-002-1** [blocant] Given admin autentificat, When POST /api/team/invite {email:"x@test.com", role:"teacher"}, Then user creat cu status "invited" + token în DB + 201
- **T-AUTH-002-2** [blocant] Given token invitație valid, When POST /api/team/accept-invitation {token, password:"Pass1!"}, Then user activ + poate face login
- **T-AUTH-002-3** [blocant] Given token invitație expirat (> 7 zile), When POST /api/team/accept-invitation, Then 400 "Invitație expirată"
- **T-AUTH-002-4** [normal] Given user invitat, When GET /app/accept-invitation?token=valid, Then formular "Setează parola" cu email pre-completat vizibil
- **T-AUTH-002-5** [normal] Given user signup nou, When accesează /app/dashboard cu email neverificat, Then banner "Verifică emailul" vizibil
- **T-AUTH-002-6** [blocant] Migration gate: db:reset + db:seed trece; `user_invitations` tabel există

## DoD

- Toate criteriile de acceptare bifate
- Migration gate verde
- Live API smoke: login + POST /api/team/invite → 201
- Reviewer APPROVED
- Persona reports salvate
