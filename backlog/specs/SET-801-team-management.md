---
id: SET-801
title: Team management — invite, disable, role assignment
milestone: SET
phase: "1"
branch: feat/SET-faza-1-settings
status: pending
attempts: 0
depends_on: []
---

## Goal

Administratorii trebuie să poată gestiona echipa (invitați, dezactivați, schimba roluri) dintr-o
interfață unificată la `/app/settings/team`. Fiecare user al tenantului are un rol (`admin`,
`manager`, `teacher`, `receptionist`, `parent`) cu permisiuni diferite. Invite-ul trimite un
email cu token de înregistrare. Dezactivarea blochează login-ul fără a șterge datele.

## User stories

- Ca Admin, vreau să invit noi membri prin email, pentru că înregistrarea manuală e lentă și nesigură.
- Ca Admin, vreau să dezactivez un angajat care a plecat, pentru că nu mai trebuie să aibă acces la date.
- Ca Admin, vreau să schimb rolul unui user fără să îl șterg, pentru că promovările/transferurile sunt frecvente.
- Ca Owner, vreau să văd lista completă a echipei cu roluri și data ultimei activități, pentru că am un audit periodic.

## Acceptance criteria

1. **API `POST /api/team/invite`** — creează un token de invitație (TTL 48h) și returnează `{ inviteUrl }`. Rolul și emailul sunt parametri. Nu trimite email real (stub log).

2. **API `GET /api/team`** — returnează lista utilizatorilor tenantului: `id, name, email, role, status (active|disabled), lastLoginAt`.

3. **API `PATCH /api/team/:userId`** — permite schimbarea `role` și `status` (`active|disabled`). Proprietarul nu se poate dezactiva singur.

4. **API `POST /api/team/accept/:token`** — finalizează înregistrarea din invitație (setează `passwordHash`, marchează invitația ca folosită).

5. **Tabel `invitations`** cu coloanele: `id, tenant_id, email, role, token, expires_at, accepted_at, created_by`. Migrare comisă.

6. **UI `/app/settings/team`**: tabel cu utilizatori, buton "Invită", modal cu email+rol, badge status (activ/dezactivat), acțiuni Schimbă Rol și Dezactivează.

7. **Column `is_active`** pe `users` (default `true`). `requireAuth` returnează 401 dacă `is_active = false`.

## Files

### New
- `server/routes/team.ts` — completare rute (GET /, POST /invite, PATCH /:userId, POST /accept/:token)
- `server/db/schema/invitations.ts` — tabel invitations
- `src/pages/app/settings/TeamPage.tsx` — UI
- `src/__tests__/settings/team.test.tsx` — unit tests

### Modified
- `server/db/schema/users.ts` — add is_active column
- `server/db/schema/index.ts` — export invitations
- `server/app.ts` — mount team routes (deja montat ca teamRoutes)
- `src/App.tsx` — add route /app/settings/team → TeamPage
- `src/components/app/AppShell.tsx` — link "Echipă" în sidebar settings

## Tests

- **T-SET-801-1** [blocant] Migration: invitations table + users.is_active column exist after db:reset.
- **T-SET-801-2** [blocant] POST /api/team/invite returns inviteUrl with valid token.
- **T-SET-801-3** [blocant] PATCH /api/team/:userId/disable → requireAuth rejects with 401 for disabled user.
- **T-SET-801-4** [normal] GET /api/team returns list with role and status fields.
- **T-SET-801-5** [normal] TeamPage renders invite form and user table without crash.
- **T-SET-801-6** [normal] Owner cannot disable their own account (returns 403).

## DoD

- [ ] Migration committed (invitations table + users.is_active)
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/SET-faza-1-settings`
