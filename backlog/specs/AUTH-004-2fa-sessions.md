---
id: AUTH-004
title: "2FA TOTP + session management (revoke sessions)"
milestone: AUTH
phase: "1"
status: pending
attempts: 0
depends_on: [AUTH-003]
spec: backlog/specs/AUTH-004-2fa-sessions.md
---

## Goal

Autentificare în doi pași cu TOTP (Google Authenticator / Authy). Pagina de management sesiuni: lista sesiunilor active cu IP + device + last_active, buton revoke per sesiune sau "Revocă toate altele".

## User stories

- **Ca** Admin, **vreau să** activez 2FA cu TOTP pe contul meu, **pentru că** o parolă compromisă să nu fie suficientă.
- **Ca** Admin, **vreau să** am 8 coduri de recovery generate la setup 2FA, **pentru că** dacă pierd telefonul să pot intra totuși.
- **Ca** utilizator, **vreau să** văd toate sesiunile active (IP, browser, data), **pentru că** să detectez dacă cineva altcineva e logat cu contul meu.
- **Ca** utilizator, **vreau să** revoc o sesiune suspectă fără să mă dezlogheze pe mine, **pentru că** să termin accesul nedorit instant.

## Acceptance criteria

- [ ] Pagina `/app/settings/security` cu secțiunile: 2FA + Sesiuni active
- [ ] Setup 2FA: `POST /api/auth/2fa/setup` generează secret TOTP + QR code URI (librărie `otpauth`)
- [ ] `POST /api/auth/2fa/enable` cu {code} — verifică TOTP code, salvează secret (criptat în DB), generează 8 recovery codes
- [ ] La login cu 2FA activat: după parolă corectă → `{requiresTwoFactor: true}`; `POST /api/auth/2fa/verify` cu {code} → sesiune completă
- [ ] `POST /api/auth/2fa/disable` cu {password, code} — dezactivează 2FA, șterge secret
- [ ] Recovery codes: la enable se afișează o singură dată; POST /api/auth/2fa/verify acceptă și recovery code (marcată ca `used`)
- [ ] Tabel `two_factor_settings`: `user_id`, `secret_encrypted`, `recovery_codes_json`, `enabled_at`
- [ ] Sesiuni extinse cu: `ip_address`, `user_agent`, `last_active_at`
- [ ] `GET /api/auth/sessions` → lista; `DELETE /api/auth/sessions/:id` → revoke; `DELETE /api/auth/sessions?except=current` → revocă toate altele
- [ ] Migrare `0037_auth004_2fa_sessions.sql` committed

## Files

**New:**
- `server/db/schema/twoFactorSettings.ts` — tabelul `two_factor_settings`
- `server/routes/auth/twoFactor.ts` — setup/enable/disable/verify routes
- `server/routes/auth/sessions.ts` — GET/DELETE sessions
- `src/pages/settings/SecurityPage.tsx` — secțiunea 2FA + sesiuni
- `src/pages/auth/Verify2FAPage.tsx` — pagina /app/verify-2fa
- `drizzle/0037_auth004_2fa_sessions.sql`

**Modified:**
- `server/db/schema/sessions.ts` — adaugă ip_address, user_agent, last_active_at
- `server/db/schema/index.ts` — export twoFactorSettings
- `server/routes/auth/login.ts` — verifică 2FA enabled → redirect verify-2fa
- `src/App.tsx` — ruta /app/verify-2fa, /app/settings/security

## Tests

- **T-AUTH-004-1** [blocant] Given user fără 2FA, When POST /api/auth/2fa/setup, Then {qrCodeUri, secret} returnat
- **T-AUTH-004-2** [blocant] Given secret valid, When POST /api/auth/2fa/enable cu cod TOTP corect, Then 200 + enabled_at setat + 8 recovery codes
- **T-AUTH-004-3** [blocant] Given user cu 2FA activ, When login cu parola corectă, Then {requiresTwoFactor: true}
- **T-AUTH-004-4** [blocant] Given sesiune incompletă, When POST /api/auth/2fa/verify cu cod valid, Then sesiune completă
- **T-AUTH-004-5** [normal] Given user autentificat, When GET /api/auth/sessions, Then lista cu ip + user_agent + last_active_at
- **T-AUTH-004-6** [blocant] Migration gate: db:reset + db:seed verde; two_factor_settings tabel există

## DoD

- Toate criteriile de acceptare bifate
- Migration gate verde
- Live API smoke: login + GET /api/auth/sessions → 200
- Reviewer APPROVED
- Persona reports salvate
