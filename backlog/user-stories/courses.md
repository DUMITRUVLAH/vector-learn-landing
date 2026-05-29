# Courses — User Stories

## US-COURSE-01: Listă cursuri
**As a** Manager, **I want to** văd toate cursurile oferite, **so that** identific rapid catalogul.
- **Status**: done ✅ (MVP-005 — GET /api/courses)
- **Priority**: P0

## US-COURSE-02: Creare curs nou
**As an** Admin, **I want to** definesc un curs nou (nume, nivel, preț, durată), **so that** îl pot programa în orar.
- **Status**: done ✅ (MVP-005 — POST /api/courses)
- **Priority**: P0

## US-COURSE-03: Editare curs (preț, descriere)
**As an** Admin, **I want to** modific prețul unui curs pentru anul școlar nou, **so that** noile facturi reflectă tariful actual.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] PATCH /api/courses/:id
  - [ ] UI form modal
  - [ ] Audit log preț change

## US-COURSE-04: Pricing tiers per durată/pachet
**As a** Manager, **I want to** ofer pachete (10 lecții = 200€, 20 lecții = 380€), **so that** stimulez angajamente lungi.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `course_packages` (course_id, lessons_count, price, validity_months)
  - [ ] UI multiple pachete per curs

## US-COURSE-05: Niveluri CEFR auto-link
**As a** Director școală de limbi, **I want to** sistemul leagă "Engleză B2" de scala CEFR (A1-C2), **so that** rapoartele arată progresul standardizat.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Dropdown cu CEFR la create
  - [ ] Sortare auto în liste

## US-COURSE-06: Reduceri și coduri promo
**As a** Marketing, **I want to** generez coduri "BACK2SCHOOL -20%", **so that** ofert campanii sezoniere.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `promo_codes` cu discount %/€, expiry, max uses
  - [ ] Aplicare la create payment
  - [ ] Tracking utilizări

## US-COURSE-07: Curs arhivat (nu se mai oferă)
**As a** Manager, **I want to** arhivez un curs vechi, **so that** dispare din dropdown-uri dar rămâne în istoric.
- **Status**: backlog
- **Priority**: P1

## US-COURSE-08: Materiale didactice atașate
**As a** Profesor, **I want to** atașez PDF-uri cu materiale la un curs, **so that** elevii le accesează din app.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Upload multiple files
  - [ ] Folder structure per topic
  - [ ] Versioning

## US-COURSE-09: Curriculum cu lessons predefinite
**As a** Director, **I want to** definesc cursul "Engleză B2" cu 24 lecții template (cu obiective), **so that** profesorii noi urmează curriculum.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `course_curriculum` ordered list
  - [ ] Topic per lesson + obiective + materiale
  - [ ] Profesor vede next topic la prep

## US-COURSE-10: Capacitate maximă grupă
**As a** Manager, **I want to** setez "max 8 elevi în Engleză B2 grupa A", **so that** nu suprapopulez clasa.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Câmp `max_students` în `groups` (tabel nou)
  - [ ] Blocaj la enrolare când plin
  - [ ] Waitlist automat

## US-COURSE-11: Grupe (clase) ca entitate separată
**As a** Manager, **I want to** "Engleză B2 — Grupa Mar/Joi 14:00", **so that** programez lecții recurente la grupă, nu la curs.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Tabel `groups` (course_id, name, teacher_id, schedule_template)
  - [ ] Enrolare elevi în group, nu în course
  - [ ] Lessons referencează group

## US-COURSE-12: Stats per curs (LTV, retention)
**As a** Director, **I want to** văd care curs are cel mai bun LTV + retention, **so that** investesc în marketing pe el.
- **Status**: backlog
- **Priority**: P1

## US-COURSE-13: Pre-rechizite între cursuri
**As a** Curriculum designer, **I want to** marchez "Python avansat necesită Python fundamental", **so that** nu se înscriu elevi nepregătiți.
- **Status**: backlog
- **Priority**: P2

## US-COURSE-14: Curs cu durată variabilă (60/90/120 min)
**As a** Manager, **I want to** unele cursuri sunt 60 min, altele 90, **so that** orarul reflectă realist.
- **Status**: done ✅ (MVP-002 schema include durationMinutes)
- **Priority**: P0

## US-COURSE-15: Multi-instructor course
**As a** Director, **I want to** "Engleză B2" să poată fi predată de oricare din 5 profesori certificați, **so that** orarul flexibil.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Tabel `course_teachers` many-to-many

## US-COURSE-16: Filter / search cursuri
**As a** Recepționer, **I want to** caut "engleză" și văd toate cursurile relevante, **so that** consilez părintele rapid.
- **Status**: backlog
- **Priority**: P1

## US-COURSE-17: Duplicate course (copy as template)
**As a** Director, **I want to** duplic "Engleză B2" pentru "Engleză C1" cu același curriculum, **so that** nu rescriu de la zero.
- **Status**: backlog
- **Priority**: P2

## US-COURSE-18: Trial offer per curs
**As a** Marketing, **I want to** setez "primul curs gratuit", **so that** convertesc leaduri în trial.
- **Status**: backlog
- **Priority**: P1

## US-COURSE-19: Course catalog public (landing)
**As a** Prospective student, **I want to** văd toate cursurile pe pagina publică, **so that** decid ce mi se potrivește.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Endpoint public `/api/public/courses?tenant=demo-lingua-school`
  - [ ] Pagina `vectorlearn.io/scoli/{slug}/cursuri`

## US-COURSE-20: Bundle de cursuri (combo)
**As a** Marketing, **I want to** ofer "Engleză + Spaniolă -15%", **so that** stimulez multi-curs per elev.
- **Status**: backlog
- **Priority**: P2
