---
id: SET-801
title: "Team management — invite, roles, disable users"
milestone: SET
phase: "1 — Settings Foundation"
priority: P0
slug: team-management
depends_on: [MVP-003]
status: pending
---

# SET-801 — Team management: invite / disable / role matrix

## Goal

Allow the tenant admin (Owner / Admin role) to manage the internal team from
`/app/settings/team`: invite new users by email, assign roles, deactivate
accounts. The role matrix enforces what each role can see/do across all modules.
This makes Vector Learn multi-user ready for real academies with 5–20 staff.

## User stories

- Ca Owner, vreau să invit un nou coleg pe email cu un rol prestabilit, pentru că nu
  vreau să îi dau parola mea de admin.
- Ca Admin, vreau să dezactivez un profesor care a plecat, pentru că nu mai trebuie să
  aibă acces la date.
- Ca Owner, vreau să văd matricea de permisiuni (ce poate fiecare rol), pentru că
  trebuie să explic noilor angajați la ce au acces.
- Ca Manager, vreau să schimb rolul unui coleg fără să contactez support, pentru că
  structura echipei se schimbă frecvent.

## Acceptance criteria

- [ ] `GET /api/settings/team` — lista utilizatorilor tenantului (id, name, email, role,
      is_active, invited_at, last_login_at), tenant-scoped
- [ ] `POST /api/settings/team/invite` — trimite email de invitatie (stub: log la
      consolă / salvează token în DB); body: `{ email, role }`;
      răspuns: `{ inviteToken, expiresAt }` (token valid 48h)
- [ ] `PATCH /api/settings/team/:userId/role` — schimbă rolul unui user (Owner poate
      schimba oricine; Admin nu poate schimba alt Admin/Owner)
- [ ] `PATCH /api/settings/team/:userId/deactivate` — dezactivează user (is_active=false);
      user dezactivat nu mai poate loga; nu se poate dezactiva pe sine
- [ ] `GET /api/settings/team/roles` — returnează matricea de permisiuni
      `[{ role, permissions: { leads: 'rw'|'r'|'-', students: ..., ... } }]`
- [ ] DB: tabel `user_invitations` cu `(id, tenant_id, email, role, token, expires_at,
      accepted_at, invited_by_user_id)`, migrare comisă
- [ ] Pagina `/app/settings/team`:
      - Tabel cu: Avatar inițiale, Nume, Email, Rol (badge color-coded), Status
        (Activ/Dezactivat/Invitat), Ultima autentificare
      - Buton "Invită coleg" → modal (email + role selector)
      - Row actions: Change role / Deactivate (confirmare dialog)
      - Tab "Roluri & Permisiuni" cu tabel matrix (roluri vs module)
- [ ] Roluri suportate: `owner`, `admin`, `manager`, `teacher`, `receptionist`
- [ ] Toate endpointurile sunt tenant-scoped (middleware verifică tenant din JWT)
- [ ] Dark mode parity, zero hardcoded colors, semantic tokens only

## Files

### New files
- `server/routes/settings/team.ts` — router Express/Hono cu toate endpointurile
- `server/db/schema/user_invitations.ts` — schema Drizzle pentru `user_invitations`
- `src/pages/settings/TeamPage.tsx` — pagina `/app/settings/team`
- `src/components/settings/InviteUserModal.tsx`
- `src/components/settings/RoleMatrix.tsx` — tabel read-only cu permisiunile per rol
- `src/__tests__/settings/team.test.ts` — teste vitest

### Modified files
- `server/db/schema/index.ts` — export user_invitations
- `server/index.ts` — mount `/api/settings/team` router
- `src/App.tsx` — adaugă ruta `/app/settings/team`
- `src/components/layout/AppShell.tsx` — link "Echipă" în Settings section

## Tests

- **T-SET-801-1** [blocant] Given: admin logat, When: POST /api/settings/team/invite cu email
  valid și rol "teacher", Then: 201 + `{ inviteToken, expiresAt }` + rând în user_invitations
- **T-SET-801-2** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes fără erori
- **T-SET-801-3** [blocant] Given: user autentificat ca teacher (nu admin), When: PATCH
  /api/settings/team/:id/role, Then: 403 Forbidden
- **T-SET-801-4** [blocant] Given: server pornit, When: POST /api/auth/login + GET
  /api/settings/team, Then: 200 cu array de useri
- **T-SET-801-5** [normal] Given: TeamPage randată, When: click "Invită coleg", Then: modal apare
  cu câmpuri email + role
- **T-SET-801-6** [normal] Given: user dezactivat, When: POST /api/auth/login cu credențiale lui,
  Then: 401 sau eroare "Cont dezactivat"

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-SET-801-x trec
- [ ] Migration comisă (`drizzle/0034_set801_user_invitations.sql`)
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + GET /api/settings/team → 200
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/SET-faza-1-settings`
