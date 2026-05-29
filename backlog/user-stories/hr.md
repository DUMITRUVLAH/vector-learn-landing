# Teachers & HR — User Stories

## US-HR-01: Listă profesori cu stats
**As a** Manager, **I want to** văd toți profesorii cu rate + comision, **so that** am overview-ul echipei.
- **Status**: done ✅ (MVP-006)
- **Priority**: P0

## US-HR-02: Invitare profesor nou
**As an** Admin, **I want to** invit un profesor cu email + rate, **so that** apare în dropdown la create lesson.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Invită profesor" în /app/teachers
  - [ ] Form: email + nume + tarif/oră + comision%
  - [ ] Creează user (role=teacher) + teacher entry
  - [ ] Email cu link setup parolă

## US-HR-03: Editare rate + comision
**As an** Admin, **I want to** modific tariful unui profesor după negociere, **so that** salarizarea reflectă noua înțelegere.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Click row → edit modal
  - [ ] Audit log cu old/new
  - [ ] Effective date (păstrează rate vechi pentru lecții deja predate)

## US-HR-04: Profil profesor cu CV
**As a** Director, **I want to** atașez CV + diplomă + foto la profil profesor, **so that** am dosar complet.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] /app/teachers/:id cu tab "Documente"
  - [ ] Upload PDF/imagine (max 5 MB)
  - [ ] Storage Supabase/S3 cu GDPR-aware retention

## US-HR-05: Calcul salariu lunar automat
**As an** Admin, **I want to** sistemul calculează salariul fiecărui profesor pe baza lecțiilor predate, **so that** nu fac Excel manual.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Cron sfârșit de lună: agregă lessons completed × rate × commission
  - [ ] Generează `payroll_entries` row per profesor
  - [ ] PDF fluturaș cu breakdown lecție-cu-lecție
  - [ ] Email automat la profesor + manager

## US-HR-06: Bonus formule complexe (atendence, NPS)
**As an** Owner, **I want to** definesc bonus "+200€ dacă rata de prezență la grupele lui = 100%", **so that** motivez performant.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] DSL simplu: `IF attendance_rate >= 1.0 THEN 200 ELSE 0`
  - [ ] Tabel `bonus_rules` per profesor
  - [ ] Calcul lunar inclus în payroll

## US-HR-07: Rating profesor (1-5*) după lecție
**As a** Părinte, **I want to** evaluez profesorul după o lecție, **so that** managementul detectează probleme.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Push notification 1h după sfârșit lecție
  - [ ] UI: 5 stele + textarea optională
  - [ ] Anonimizat pentru profesor (vede doar media)
  - [ ] Manager vede individual + comentariu
  - [ ] Trigger alert dacă 3 evaluări <3*

## US-HR-08: Self-disponibilitate profesor
**As a** Profesor, **I want to** marchez "nu sunt disponibil joia după 18:00", **so that** managerul nu mă programează atunci.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/teacher/availability
  - [ ] Grid săptămânal cu toggle slot-uri
  - [ ] Conflict prevent la create lesson
  - [ ] Exceptions per dată (concediu o săpt)

## US-HR-09: Cerere de concediu
**As a** Profesor, **I want to** depun cerere de concediu 5 zile, **so that** se aprobă și nu mă programează atunci.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Form cu interval date + motiv
  - [ ] Status: pending → approved/rejected
  - [ ] Notificare manager
  - [ ] La approve: block availability automat

## US-HR-10: Înlocuiri automate la concediu
**As a** Manager, **I want to** sistemul îmi sugerează înlocuitori pentru lecțiile profesorului în concediu, **so that** nu sun manual fiecare coleg.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Algo match: profesori cu disciplina + disponibilitate + skills
  - [ ] Trimite request top 3, primul care confirmă o ia
  - [ ] Salariu se mută automat

## US-HR-11: Matrix permisiuni pe rol
**As an** Admin, **I want to** definesc ce poate face fiecare rol, **so that** profesorul nu vede plățile.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/settings/permissions cu matrice
  - [ ] 40+ acțiuni granulare
  - [ ] Server-side check pe fiecare endpoint

## US-HR-12: Onboarding checklist profesor nou
**As an** Admin, **I want to** trec profesorul prin checklist (semnătură contract, upload CV, training 1h), **so that** nu sar pași.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Template checklist editabil
  - [ ] Progress bar
  - [ ] Block acces lecții până 100%

## US-HR-13: Anunțuri interne
**As an** Owner, **I want to** publica un anunț pentru toți profesorii, **so that** comunicarea nu se face pe WhatsApp privat.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] /app/announcements cu post + targeting (rol/filială)
  - [ ] Reactions + comentarii
  - [ ] Acknowledgment obligatoriu pe importante

## US-HR-14: Time-tracking lecții
**As a** Profesor, **I want to** marcat ora exactă de început/sfârșit a lecției, **so that** salariul reflectă timpul real.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Buton "Start lesson" / "End lesson"
  - [ ] Diferență vs scheduled flagged
  - [ ] Manager aprobă > 10 min over

## US-HR-15: Bonus referral (profesor recomandă elev)
**As a** Profesor, **I want to** primesc bonus 50€ dacă elevul pe care l-am recomandat se înscrie, **so that** sunt motivat să aduc clienți.
- **Status**: backlog
- **Priority**: P2

## US-HR-16: Export plată la REVISAL/REGES
**As an** Admin, **I want to** export salariile lunare în format compatibil REVISAL, **so that** contabilul îl import direct.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Export REVISAL" lunar
  - [ ] XML conform specificațiilor ITM

## US-HR-17: Rating elev pe profesor (anonim)
**As an** Owner, **I want to** trimit chestionar trimestrial către elevi, **so that** detectez probleme de profesor înainte să plece.
- **Status**: backlog
- **Priority**: P1

## US-HR-18: Comparison stats între profesori
**As an** Director, **I want to** compar Ana M. cu Radu C. pe metrici (retenție, NPS, ocupare), **so that** decid promoții/training.
- **Status**: backlog
- **Priority**: P2

## US-HR-19: Profile public profesor (pentru landing)
**As a** Prospective parent, **I want to** văd CV-ul + experiența profesorului care va preda copilului meu, **so that** decid să mă înscriu.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Profesor opt-in pentru public profile
  - [ ] URL public `vectorlearn.io/scoli/{slug}/profesori/{teacher-slug}`

## US-HR-20: Audit log acțiuni HR
**As an** Owner, **I want to** văd toate schimbările de salariu, roluri, permisiuni cu cine + când, **so that** am dovadă pentru audit ITM.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Tabel `audit_log` cu action_type, target_id, actor_id, before, after
  - [ ] Retenție 7 ani
  - [ ] Filtrare în UI per resource
