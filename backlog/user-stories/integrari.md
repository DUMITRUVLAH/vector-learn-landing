# Integrări — User Stories

## US-INT-01: Stripe Connect (plăți)
**As a** Manager, **I want to** conectez Stripe pentru încasări card, **so that** procesez plăți online.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] OAuth Stripe Connect
  - [ ] Webhook handler
  - [ ] Test mode toggle

## US-INT-02: PayU / Netopia (alternative RO)
**As a** Manager, **I want to** alternative la Stripe pentru RO, **so that** opțiune locală.
- **Status**: backlog
- **Priority**: P1

## US-INT-03: WhatsApp Business API
**As a** Marketing, **I want to** WhatsApp officlal cu template-uri Meta, **so that** mass-messaging conform.
- **Status**: backlog
- **Priority**: P0

## US-INT-04: Twilio SMS gateway
**As a** Manager, **I want to** SMS fallback la WhatsApp, **so that** mesaje ajung sigur.
- **Status**: backlog
- **Priority**: P1

## US-INT-05: Email — Resend
**As an** Admin, **I want to** trimit emails tranzacționale, **so that** notificări sigure.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] API key în settings
  - [ ] Templates (welcome, reset, invoice)
  - [ ] Bounce handling

## US-INT-06: Zoom auto-create meeting
**As a** Manager, **I want to** la create lesson online → auto-generate Zoom link, **so that** nu copy-paste.
- **Status**: backlog
- **Priority**: P1

## US-INT-07: Google Meet integration
**As a** Manager preferind Google Workspace, **I want to** Meet links automat, **so that** ecosistem coerent.
- **Status**: backlog
- **Priority**: P1

## US-INT-08: Asterisk PBX telefonie
**As a** Recepționer, **I want to** apelurile primite să deschidă card-ul lead-ului automat, **so that** știu cine sună.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] AMI integration
  - [ ] Click-to-call
  - [ ] Recording optional

## US-INT-09: 1C / SAGA export contabilitate
**As an** Accountant, **I want to** export plăți în format 1C/SAGA, **so that** import direct fără re-tastare.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] XML/CSV formate specifice
  - [ ] Mapping articol contabil

## US-INT-10: ANAF e-Factura (SPV)
**As an** Accountant, **I want to** facturile trimise automat la SPV-ANAF, **so that** conform OUG 120/2021.
- **Status**: backlog
- **Priority**: P0

## US-INT-11: Google Analytics 4
**As a** Marketing, **I want to** tracking pe landing page → conversion, **so that** măsor ROAS.
- **Status**: backlog
- **Priority**: P1

## US-INT-12: Meta Conversions API (server-side)
**As a** Marketing, **I want to** trimit conversions către Meta când lead devine plătitor, **so that** algoritmul Meta optimizează.
- **Status**: backlog
- **Priority**: P1

## US-INT-13: Google Ads offline conversions
**As a** Marketing, **I want to** raportez conversion la Google Ads, **so that** bid management îmbunătățit.
- **Status**: backlog
- **Priority**: P1

## US-INT-14: Zapier connector
**As a** Power user, **I want to** trigger Zapier la lead.created, **so that** conectez orice altă unealta.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Public webhook-uri configurabile
  - [ ] Sau publish app pe Zapier marketplace

## US-INT-15: API REST documentat (OpenAPI)
**As a** Developer, **I want to** OpenAPI spec + Swagger UI, **so that** integrez Vector Learn în propriul flow.
- **Status**: backlog
- **Priority**: P1

## US-INT-16: Webhooks outgoing
**As a** Developer, **I want to** primesc POST la URL-ul meu când "lead.created", **so that** sync custom.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `webhook_endpoints`
  - [ ] Retry exponential
  - [ ] Signing HMAC

## US-INT-17: OAuth pentru third-party apps
**As a** Developer terț, **I want to** OAuth flow pentru ca user-ul Vector Learn să dea acces aplicației mele, **so that** integrez fără să țin parolă.
- **Status**: backlog
- **Priority**: P2

## US-INT-18: Google Drive sync materiale
**As a** Profesor, **I want to** materialele din Drive să apară automat în Vector Learn, **so that** nu re-upload.
- **Status**: backlog
- **Priority**: P2

## US-INT-19: Calendar sync (Google/Outlook)
**As a** Profesor, **I want to** orarul Vector Learn să apară în Google Calendar, **so that** văd alături de personal.
- **Status**: backlog
- **Priority**: P1

## US-INT-20: SMS verification cu Twilio Verify
**As an** Admin, **I want to** verific telefon staff cu SMS, **so that** asigur ownership.
- **Status**: backlog
- **Priority**: P2
