---
id: AUTH-001
title: "Resetare parolă prin email (forgot password flow)"
milestone: AUTH
phase: "1"
status: in_progress
attempts: 1
depends_on: [MVP-003]
spec: backlog/specs/AUTH-001-password-reset.md
---

## Goal

Implementează fluxul complet de resetare parolă: buton "Am uitat parola" → email cu link → pagina de reset → parolă nouă salvată. Token one-time cu expirare 1h. Rate limit pe email (3 req/15 min).

## User stories

- **Ca** utilizator, **vreau să** resetez parola uitată fără ajutorul adminului, **pentru că** să nu blochez activitatea centrului.
- **Ca** Admin, **vreau să** știu că resetarea parolei e securizată cu token one-time, **pentru că** nu vreau conturi compromise.
- **Ca** utilizator, **vreau să** primesc emailul de reset în < 30 sec, **pentru că** un delay lung mă face să apăs din nou și generez spam.
- **Ca** utilizator, **vreau să** văd un mesaj clar când link-ul a expirat, **pentru că** să știu că trebuie să cer altul.

## Acceptance criteria

- [ ] Buton "Am uitat parola?" pe `/app/login` → modal/pagina cu email input
- [ ] `POST /api/auth/forgot-password` cu email → generează token SHA-256 (64 char hex), expirat în 1h, salvat în tabel `password_reset_tokens`
- [ ] Email trimis cu link `{APP_URL}/app/reset?token=...` (utilizează provider din COMM sau Resend stub)
- [ ] Tabel `password_reset_tokens`: `id`, `user_id`, `token_hash` (bcrypt), `expires_at`, `used_at`
- [ ] Pagina `/app/reset` cu form: parolă nouă + confirmare
- [ ] `POST /api/auth/reset-password` validează token (neexpirat + neutilizat), salvează hash nou, marchează token `used_at = now()`
- [ ] La reset reușit: toate sesiunile vechi invalidate (DELETE din `sessions` unde `user_id = X`), auto-login cu sesiune nouă
- [ ] Rate limit: max 3 cereri de reset per email per 15 min (returnează 429 cu `Retry-After`)
- [ ] Endpoint-ul nu dezvăluie dacă emailul există (returnează 200 chiar dacă emailul nu e găsit — anti-enumeration)
- [ ] Migrare `0035_auth001_password_reset_tokens.sql` committed

## Files

**New:**
- `server/db/schema/passwordResetTokens.ts` — tabelul `password_reset_tokens`
- `server/routes/auth/forgotPassword.ts` — POST /api/auth/forgot-password
- `server/routes/auth/resetPassword.ts` — POST /api/auth/reset-password
- `src/pages/auth/ForgotPasswordPage.tsx` — pagina /app/forgot-password
- `src/pages/auth/ResetPasswordPage.tsx` — pagina /app/reset
- `drizzle/0035_auth001_password_reset_tokens.sql`

**Modified:**
- `server/db/schema/index.ts` — export passwordResetTokens
- `server/index.ts` (sau routes index) — mount forgot-password + reset-password routes
- `src/App.tsx` — adaugă rutele /app/forgot-password, /app/reset
- `src/pages/auth/LoginPage.tsx` — adaugă link "Am uitat parola?"

## Tests

- **T-AUTH-001-1** [blocant] Given un utilizator valid cu email X, When POST /api/auth/forgot-password cu {email:X}, Then răspunde 200 și creează un token în DB cu `expires_at > now()`
- **T-AUTH-001-2** [blocant] Given un token valid nefolosit, When POST /api/auth/reset-password cu {token, newPassword:"ValidPass1!"}, Then parolă actualizată + token marcat `used_at` + sesiuni vechi șterse
- **T-AUTH-001-3** [blocant] Given un token expirat (expires_at < now()), When POST /api/auth/reset-password, Then răspunde 400 "Token expirat"
- **T-AUTH-001-4** [blocant] Given un email inexistent, When POST /api/auth/forgot-password, Then răspunde 200 (anti-enumeration, nu 404)
- **T-AUTH-001-5** [normal] Given 3 cereri de reset pentru același email în 15 min, When a 4-a cerere, Then răspunde 429 cu Retry-After header
- **T-AUTH-001-6** [blocant] Migration gate: db:generate lasă 0 fișiere uncommitted; db:reset + db:seed trece fără erori

## DoD

- Toate criteriile de acceptare bifate
- Migration gate verde
- Live API smoke: login + POST /api/auth/forgot-password → 200
- Reviewer APPROVED
- Persona reports salvate
