# Auth & Users — User Stories

## US-AUTH-01: Sign-up cu cont nou
**As a** Owner, **I want to** crea un cont nou pe vectorlearn.io, **so that** îmi pot porni academia digital.
- **Status**: done ✅ (MVP-003 PR #20)
- **Priority**: P0
- **Acceptance**:
  - [x] Form cu tenant name, email, parolă (min 8 char), nume utilizator
  - [x] Validare Zod (email valid, parolă min 8)
  - [x] Creează tenant + user admin într-o tranzacție
  - [x] Auto-login cu session cookie
  - [x] Redirect la /app/dashboard
  - [x] Error la email duplicat (409)

## US-AUTH-02: Login cu email & parolă
**As a** Admin, **I want to** mă autentific cu email și parolă, **so that** acces panoul de admin.
- **Status**: done ✅ (MVP-003)
- **Priority**: P0
- **Acceptance**:
  - [x] Form cu email + parolă
  - [x] Verificare bcrypt
  - [x] Session cookie httpOnly + sameSite
  - [x] Redirect dashboard
  - [x] Eroare 401 la credentiale greșite
  - [x] Rate limit pe IP (5 încercări/min)

## US-AUTH-03: Logout
**As an** authenticated user, **I want to** mă deloghez, **so that** sesiunea nu rămâne activă pe device partajat.
- **Status**: done ✅ (MVP-003)
- **Priority**: P0
- **Acceptance**:
  - [x] Buton "Logout" în header
  - [x] DELETE token din DB
  - [x] Cookie șters
  - [x] Redirect la /app/login

## US-AUTH-04: Password reset prin email
**As a** user, **I want to** îmi resetez parola dacă am uitat-o, **so that** redobândesc accesul.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Am uitat parola" pe /app/login
  - [ ] Endpoint `/api/auth/forgot-password` generează token cu expirare 1h
  - [ ] Email trimis cu link `/app/reset?token=...`
  - [ ] Pagina /app/reset cere parolă nouă + confirm
  - [ ] Token consumat la utilizare (one-time)
  - [ ] Rate limit pe email
- **Notes**: necesită un email provider (Resend/Postmark)

## US-AUTH-05: Schimbare parolă logat
**As an** authenticated user, **I want to** îmi schimb parola din profile, **so that** îmi cresc securitatea periodic.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Form în /app/settings/security cu old + new + confirm
  - [ ] Verificare old password
  - [ ] Hash + save new
  - [ ] Invalidate toate sesiunile existente, păstrează cea curentă
  - [ ] Email notification "Parola schimbată"

## US-AUTH-06: Invitație membru echipă
**As an** Admin, **I want to** invit un coleg cu email + rol, **so that** echipa accesează sistemul.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Modal "Invite user" în /app/team cu email + role select
  - [ ] Creează user "pending" în DB cu token invitation
  - [ ] Email cu link "Accept invitation" + setare parolă inițială
  - [ ] Link valid 7 zile
  - [ ] User devine activ după setup parolă
  - [ ] Resend invitation cu un click

## US-AUTH-07: Roluri și permisiuni granulare
**As an** Admin, **I want to** controlez ce poate face fiecare rol, **so that** echipa nu vede ce nu trebuie.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] 6 roluri standard: admin, manager, teacher, receptionist, student, parent
  - [ ] Matrice permisiuni custom în /app/settings/roles
  - [ ] Middleware verifică permission per endpoint
  - [ ] Teacher vede DOAR grupele lui
  - [ ] Audit log pentru schimbări de roluri

## US-AUTH-08: Two-factor authentication (TOTP)
**As a** security-conscious Admin, **I want to** activez 2FA pe contul meu, **so that** parola compromisă nu e suficientă.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Setup TOTP cu QR code (Google Authenticator compatibil)
  - [ ] 8 recovery codes generate
  - [ ] Login cere code după parolă
  - [ ] Disable 2FA cere parolă curentă
- **Notes**: librărie `otpauth` sau `@simplewebauthn`

## US-AUTH-09: Magic link login (passwordless)
**As a** user, **I want to** mă loghez doar cu email + magic link, **so that** nu rețin parola.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Toggle pe /app/login: "Trimite-mi link prin email"
  - [ ] Token 6 cifre + link cu hash
  - [ ] Valid 15 min
  - [ ] Cookie după click

## US-AUTH-10: OAuth Google / Apple
**As a** new user, **I want to** mă înscriu cu Google sau Apple, **so that** nu setez parolă.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Butoane "Continue with Google" și "Continue with Apple" pe /login + /signup
  - [ ] OAuth flow standard (PKCE)
  - [ ] La primul login: alege tenant nou sau cere invitație
  - [ ] Link la cont existent dacă email match
- **Notes**: ar fi simplificat masiv cu Supabase Auth

## US-AUTH-11: Audit log per session
**As an** Admin, **I want to** văd toate session-urile active + IP-uri, **so that** detectez intruziuni.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel în /app/settings/sessions: device, IP, last_active, created_at
  - [ ] Buton "Revoke" per session
  - [ ] "Revoke all except current"
  - [ ] Alert email dacă login din IP nou

## US-AUTH-12: Profil personal
**As a** user, **I want to** îmi editez profilul (nume, avatar, telefon), **so that** colegii mă recunosc.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] /app/settings/profile cu form
  - [ ] Upload avatar (resize la 256x256)
  - [ ] Preferințe limbă (ro, en, ru)
  - [ ] Preferințe timezone (Europe/Bucharest default)

## US-AUTH-13: Soft-delete utilizator
**As an** Admin, **I want to** dezactivez un cont fără să-l șterg, **so that** păstrez audit-ul.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Disable user" în /app/team
  - [ ] Status `disabled` blochează login
  - [ ] Datele rămân (lecții, audit)
  - [ ] Buton "Re-enable" pentru reactivare

## US-AUTH-14: GDPR — drept la uitare
**As a** user, **I want to** cer ștergerea completă a datelor mele, **so that** îmi exercit dreptul GDPR Art. 17.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Șterge contul" în /app/settings (cere parolă pentru confirm)
  - [ ] Soft-delete 30 zile (recoverable)
  - [ ] După 30 zile: anonimizare audit log + delete row
  - [ ] Email de confirmare imediată + final

## US-AUTH-15: Export date personale (GDPR)
**As a** user, **I want to** export toate datele mele în ZIP, **so that** îmi exercit dreptul GDPR Art. 15.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Export my data" în settings
  - [ ] Job async generează ZIP cu JSON-uri per tabel
  - [ ] Email cu link download (valid 7 zile)

## US-AUTH-16: Session multi-tenant (cont cu mai multe centre)
**As an** Owner, **I want to** comut între 2+ centre cu același cont, **so that** nu fac login separat pentru fiecare.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Tabel `user_tenants` many-to-many
  - [ ] Dropdown switcher în header
  - [ ] Session păstrează `current_tenant_id`
  - [ ] Toate endpoint-urile folosesc `current_tenant_id` din sesiune

## US-AUTH-17: Single Sign-On (SAML) — Enterprise
**As an** Enterprise customer, **I want to** integrez Vector Learn cu Active Directory / Okta, **so that** angajații folosesc credentialele corporate.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Setup SAML IdP în /app/settings/sso (Enterprise plan only)
  - [ ] Just-in-time provisioning (creează user la primul login)
  - [ ] Logout federated (SLO)

## US-AUTH-18: Limitare login după 5 încercări greșite
**As a** Admin, **I want to** sistemul blochează automat IP după 5 încercări greșite, **so that** previn brute-force.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] In-memory store (Redis în prod) pentru rate limit
  - [ ] 5 fail → blocked 15 min
  - [ ] Reset la login reușit
  - [ ] Logs pentru security review

## US-AUTH-19: Email verification la signup
**As an** Admin, **I want to** confirm emailul user-ului nou înainte să poată activa cont, **so that** previn typo + fake accounts.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] After signup: email cu link verify
  - [ ] User logat dar `email_verified_at = null` blochează acces sensibil
  - [ ] Banner "Verifică email" până confirmă
  - [ ] Resend verify cu cooldown 1 min

## US-AUTH-20: Verificare telefon SMS pentru staff
**As an** Admin, **I want to** verific telefonul recepționerelor prin SMS, **so that** asigur o cale alternativă de notificare.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Field "phone" în profil cu buton "Verify"
  - [ ] SMS cu cod 6 cifre
  - [ ] Cod expiră în 10 min
- **Notes**: necesită Twilio sau alt SMS provider
