# AUTH — Test Scenarios

## AUTH — Securitate & autentificare avansată

### AUTH-001 — Resetare parolă prin email

- **T-AUTH-001-1** [blocant] Given user valid cu email X, When POST /api/auth/forgot-password {email:X}, Then 200 + token creat în DB cu expires_at > now()
- **T-AUTH-001-2** [blocant] Given token valid nefolosit, When POST /api/auth/reset-password {token, newPassword}, Then parolă actualizată + token used_at setat + sesiuni vechi șterse
- **T-AUTH-001-3** [blocant] Given token expirat, When POST /api/auth/reset-password, Then 400 "invalid_or_expired_token"
- **T-AUTH-001-4** [blocant] Given email inexistent, When POST /api/auth/forgot-password, Then 200 (anti-enumeration)
- **T-AUTH-001-5** [normal] Given 3 cereri reset per email în 15 min, When a 4-a cerere, Then 429 cu Retry-After header
- **T-AUTH-001-6** [blocant] Migration gate: db:generate lasă 0 fișiere uncommitted; db:reset + db:seed trece

### AUTH-002 — Invitații echipă + verificare email

- **T-AUTH-002-1** [blocant] Given admin autentificat, When POST /api/team/invite {email, role:"teacher"}, Then user creat cu status "invited" + 201
- **T-AUTH-002-2** [blocant] Given token invitație valid, When POST /api/team/accept-invitation {token, password}, Then user activ + login funcțional
- **T-AUTH-002-3** [blocant] Given token invitație expirat, When POST /api/team/accept-invitation, Then 400 "Invitație expirată"
- **T-AUTH-002-4** [normal] Given user invitat, When GET /app/accept-invitation?token=valid, Then form cu email pre-completat
- **T-AUTH-002-5** [normal] Given user nou fără email verificat, When accesează dashboard, Then banner "Verifică emailul" vizibil
- **T-AUTH-002-6** [blocant] Migration gate: db:reset + db:seed verde; tabel user_invitations există

### AUTH-003 — Profil + schimbare parolă + GDPR

- **T-AUTH-003-1** [blocant] Given user autentificat, When PATCH /api/auth/profile {fullName, language}, Then 200 + user actualizat în DB
- **T-AUTH-003-2** [blocant] Given user autentificat, When POST /api/auth/change-password cu parola corectă, Then 200 + sesiuni vechi invalidate
- **T-AUTH-003-3** [blocant] Given user autentificat, When POST /api/auth/change-password cu parola incorectă, Then 401
- **T-AUTH-003-4** [normal] Given user autentificat, When POST /api/auth/export-data, Then 200 + job inițiat
- **T-AUTH-003-5** [blocant] Given user autentificat, When POST /api/auth/delete-account cu parola corectă, Then deleted_at setat + login blocat
- **T-AUTH-003-6** [blocant] DB portability: PATCH profile nu folosește raw .execute().rows

### AUTH-004 — 2FA TOTP + session management

- **T-AUTH-004-1** [blocant] Given user fără 2FA, When POST /api/auth/2fa/setup, Then {qrCodeUri, secret} returnat
- **T-AUTH-004-2** [blocant] Given secret valid, When POST /api/auth/2fa/enable cu cod TOTP corect, Then two_factor_enabled_at setat + 8 recovery codes
- **T-AUTH-004-3** [blocant] Given user cu 2FA activ, When login cu parola corectă, Then {requiresTwoFactor: true}
- **T-AUTH-004-4** [blocant] Given sesiune incompletă, When POST /api/auth/2fa/verify cu cod valid, Then sesiune completă
- **T-AUTH-004-5** [normal] Given user autentificat, When GET /api/auth/sessions, Then lista cu ip + user_agent + last_active_at
- **T-AUTH-004-6** [blocant] Migration gate: db:reset + db:seed verde; two_factor_settings tabel există