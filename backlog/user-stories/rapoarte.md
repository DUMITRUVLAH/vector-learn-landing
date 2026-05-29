# Rapoarte (Analytics) — User Stories

## US-RAP-01: Dashboard live cu KPI principal
**As a** Director, **I want to** văd MRR + elevi activi + churn la deschidere, **so that** știu pulsul afacerii.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/analytics cu 4-6 KPI cards
  - [ ] Refresh la 30 sec
  - [ ] Comparison cu perioada anterioară

## US-RAP-02: Period toggle (7d/30d/90d/12m)
**As a** Director, **I want to** schimb perioada și toate KPI-urile se update, **so that** compar trends.
- **Status**: backlog
- **Priority**: P0

## US-RAP-03: MRR + ARR în timp (line chart)
**As a** Director, **I want to** văd evoluția MRR-ului, **so that** identific creștere/declin.
- **Status**: backlog
- **Priority**: P0

## US-RAP-04: Churn rate cu motive
**As a** Director, **I want to** văd ce procent pleacă lunar și de ce, **so that** intervin.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Calcul churn = lost / start_count
  - [ ] Breakdown pe motive (din `lost_reason`)

## US-RAP-05: LTV per elev
**As a** Director, **I want to** sortez elevii după LTV, **so that** identific clienții valoroși.
- **Status**: backlog
- **Priority**: P0

## US-RAP-06: ARPU (avg revenue per user)
**As a** Director, **I want to** ARPU lunar/anual, **so that** măsor sănătatea per-user.
- **Status**: backlog
- **Priority**: P1

## US-RAP-07: Ocupare săli %
**As a** Manager, **I want to** văd câte ore din capacity sunt folosite, **so that** decid dacă închiri sală nouă.
- **Status**: backlog
- **Priority**: P1

## US-RAP-08: Profitabilitate per disciplină
**As a** Director, **I want to** văd că "Engleză" generează 60% revenue cu 40% cost teacher, **so that** investesc în ea.
- **Status**: backlog
- **Priority**: P1

## US-RAP-09: Cohort retention analysis
**As a** Director, **I want to** văd "cohorta septembrie 2025: 40 elevi → 32 după 6 luni", **so that** judec retention.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Heatmap matrix month × cohort
  - [ ] Filter pe disciplină

## US-RAP-10: Top 10 elevi după LTV
**As a** Director, **I want to** lista celor mai valoroși 10 elevi, **so that** îi trat preferențial.
- **Status**: backlog
- **Priority**: P1

## US-RAP-11: Risk score elevi (churn prediction)
**As a** Director, **I want to** sistemul îmi spune cine riscă să plece (probabilitate %), **so that** intervin preventiv.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Modele simple (decision tree pe attendance + payment + engagement)
  - [ ] Score 0-100 per elev refresh nightly
  - [ ] Top 10 widget pe dashboard

## US-RAP-12: Export PDF dashboard
**As a** Director, **I want to** download PDF cu dashboard-ul curent, **so that** trimit boardului.
- **Status**: backlog
- **Priority**: P1

## US-RAP-13: Export Excel raw data
**As an** Accountant, **I want to** export toate plățile lunii ca Excel, **so that** import în SAGA.
- **Status**: backlog
- **Priority**: P0

## US-RAP-14: Filtru pe filială (multi-tenant care are 4+ centre)
**As a** Director rețea, **I want to** filtrez stats per filială sau consolidat, **so that** compar performanțe.
- **Status**: backlog
- **Priority**: P0

## US-RAP-15: Filtru pe profesor
**As a** Director, **I want to** filtrez stats pe Ana M., **so that** îi evaluez performanța individual.
- **Status**: backlog
- **Priority**: P1

## US-RAP-16: Custom report builder
**As a** Power user, **I want to** combin orice metric × dimension, **so that** răspund la întrebări specifice fără să cer dev.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Editor vizual pivot-style
  - [ ] Save report cu nume
  - [ ] Schedule email weekly

## US-RAP-17: Conectare Looker Studio / PowerBI
**As a** Data analyst, **I want to** import datele în Looker, **so that** fac vizualizări avansate.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Conector ODBC sau read-only Postgres user
  - [ ] Sample dashboard Looker template

## US-RAP-18: Marketing attribution dashboard
**As a** CMO, **I want to** ROAS per channel + CAC + LTV/CAC, **so that** alocăm budget corect.
- **Status**: backlog
- **Priority**: P1

## US-RAP-19: Daily digest email
**As a** Director, **I want to** primesc email zilnic 09:00 cu top 3 KPI + alert-uri, **so that** nu deschid app pentru status.
- **Status**: backlog
- **Priority**: P2

## US-RAP-20: Drill-down de la KPI la rândul individual
**As a** Director, **I want to** click pe "MRR 24.380€" → văd lista plăților, **so that** verific accuracy.
- **Status**: backlog
- **Priority**: P1
