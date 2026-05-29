# Settings & Admin — User Stories

## US-SET-01: Branding (logo + culori)
**As an** Owner, **I want to** upload logo + setez culorile primare, **so that** brand-ul meu apare în UI.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/settings/branding
  - [ ] Upload logo (PNG/SVG, max 2 MB)
  - [ ] Color picker pentru primary + accent
  - [ ] Preview live

## US-SET-02: Billing & subscription
**As an** Owner, **I want to** văd planul curent + factura următoare + upgrade, **so that** gestionez costurile Vector Learn.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/settings/billing
  - [ ] Stripe Customer Portal
  - [ ] Self-service upgrade/downgrade
  - [ ] Istoric facturi cu download

## US-SET-03: Team management (invite/disable/role)
**As an** Admin, **I want to** /app/settings/team pentru a manage echipa, **so that** ad/remove cu auditing.
- **Status**: backlog
- **Priority**: P0

## US-SET-04: Roles & permissions matrix
**As an** Admin, **I want to** definesc roluri custom dincolo de cele standard, **so that** acopăr structura organizatorică.
- **Status**: backlog
- **Priority**: P0

## US-SET-05: GDPR & DPA download
**As an** Admin, **I want to** download semnabil Data Processing Agreement, **so that** sunt compliant cu auditul.
- **Status**: backlog
- **Priority**: P0

## US-SET-06: Data retention policies
**As an** Admin, **I want to** setez retenția (ex: ștergere lead-uri lost după 12 luni), **so that** automatizez compliance.
- **Status**: backlog
- **Priority**: P1

## US-SET-07: Notification preferences
**As a** User, **I want to** opt-in/out din categorii (system, marketing, alerts), **so that** nu sunt spammed.
- **Status**: backlog
- **Priority**: P1

## US-SET-08: Language / locale
**As a** User, **I want to** schimb UI între ro/en/ru, **so that** colegii non-RO folosesc.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] i18n setup (react-i18next sau similar)
  - [ ] Save preference la user

## US-SET-09: Timezone
**As a** User, **I want to** setez timezone (Europe/Bucharest default), **so that** orele se afișează corect dacă lucrez remote.
- **Status**: backlog
- **Priority**: P1

## US-SET-10: API keys management
**As a** Developer, **I want to** generate API keys cu scope, **so that** integrez third-party tools.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] CRUD keys cu scope granular
  - [ ] Last used timestamp
  - [ ] Revoke instant

## US-SET-11: Audit log accesibil
**As an** Owner, **I want to** /app/settings/audit-log cu filtre, **so that** investighez incidente.
- **Status**: backlog
- **Priority**: P0

## US-SET-12: Backup manual + scheduled
**As an** Owner, **I want to** declanșez backup full + setez cron zilnic, **so that** disaster recovery.
- **Status**: backlog
- **Priority**: P0

## US-SET-13: Restore din backup
**As an** Owner, **I want to** restaurez dintr-un snapshot anterior, **so that** undo accidente.
- **Status**: backlog
- **Priority**: P1

## US-SET-14: Custom domain (CNAME pentru app.scoalata.ro)
**As an** Owner, **I want to** app-ul pe domeniul meu, **so that** brand consistency.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] DNS verification
  - [ ] Auto SSL cert (Let's Encrypt)

## US-SET-15: Email sender domain (DKIM/SPF)
**As an** Admin, **I want to** email-uri să plece de la `noreply@scoalata.ro`, **so that** brand + deliverability.
- **Status**: backlog
- **Priority**: P1

## US-SET-16: Webhooks log
**As a** Developer, **I want to** văd toate webhook delivery attempts + retries, **so that** debug integrari.
- **Status**: backlog
- **Priority**: P1

## US-SET-17: Feature flags
**As an** Admin, **I want to** activez/dezactivez features (ex: "AI Assistant"), **so that** control gradual rollout.
- **Status**: backlog
- **Priority**: P2

## US-SET-18: Onboarding wizard pentru tenant nou
**As a** new Owner, **I want to** wizard pas-cu-pas (logo, primul curs, primul profesor, import elevi), **so that** încep ușor.
- **Status**: backlog
- **Priority**: P0

## US-SET-19: System health page (public)
**As a** User, **I want to** vectorlearn.io/status să arate uptime, **so that** verific dacă e problema cu mine sau Vector Learn.
- **Status**: backlog
- **Priority**: P1

## US-SET-20: Cancel subscription (self-service)
**As an** Owner, **I want to** anulez self-service cu motiv, **so that** nu sun support.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Form cu motiv (radio buttons)
  - [ ] Confirm cu data efectivă (sfârșit ciclu)
  - [ ] Retention offer (ex: -20% lunile următoare)
  - [ ] Export date înainte de cancel
