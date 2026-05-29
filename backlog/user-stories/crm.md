# CRM & Leads — User Stories

## US-CRM-01: Pipeline kanban cu drag-drop
**As a** Vânzător, **I want to** mut leadurile între stadii cu drag, **so that** updatez pipeline-ul vizual.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-02: Creare lead manual
**As a** Recepționer, **I want to** adaug un lead din apel telefonic, **so that** apare în pipeline.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-03: Convertire lead → student
**As a** Manager, **I want to** convertesc un lead în student când plătește, **so that** începe să primească facturi.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-04: Public intake form (no auth)
**As a** Vizitator site, **I want to** completez formular și creez lead, **so that** centrul mă contactează.
- **Status**: done ✅ (MVP-009 — /api/leads/intake)
- **Priority**: P0

## US-CRM-05: Dedup automat pe phone/email
**As a** System, **I want to** detectez dacă un lead există deja înainte să creez duplicate, **so that** baza rămâne curată.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-06: Note + interactions timeline
**As a** Vânzător, **I want to** salvez ce am discutat la apel ("nu vrea pian, vrea pian online"), **so that** colegul care preia știe.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-07: UTM tracking pe lead
**As a** Marketing, **I want to** sistemul salvează utm_source/medium/campaign la lead, **so that** atribui conversia campaniei.
- **Status**: done ✅ (MVP-009)
- **Priority**: P0

## US-CRM-08: Automation "lead nou → SMS instant"
**As a** Marketing, **I want to** setez "imediat ce vine lead Facebook → SMS de welcome", **so that** răspund în secunde.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] DSL: TRIGGER `lead.created` + IF `source = 'facebook_ad'` THEN `send_sms`
  - [ ] UI vizual cu noduri
  - [ ] Test mode pe lead fictiv
  - [ ] Audit log fiecare execuție

## US-CRM-09: Automation "no response 3 days → reminder"
**As a** Marketing, **I want to** dacă lead-ul nu a fost contactat în 3 zile → trimite reminder, **so that** nu uităm leaduri.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Trigger time-based (cron zilnic)
  - [ ] Condiție pe stage + last_interaction
  - [ ] Action: WhatsApp template

## US-CRM-10: Conversion funnel report
**As a** Director, **I want to** văd "100 leads → 60 contactați → 40 trial → 25 plătit = 25% conversie", **so that** identific unde pierd.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Widget pe dashboard
  - [ ] Breakdown per sursă
  - [ ] Comparație lună-lună

## US-CRM-11: ROAS per campanie
**As a** Marketing, **I want to** văd "Facebook Spring2026 a generat 12 plătitori din 230€ buget", **so that** dublez bugetul pe campania bună.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Field `ad_spend_cents` per utm_campaign
  - [ ] Sync Meta Conversions API
  - [ ] Calcul cost-per-paying-student

## US-CRM-12: Self-service trial booking
**As a** Lead în pipeline, **I want to** rezerv singur o ora de probă, **so that** nu mai aștept apelul vânzătorului.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Link self-service (JWT signed)
  - [ ] Pagina cu disponibilitate profesor
  - [ ] Confirm + notificare manager

## US-CRM-13: Email/WhatsApp template library
**As a** Marketing, **I want to** salvez template-uri ("welcome", "trial confirm", "no-show follow-up"), **so that** vânzătorul nu scrie de la zero.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] CRUD templates
  - [ ] Variables: {{first_name}}, {{course}}, {{trial_date}}
  - [ ] Preview cu sample data

## US-CRM-14: Call recording integrat
**As a** Manager, **I want to** apelurile către lead-uri să fie înregistrate (cu consent), **so that** revizuiesc pentru training.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Integrare Twilio/Asterisk
  - [ ] Consent verbal scripted
  - [ ] Audio in storage (encrypted)
  - [ ] Transcript via Whisper

## US-CRM-15: Lead score (priority)
**As a** Vânzător, **I want to** sistemul îmi prioritizează leadurile (hot/warm/cold), **so that** sun întâi pe cei mai probabili.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Score 0-100 calculat din semnale (sursa, time-to-respond, replies)
  - [ ] Top 10 widget pe dashboard
  - [ ] Sort default desc pe score

## US-CRM-16: Reasign lead la alt vânzător
**As a** Manager, **I want to** reasign lead-ul când vânzătorul e în concediu, **so that** nu se pierde.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Field `assigned_to` user_id
  - [ ] Bulk reassign
  - [ ] Notificare ambii

## US-CRM-17: Pipeline custom (stadii personalizate)
**As an** Owner, **I want to** adaug stadiu nou "Așteaptă răspuns părinte", **so that** pipeline-ul reflectă procesul meu.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Configurare în /app/settings/crm/stages
  - [ ] Order + color customizable

## US-CRM-18: Lost reason analytics
**As a** Director, **I want to** văd top motive de pierdere ("prea scump 40%, distanță 25%"), **so that** ajustez ofertarea.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Required `lost_reason` la mutare în "lost" (deja există)
  - [ ] Categorii predefinite + custom
  - [ ] Pie chart în reports

## US-CRM-19: Re-activate lost leads (after 6 months)
**As a** Marketing, **I want to** trimit campanie "Ne-am perfecționat!" către leaduri lost > 6 luni, **so that** încerc să-i recâștig.
- **Status**: backlog
- **Priority**: P2

## US-CRM-20: Lead source attribution multi-touch
**As a** Marketing, **I want to** văd că lead-ul a venit prin Facebook → click Google → conversie, **so that** evaluez funnel-ul real.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Tracking touchpoints (cookies + server-side)
  - [ ] Modele de atribuire: first-touch, last-touch, linear
