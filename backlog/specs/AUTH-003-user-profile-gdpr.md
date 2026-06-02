---
id: AUTH-003
title: "Profil utilizator + schimbare parolă + GDPR export/ștergere"
milestone: AUTH
phase: "1"
status: pending
attempts: 0
depends_on: [AUTH-002]
spec: backlog/specs/AUTH-003-user-profile-gdpr.md
---

## Goal

Pagina de profil personal cu editare date (nume, avatar, telefon, timezone, limbă). Schimbare parolă (cere parola veche). GDPR: export date personale ca ZIP și soft-delete cont cu confirmare + anonimizare după 30 zile.

## User stories

- **Ca** utilizator, **vreau să** îmi editez profilul (nume, avatar, limbă), **pentru că** colegii să mă recunoască și interfața să fie în limba mea.
- **Ca** utilizator, **vreau să** schimb parola din profil (cere parola veche), **pentru că** să cresc securitatea periodic fără a fi logout.
- **Ca** utilizator, **vreau să** exportez toate datele mele într-un ZIP, **pentru că** GDPR Art. 15 îmi dă dreptul la portabilitate.
- **Ca** utilizator, **vreau să** cer ștergerea completă a contului meu cu o perioadă de grație, **pentru că** GDPR Art. 17 garantează dreptul la uitare.

## Acceptance criteria

- [ ] Pagina `/app/settings/profile` cu form: fullName, phone, avatar upload (resize 256x256), preferință limbă (ro/en/ru), timezone (Europe/Bucharest default)
- [ ] `PATCH /api/auth/profile` salvează câmpurile; validare Zod
- [ ] `POST /api/auth/change-password` cu {currentPassword, newPassword, confirmPassword} — verifică bcrypt, schimbă hash, trimite email notificare
- [ ] `POST /api/auth/export-data` — job async generează ZIP cu JSON-uri (user, sessions, lessons, payments — tot ce ține de userId) → returnează link download sau trimite email
- [ ] `POST /api/auth/delete-account` cu {password} — soft-delete: setează `deleted_at = now()`, blochează login; email confirmare imediat
- [ ] Buton "Anulează ștergerea" + endpoint `POST /api/auth/cancel-delete` valid înainte de 30 zile
- [ ] Schimbarea parolei invalidează TOATE sesiunile altele decât cea curentă

## Files

**New:**
- `server/routes/auth/profile.ts` — PATCH /api/auth/profile
- `server/routes/auth/changePassword.ts` — POST /api/auth/change-password
- `server/routes/auth/exportData.ts` — POST /api/auth/export-data
- `server/routes/auth/deleteAccount.ts` — POST /api/auth/delete-account + cancel-delete
- `src/pages/settings/ProfilePage.tsx` — pagina /app/settings/profile

**Modified:**
- `server/db/schema/users.ts` — adaugă `avatar_url`, `phone`, `language`, `timezone`, `deleted_at`
- `server/index.ts` — mount new routes
- `src/App.tsx` — ruta /app/settings/profile

## Tests

- **T-AUTH-003-1** [blocant] Given user autentificat, When PATCH /api/auth/profile {fullName:"Ion Pop", language:"ro"}, Then 200 + user actualizat în DB
- **T-AUTH-003-2** [blocant] Given user autentificat, When POST /api/auth/change-password cu parola corectă + parolă nouă validă, Then 200 + sesiunile vechi invalidate
- **T-AUTH-003-3** [blocant] Given user autentificat, When POST /api/auth/change-password cu parola incorectă, Then 401 "Parola curentă greșită"
- **T-AUTH-003-4** [normal] Given user autentificat, When POST /api/auth/export-data, Then 200 + job inițiat
- **T-AUTH-003-5** [blocant] Given user autentificat, When POST /api/auth/delete-account cu parola corectă, Then user.deleted_at setat + login blocat
- **T-AUTH-003-6** [blocant] DB portability: PATCH profile nu folosește raw `.execute().rows`

## DoD

- Toate criteriile de acceptare bifate
- Migration gate verde
- Live API smoke: login + PATCH /api/auth/profile → 200
- Reviewer APPROVED
- Persona reports salvate
