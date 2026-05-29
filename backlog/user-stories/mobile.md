# Mobile App — User Stories

## US-MOB-01: PWA installable (Add to home screen)
**As a** Student, **I want to** instalez Vector Learn pe iPhone fără App Store, **so that** o accesez ca pe app nativă.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Web manifest cu icon, name, theme_color
  - [ ] Service worker pentru offline
  - [ ] iOS "Add to Home Screen" prompt

## US-MOB-02: Student dashboard cu next lesson
**As a** Student, **I want to** la deschidere văd următoarea lecție + countdown, **so that** sunt pregătit.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /m/dashboard sau /app/student (când role=student)
  - [ ] Next lesson card cu time-to + join link
  - [ ] Quick actions: vezi orar, teme, plăți

## US-MOB-03: Orar săptămânal mobile-first
**As a** Student, **I want to** scroll vertical orarul săptămânii, **so that** văd rapid pe mobil.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Day view default cu swipe între zile
  - [ ] Compact card per lecție

## US-MOB-04: Listă teme cu deadline
**As a** Student, **I want to** văd temele cu deadline + status (done/pending), **so that** prioritizez.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Tabel `homework` (student_lesson_id, body, deadline, status)
  - [ ] Sort by deadline asc
  - [ ] Filter "doar restante"

## US-MOB-05: Submit homework cu poză/text
**As a** Student, **I want to** atașez poză cu tema scrisă pe caiet, **so that** profesorul o vede direct.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Upload image (camera + galerie)
  - [ ] Optional text
  - [ ] Profesor vede în /app/grading

## US-MOB-06: Notificări push
**As a** Student, **I want to** primesc push când profesorul adaugă temă nouă, **so that** o văd instant.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Subscribe la categorii (homework, schedule_change, grades)
  - [ ] Web Push API

## US-MOB-07: Chat 1:1 cu profesorul
**As a** Student, **I want to** întreb profesorul ceva între lecții, **so that** nu aștept până data viitoare.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Conversație threaded
  - [ ] Profesor "Quiet hours" respectate
  - [ ] Părinte poate citi (opțional)

## US-MOB-08: Gamification — XP per acțiune
**As a** Student, **I want to** primesc XP pentru prezență + tema completă + quiz, **so that** mă simt motivat.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Tabel `xp_events` (student_id, type, amount, occurred_at)
  - [ ] Reguli configurable per centru
  - [ ] Total + level displayed

## US-MOB-09: Streak — zile consecutive de practice
**As a** Student, **I want to** păstrez streak-ul (10, 20, 30 zile), **so that** sunt motivat să continui.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Calcul streak la access app
  - [ ] Badge "30 zile" celebration
  - [ ] Reminder zi 6/29 ca să nu rup

## US-MOB-10: Leaderboard clasă (opt-in)
**As a** Student, **I want to** văd unde sunt în clasa mea, **so that** mă compar prietenos.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Top 10 din grupă cu XP
  - [ ] Opt-in / opt-out per student
  - [ ] Anti-bullying: doar la nivel clasă, nu școală

## US-MOB-11: Quiz interactiv
**As a** Student, **I want to** rezolv quiz cu multiple choice + scoring instant, **so that** verific dacă am înțeles.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Quiz builder pentru profesor
  - [ ] Multiple choice, true/false, fill-in
  - [ ] Score + feedback

## US-MOB-12: Audio listening exercises
**As a** Student la engleză, **I want to** ascult audio cu viteză variabilă (0.75x-1.5x), **so that** îmi adaptez nivelul.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Audio player custom
  - [ ] Transcript opțional

## US-MOB-13: Materiale download offline
**As a** Student, **I want to** download PDF-uri pentru a citi offline, **so that** lucrez în metrou.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Cache strategy în service worker
  - [ ] Indicator "saved offline"

## US-MOB-14: Plată din app
**As a** Părinte, **I want to** plătesc factura din app cu Apple/Google Pay, **so that** durează 2 taps.
- **Status**: backlog
- **Priority**: P0

## US-MOB-15: Calendar invite la lecție
**As a** Student, **I want to** lecția să apară în calendarul telefonului meu, **so that** nu o uit.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Add to calendar" → ICS file
  - [ ] Reminder native

## US-MOB-16: White-label branding
**As a** Centru, **I want to** app-ul să apară cu logo+culorile mele, **so that** elevii cred că e app-ul nostru.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Theme variables dynamic per tenant
  - [ ] Logo upload
  - [ ] Manifest custom per slug

## US-MOB-17: Părinte view (separate)
**As a** Părinte, **I want to** logat separat pe contul meu, văd progresul copilului fără să fiu copilul, **so that** monitorizez fără să citesc chat-uri private.
- **Status**: backlog
- **Priority**: P0

## US-MOB-18: Native iOS/Android (Expo/React Native)
**As a** Owner, **I want to** publica app-ul în App Store + Play Store, **so that** părinții o descarcă normal.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Setup Expo cu reuse logic frontend
  - [ ] EAS Build pentru distribuție
  - [ ] White-label per tenant (advanced)

## US-MOB-19: Biometric login (FaceID/Fingerprint)
**As a** Student, **I want to** intru cu FaceID, **so that** nu rețin parola.
- **Status**: backlog
- **Priority**: P2

## US-MOB-20: Voice notes la chat
**As a** Student, **I want to** trimit voice note profesorului cu pronunție, **so that** primesc feedback corectiv.
- **Status**: backlog
- **Priority**: P2
