# Multi-filiale & Franciză — User Stories

## US-MF-01: Tabel `branches` per tenant
**As an** Owner, **I want to** definesc 2+ filiale sub același tenant, **so that** raportez consolidat.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Tabel `branches` (tenant_id, name, address, manager_user_id)
  - [ ] Câmpul `branch_id` (nullable) pe students, teachers, lessons, courses
  - [ ] Backfill: existing rows → "Default branch"

## US-MF-02: Branch switcher în UI
**As a** Director rețea, **I want to** dropdown "Toate / București / Cluj", **so that** filtrez vizualizările.
- **Status**: backlog
- **Priority**: P0

## US-MF-03: Pricing books per branch
**As a** Manager, **I want to** "Engleză B2 = 280€/lună în București, 220€ în Cluj", **so that** reflect realitatea pieței locale.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Tabel `course_prices_per_branch`
  - [ ] Fallback la prețul cursului dacă nu există override

## US-MF-04: Branding per branch (logo, culori)
**As a** Manager, **I want to** filiala mea să aibă brand-ul local (logo + culori), **so that** clienții recunosc identitatea.
- **Status**: backlog
- **Priority**: P1

## US-MF-05: Roluri scoped pe branch
**As an** Owner, **I want to** managerul X vede DOAR filiala lui, **so that** datele celorlalți sunt private.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Field `branch_scope` în users
  - [ ] Toate query-urile cu `WHERE branch_id IN scope`

## US-MF-06: Subdomeniu per filială
**As a** Director, **I want to** "cluj.lingua-school.ro" să fie portal-ul filialei Cluj, **so that** brand-ul local respiră.
- **Status**: backlog
- **Priority**: P1

## US-MF-07: Transfer elev între filiale
**As a** Manager, **I want to** mut elevul din BCR în Cluj, **so that** istoricul rămâne dar contextul se update.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Atomic transaction
  - [ ] Notificare ambele filiale
  - [ ] Recalcul pricing dacă diferă

## US-MF-08: Transfer profesor între filiale
**As a** Manager, **I want to** Ana M. să predea la 2 filiale, **so that** acopăr peak hours.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `teacher_branches` m2m
  - [ ] Calcul salariu split per filială

## US-MF-09: Rapoarte consolidate vs per-filială
**As a** Director rețea, **I want to** toggle "consolidat / per filială", **so that** văd both pictures.
- **Status**: backlog
- **Priority**: P0

## US-MF-10: Hartă cu pin-uri filiale
**As a** Director, **I want to** hartă SVG/Google Maps cu pin-uri + KPI hover, **so that** vizualizez geografic.
- **Status**: backlog
- **Priority**: P2

## US-MF-11: Royalty calculation pentru franciză
**As a** Francize Owner, **I want to** sistemul calculează 8% din venit lunar ca royalty, **so that** francizatul plătește automat.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Config "royalty_pct" per branch
  - [ ] Cron lunar generate payout
  - [ ] Breakdown vizibil ambele părți

## US-MF-12: Setup franciză nouă (one-click)
**As an** Owner, **I want to** click "Adaugă franciză nouă" → creează branch + manager + setup wizard, **so that** scalez rapid.
- **Status**: backlog
- **Priority**: P1

## US-MF-13: Catalog central (cursurile sunt aceleași)
**As an** Owner, **I want to** definesc o singură dată catalog cursuri, branch-urile îl reutilizează, **so that** consistență brand.
- **Status**: backlog
- **Priority**: P1

## US-MF-14: Multi-country support
**As an** Enterprise customer, **I want to** filiale în RO + MD + BG cu currency + tax local, **so that** opez international.
- **Status**: backlog
- **Priority**: P2

## US-MF-15: Audit log cross-branch
**As an** Owner, **I want to** văd toate acțiunile manager X în filiala lui, **so that** am control.
- **Status**: backlog
- **Priority**: P1

## US-MF-16: KPI compare side-by-side
**As a** Director rețea, **I want to** compar BCR vs Cluj pe MRR + churn, **so that** identific best/worst.
- **Status**: backlog
- **Priority**: P1

## US-MF-17: Transfer mass (clienții unei filiale închisă)
**As an** Owner, **I want to** dacă închid o filială, transfer toți la altă filială, **so that** nu pierd clienții.
- **Status**: backlog
- **Priority**: P2

## US-MF-18: List view pentru 20+ filiale
**As a** Director, **I want to** când am 20 filiale, tabel cu sortare + filtre, **so that** nu mă pierd în hartă.
- **Status**: backlog
- **Priority**: P2

## US-MF-19: Legal entity per franciză (CUI + e-Factura)
**As a** Francize Owner, **I want to** fiecare franciză are propriul CUI și emite e-Factura separat, **so that** legal compliant.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `legal_entities` (cui, vat, address)
  - [ ] Branch leagă la legal entity
  - [ ] e-Factura folosește datele entității

## US-MF-20: Permission inheritance (admin rețea → manager filială)
**As an** Owner, **I want to** dau admin rețea acces la tot, manager doar la filiala lui, **so that** ierarhia e clară.
- **Status**: backlog
- **Priority**: P0
