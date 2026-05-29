# Comunicare — User Stories

## US-COM-01: WhatsApp Business API integration
**As a** Manager, **I want to** conectez numărul WhatsApp Business, **so that** trimit notificări din sistem.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] OAuth Meta Business
  - [ ] Verify number ownership
  - [ ] Display status în settings

## US-COM-02: Template approval workflow
**As a** Marketing, **I want to** creez template-uri și le submit pentru Meta approval, **so that** le folosesc legitim.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] UI template builder cu variables
  - [ ] Submit to Meta API
  - [ ] Sync approval status

## US-COM-03: Trimitere mesaj 1:1
**As a** Recepționer, **I want to** răspund la mesajul unui părinte direct din UI, **so that** nu schimb între app-uri.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Inbox unificat /app/inbox
  - [ ] Conversații threaded
  - [ ] Status delivered/read

## US-COM-04: Broadcast cu segmentare
**As a** Marketing, **I want to** trimit anunț tuturor părinților din "Engleză B2", **so that** comunic schimbări de orar.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Selector segment (course, status, tag)
  - [ ] Preview count + sample
  - [ ] Send batch cu rate limit

## US-COM-05: Automation visual builder
**As a** Marketing, **I want to** drag-drop noduri Trigger → Condition → Action, **so that** construiesc fluxuri fără cod.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] React Flow editor
  - [ ] Save flow JSON în DB
  - [ ] Run engine cron-based

## US-COM-06: Multi-canal (WhatsApp + SMS fallback)
**As a** Marketing, **I want to** dacă WhatsApp eșuează → trimite SMS, **so that** mesaj ajunge sigur.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Cascade definition în automation
  - [ ] Delay între tentative

## US-COM-07: Email campaign builder
**As a** Marketing, **I want to** trimit newsletter lunar cu HTML branding, **so that** menții engagement.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] WYSIWYG editor sau MJML
  - [ ] SendGrid/Resend integration
  - [ ] Open/click tracking

## US-COM-08: Opt-out / unsubscribe
**As a** Recipient, **I want to** apăs STOP/Unsubscribe și nu mai primesc, **so that** îmi exercit dreptul.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Footer "STOP" în SMS / "Unsubscribe" în email / WhatsApp keyword
  - [ ] Tabel `opt_outs` sincronizat cross-canal
  - [ ] Block automation

## US-COM-09: Inbox unified (WhatsApp + Email + SMS)
**As a** Recepționer, **I want to** văd toate conversațiile într-un singur ecran, **so that** răspund rapid indiferent de canal.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Listă conversații sortate desc
  - [ ] Filter pe canal/status
  - [ ] Asignare la team member

## US-COM-10: Trigger "lecție mutată → notificare"
**As a** System, **I want to** automat trimit părintelui când profesorul mută lecția, **so that** nu apare la oră greșită.
- **Status**: backlog
- **Priority**: P0

## US-COM-11: Trigger "elev absent → recovery options"
**As a** System, **I want to** propun 3 sloturi recovery automat după absență, **so that** părintele alege.
- **Status**: backlog
- **Priority**: P0

## US-COM-12: Trigger "factură restantă 7d → reminder"
**As a** System, **I want to** reminder restanță la 7, 14, 21 zile, **so that** colectez fără să sun manual.
- **Status**: backlog
- **Priority**: P0

## US-COM-13: Quiet hours respect
**As a** Părinte, **I want to** nu primesc mesaje între 22:00-08:00, **so that** nu sunt deranjat.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Config per tenant + override per user
  - [ ] Queue messages, send la 08:00

## US-COM-14: Anti-spam cap
**As a** System, **I want to** limit max 3 mesaje/elev/săptămână, **so that** nu spammăm.
- **Status**: backlog
- **Priority**: P0

## US-COM-15: A/B test pe subject email
**As a** Marketing, **I want to** test 2 variante de subject pe 10% audience, **so that** trimit câștigătorul restului.
- **Status**: backlog
- **Priority**: P2

## US-COM-16: Calendar de campanii
**As a** Marketing, **I want to** văd toate campaniile planificate pe calendar, **so that** evit suprapunere.
- **Status**: backlog
- **Priority**: P1

## US-COM-17: Template multilingv
**As a** Diaspora school, **I want to** template în RO+EN+UA+RU, **so that** trimit pe limba părintelui.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `template_translations`
  - [ ] Auto-select pe baza preference user
  - [ ] DeepL integration pentru draft

## US-COM-18: Push notification PWA
**As a** Părinte, **I want to** primesc notificare browser/mobile, **so that** nu deschid email pentru fiecare update.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Web Push API
  - [ ] Service worker
  - [ ] Categorie subscription (orar/plăți/marketing)

## US-COM-19: GDPR audit trail
**As an** Auditor, **I want to** văd consent + retention + opt-out per recipient, **so that** dovedesc compliance.
- **Status**: backlog
- **Priority**: P0

## US-COM-20: Conversation rating (after call/chat)
**As a** Quality lead, **I want to** la finalul unei conversații primesc rating de la părinte, **so that** măsor CSAT.
- **Status**: backlog
- **Priority**: P2
