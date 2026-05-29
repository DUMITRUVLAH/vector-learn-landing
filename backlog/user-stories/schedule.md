# Schedule & Lessons — User Stories

## US-SCH-01: Week view cu navigare
**As a** Manager, **I want to** văd orarul săptămânii curente cu navigare prev/next, **so that** îmi planific eficient.
- **Status**: done ✅ (MVP-005)
- **Priority**: P0

## US-SCH-02: Programare lecție nouă
**As a** Manager, **I want to** programez o lecție din slot gol, **so that** completez orarul rapid.
- **Status**: done ✅ (MVP-005)
- **Priority**: P0

## US-SCH-03: Anulare lecție (soft)
**As a** Manager, **I want to** anulez o lecție, **so that** liberează slot-ul.
- **Status**: done ✅ (MVP-005)
- **Priority**: P0

## US-SCH-04: Detectare conflict profesor
**As a** Manager, **I want to** sistemul mă oprește dacă profesorul e deja rezervat, **so that** evit dublu-booking.
- **Status**: done ✅ (MVP-005 — server-side 409)
- **Priority**: P0

## US-SCH-05: Detectare conflict sală
**As a** Manager, **I want to** sistemul mă oprește dacă sala e ocupată în același interval, **so that** nu mut elevii pe coridor.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Adaugă `rooms` table (tenant_id, name, capacity)
  - [ ] Lesson schema: opțional `room_id`
  - [ ] Conflict detection extins pentru room
  - [ ] UI: dropdown room la create lesson

## US-SCH-06: Lecții recurente (every Monday)
**As a** Manager, **I want to** creez "Engleză B2 în fiecare luni 14:00 timp de 12 săpt", **so that** nu programez 12 lecții manual.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Modal cu "Repetă: zilnic / săptămânal / lunar"
  - [ ] Pick până la dată sau N ocurențe
  - [ ] Tabel `lesson_series` cu parent_id pe lessons
  - [ ] Edit "this one" vs "this and all following"
  - [ ] Bulk cancel "all future in series"

## US-SCH-07: Mutare cu drag-drop între celule
**As a** Manager, **I want to** trag lecția dintr-un slot în altul, **so that** reprogramez rapid.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] HTML5 DnD pe SchedulePage existent
  - [ ] PATCH /api/lessons/:id cu nou scheduledAt
  - [ ] Re-run conflict detection
  - [ ] Animatie smooth

## US-SCH-08: Marcare prezență la lecție
**As a** Profesor, **I want to** marchez prezent/absent la finalul lecției, **so that** sistemul actualizează atendența.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] În detail lesson: lista elevilor cu checkbox
  - [ ] PATCH student_lessons.attendanceStatus
  - [ ] markedBy + markedAt automat
  - [ ] Lock după 24h (cu unlock de manager)

## US-SCH-09: Recuperare lecție absent
**As a** Părinte al unui elev absent, **I want to** primesc 3 sloturi propuse pentru recuperare, **so that** aleg unul direct.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] La marcare absent → trigger calcul sloturi free profesor + elev
  - [ ] Email/WhatsApp cu 3 opțiuni
  - [ ] Link self-service (no-login, JWT 48h)
  - [ ] Rezervare creează lesson nouă

## US-SCH-10: Înlocuitor profesor
**As a** Manager, **I want to** schimb profesorul la o lecție specifică, **so that** acopăr concediu medical.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Dropdown "Schimbă profesor" în detail
  - [ ] Filtrare cu doar profesorii free în acel slot
  - [ ] Notificare automată ambii profesori + elevi

## US-SCH-11: Generare link Zoom/Meet automat
**As a** Manager, **I want to** sistemul îmi generează link de videoconferință când programez lecție online, **so that** nu copy-paste manual.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Toggle "Online lesson" la create
  - [ ] OAuth Zoom/Google Meet la setup
  - [ ] Auto-create meeting + salvare URL
  - [ ] Revoke la cancel

## US-SCH-12: Vizualizare per profesor
**As a** Director, **I want to** filtrez orarul doar pe Ana M., **so that** văd cât e încărcată.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Dropdown filter "Profesor" în page header
  - [ ] Query cu teacherId
  - [ ] Counter "X lecții/săptămână, Y ore"

## US-SCH-13: Vizualizare per sală
**As a** Manager cu 4 săli, **I want to** văd orarul săli-cu-săli, **so that** verific ocuparea fizică.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Toggle view "By room" cu grid săli × ore

## US-SCH-14: Lecție individuală vs grupă
**As a** Manager, **I want to** programez lecție 1:1 (1 elev) sau grupă (N elevi), **so that** acopăr ambele use-case.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] La create: selector "Individuală" / "Grupă (selectează elevi)"
  - [ ] Grupă: multi-select studenți activi
  - [ ] Pre-populare student_lessons records

## US-SCH-15: Confirmare 24h înainte
**As a** Părinte, **I want to** primesc reminder cu 24h înainte de lecție, **so that** nu o uit.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Cron 18:00 zilnic: caută lecții în 24-25h
  - [ ] Trimite WhatsApp template către părinți
  - [ ] Buton "Confirmă prezența" în mesaj
  - [ ] Manager vede status confirm

## US-SCH-16: Export calendar (iCal)
**As a** Profesor, **I want to** import orarul în Google Calendar al meu, **so that** îl văd alături de evenimentele personale.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Endpoint `/api/calendar/teacher/:id.ics` (token-auth)
  - [ ] Format iCalendar standard
  - [ ] Update la 15 min cache

## US-SCH-17: Vizualizare mobilă optimizată
**As a** Profesor pe telefon, **I want to** scroll vertical orarul zilei curente, **so that** verific rapid lecțiile.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] La <md breakpoint: "Day view" cu listă verticală
  - [ ] Swipe între zile
  - [ ] Indicator "În progres acum"

## US-SCH-18: Notificare push lecție în 15 min
**As a** Profesor, **I want to** primesc push notification cu 15 min înainte de lecție, **so that** mă pregătesc.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] PWA + push subscription
  - [ ] Cron la fiecare minut caută lecții în 15-16 min
  - [ ] Web push API standard

## US-SCH-19: Statistici încărcare profesor
**As a** Director, **I want to** văd câte ore predă Ana M. săptămâna asta, **so that** balansez echipa.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Widget "Top profesori după ore săpt"
  - [ ] Sortare desc + percentile

## US-SCH-20: Bulk-shift (mută toată grupa cu o săpt)
**As a** Manager, **I want to** mut toate lecțiile grupei B2-A cu o săpt mai târziu pentru vacanță, **so that** nu modific 6 lecții manual.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Acțiune bulk în filter pe grupă
  - [ ] Confirm cu count + range date
  - [ ] Conflict report înainte de aplicare
