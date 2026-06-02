# Vector Learn — Backlog Gap-Analysis față de HOLLIHOP

> Generat: 2026-06-01 | Bază: hollihop-functions.md + schema DB + pagini app existente
> Scope: funcționalități lipsă sau parțiale față de competitorul HOLLIHOP (demo.t8s.ru)
> Design rămâne al nostru — nu copiem UI, implementăm funcționalitatea cu design system Vector 365.

---

## Rezumat executive

Vector Learn are deja un CRM complet, orar cu prezență, facturare, portal părinte (SCHOOL-007), notificări cu coadă, și cohorte. **Marile goluri față de HOLLIHOP sunt de trei tipuri:**

1. **Fluxul lead→trial→student** nu are un tip de lecție „trial" distinct, nici conversia automată după plată — un prospect ajunge la grupă prin muncă manuală în 4–5 pași.
2. **Abonamentele sunt exclusiv bănești** (`subscriptions.amountCents`), fără sold de unități per elev per grupă — modelul dominant în centrele non-school (pachete 10/20 lecții cu deducere automată la prezență) lipsește complet.
3. **Portalul student** (adulți, nu copii de școală) și **notificările în cascadă** (WhatsApp→Telegram→SMS→Push) lipsesc — ambele sunt argumentele #1 și #2 în demo-urile competitorului.

Dacă se livrează Grupurile 1–3 (GAP-001 → GAP-010), Vector Learn atinge paritatea funcțională cu HOLLIHOP pe fluxurile care blochează cel mai des vânzarea. Grupurile 4–6 adaugă avantaj competitiv pe analitica avansată și operațional.

---

## FLUXUL CENTRAL: Lead → Lecție Trial → Student Activ → Plată Recurentă

```
Lead (CRM existent)
  │  stage: "new" → "contacted"
  │  GAP-001: se adaugă slot preferat orar (zi + oră dorite)
  ↓
GAP-002: Potrivire automată grupă
  │  → propune grupe cu loc liber compatibile cu:
  │    disciplină + nivel + filial + vârstă + slot preferat (GAP-001)
  ↓
GAP-003: Lecție Trial (tip special în `lessons`)
  │  leadId FK → lesson; profesorul marchează prezența și rezultatul
  │  SCHED-503 (existent) → marcare prezență per elev
  ↓
  ├─ Trial nereușit → Lead rămâne în pipeline (stage: "trial")
  └─ Trial reușit + plată → GAP-004: Conversie automată
        lead → student activ + înrolare grupă
        ↓
      Student Activ
        │  GAP-005: Rezervă grupă (grupul plin → lista așteptare
        │           → activare automată la loc liber)
        │
        │  GAP-006: Sold unități (pachet N lecții cumpărat)
        │    └─ GAP-007: Deducere automată la prezență marcată
        │    └─ GAP-008: Auto-billing la epuizare unități
        ↓
      GAP-009: Lecție Recuperare
        │  absență → recovery_request → rebook din portal
        │  legată de student_lessons.attendanceStatus = 'absent'
        ↓
      GAP-010: Portal Student
        │  orar personal, sold unități, facturi, recuperare,
        │  teme, materiale, chat profesor, plată card (PAY-901)
        ↓
      GAP-017: Notificări în cascadă
           WhatsApp → Telegram → SMS → Push
           (la absență, factură restantă, epuizare pachet)
```

---

## Grup 1: Prezență, Lecții Trial & Recuperare

> *Prezența per lecție (SCHED-503) există deja în schemă (`student_lessons.attendanceStatus`).
> Itemii de mai jos o extind cu tipuri de lecții noi și fluxuri legate.*

---

### GAP-001: Slot preferat orar pe lead/student

**Prioritate:** HIGH
**Dependențe:** `leads` (existent), `students` (existent), CRM-106 lead card (existent)
**Alimentează:** GAP-002 (potrivire grupă), GAP-003 (planificare lecție trial)

**Ce face:** Lead-ul sau studentul poate declara ziua săptămânii și intervalul orar preferat
(ex. „Marți 17:00–19:00", „Weekend"). Informația e stocată pe lead/student și e folosită de
motorul de potrivire grupă. Fără acest câmp, potrivirea automată nu are date de intrare.

**Criterii de acceptare:**
- [ ] Coloane `preferred_days` (jsonb array 1–7) și `preferred_time_start` / `preferred_time_end` (time) adăugate pe `leads` și `students` printr-o migrare
- [ ] `PATCH /api/leads/:id` și `PATCH /api/students/:id` acceptă aceste câmpuri fără a rupe celelalte
- [ ] Lead Card (CRM-106) afișează și permite editarea slotului preferat cu selector zi + interval orar
- [ ] Câmpul e vizibil și editabil pe cardul studentului din StudentsPage

**De ce acum:** Input obligatoriu pentru GAP-002. Fără el, potrivirea automată returnează orice grupă,
nu una compatibilă cu programul clientului — cel mai frecvent motiv de abandon al trialing-ului.

---

### GAP-002: Potrivire automată grupă

**Prioritate:** HIGH
**Dependențe:** GAP-001 (slot preferat), `courses` (existent), `lessons` + `student_lessons` (existent), `teachers` + `availability` (existent)
**Alimentează:** GAP-003 (propune lecție trial în grupa potrivită), GAP-005 (rezervă în grupă)

**Ce face:** La acțiunea „Găsește grupă" pe cardul unui lead, sistemul interoghează grupele cu loc
liber care se potrivesc cu disciplina, nivelul, filiala, vârsta și slotul preferat din GAP-001.
Returnează maximum 5 sugestii sortate după scor de compatibilitate:
slot exact > zi exactă > orice slot.

**Criterii de acceptare:**
- [ ] `GET /api/courses/match?leadId=&tenantId=` returnează lista de grupe potrivite cu scor de compatibilitate
- [ ] Scorarea ia în calcul: disciplina (mandatory), nivel, slot preferat GAP-001, locuri libere (nu propune grupe pline)
- [ ] Buton „Găsește grupă" pe Lead Card deschide un panel cu rezultatele; din panel se poate crea direct o lecție trial (GAP-003)
- [ ] Grupele fără loc liber nu apar (sau apar cu badge „Lista de așteptare" dacă GAP-005 e implementat)

**De ce acum:** Elimină 15–30 minute de muncă manuală per prospect. Este argumentul de vânzare #2
al HOLLIHOP față de soluțiile mai vechi.

---

### GAP-003: Lecție Trial (tip distinct de lecție)

**Prioritate:** HIGH
**Dependențe:** `lessons` (existent), `leads` (existent), SCHED-503 prezență (existent), GAP-002 (potrivire grupă)
**Alimentează:** GAP-004 (conversie automată după trial reușit), GAP-009 (lecțiile trial nu generează recovery)

**Ce face:** Introduce un tip de lecție `trial` cu `is_trial boolean` și `trial_lead_id FK → leads`.
O lecție trial leagă un lead de o grupă existentă. Profesorul poate marca rezultatul trialing-ului
(interesat / neinteresat / neprezent). La marcarea „interesat + plată confirmată", sistemul oferă
acțiunea de conversie directă (GAP-004).

**Criterii de acceptare:**
- [ ] Coloana `is_trial boolean default false` și `trial_lead_id uuid references leads` adăugate pe `lessons` printr-o migrare
- [ ] `POST /api/lessons` acceptă `{ isTrial: true, trialLeadId: "..." }` fără a rupe lecțiile normale
- [ ] Lecțiile trial apar cu badge vizual distinct „Trial" pe SchedulePage
- [ ] Pe Lead Card apare secțiunea „Lecții trial" cu lista lecțiilor trial asociate și statusul lor
- [ ] O lecție trial **nu** generează deducere din sold unități (GAP-007) și **nu** intră în calculul payroll salarizare-prezență (GAP-014)

**De ce acum:** Fără tip distinct, trial-urile poluează orarul, generează facturi greșite, deformează
statistica de prezență. Este blocantul cel mai des menționat în demo-uri.

---

### GAP-004: Conversie automată trial → student activ + înrolare grupă

**Prioritate:** HIGH
**Dependențe:** GAP-003 (lecție trial), `leads` (existent), `students` (existent), CRM-111 conversie lead→student (existent), `courses` / `student_lessons` (existent)
**Alimentează:** GAP-006 (sold unități — creat la conversie), GAP-005 (dacă grupul e plin → rezervă)

**Ce face:** Acțiunea „Convertește din trial" pe lead card face atomic: (1) creează studentul din
datele lead-ului via CRM-111 existent, (2) înscrie studentul în grupă — creează `student_lessons`
pentru toate lecțiile viitoare din serie, (3) marchează lead-ul `converted_to_student_id`.
Diferă de CRM-111 prin că adaugă pasul de înrolare în grupă.

**Criterii de acceptare:**
- [ ] `POST /api/leads/:id/convert-trial` acceptă `{ courseId, createPackage?: boolean }` și returnează `{ studentId, enrolledLessons: N }`
- [ ] Studentul apare imediat în `student_lessons` pentru lecțiile viitoare ale seriei de grup
- [ ] Lead-ul capătă `converted_to_student_id` și `converted_at` (refolosește câmpurile existente din CRM-111)
- [ ] Dacă `createPackage: true`, se creează un sold de unități (GAP-006) cu pachetul implicit al grupei
- [ ] Acțiunea e disponibilă din Lead Card numai dacă lead-ul are cel puțin o lecție trial marcată

**De ce acum:** Fără conversie automată cu înrolare, staff-ul face 4 pași manuali — sursă de erori
(studentul uitat din grupă, facturat fără acces).

---

### GAP-009: Lecție Recuperare (make-up)

**Prioritate:** HIGH
**Dependențe:** SCHED-503 prezență (existent — `student_lessons.attendanceStatus`), `lessons` / `lessonSeries` (existent), `teachers` availability (existent), GAP-006 sold unități
**Alimentează:** GAP-010 portal student (afișează opțiunile de recuperare), GAP-017 notificări cascadă (trimite WhatsApp la absență)

**Ce face:** Când un profesor marchează un elev `absent`, sistemul creează automat un `recovery_request`
legat de `student_lessons.id`. Motorul găsește până la 3 sloturi libere compatibile (același profesor,
disciplină, nivel) în 14 zile și trimite notificarea către tutore. Tutorele alege din portal (GAP-010)
sau prin link fără login (JWT scurt 48h). Recuperarea marcată `completed` nu consumă din sold unități
dacă era inclusă în pachet.

**Criterii de acceptare:**
- [ ] Tabel `recovery_requests`: `id`, `tenantId`, `studentLessonId` FK (unique), `status` enum(pending/reserved/expired/completed), `suggestedSlots` jsonb, `reservedLessonId` FK null, `expiresAt`, timestamps
- [ ] La `PATCH .../attendance` cu `status: absent`, sistemul creează automat `recovery_request` cu sloturi populate
- [ ] `GET /api/recovery/:token` (JWT nesemnat, valid 48h) returnează sugestiile — accesibil fără autentificare
- [ ] `POST /api/recovery/:token/reserve` creează lecție sau înregistrează prezența și marchează recovery `reserved`
- [ ] Recuperarea **nu** generează deducere din sold unități dacă `recovery_included_in_package = true` (flag pe tipul de pachet)
- [ ] Dacă tutorele nu acționează în 48h, recovery trece în `expired` (job cron sau lazy next-request)

**De ce acum:** Feature-ul care diferențiază cel mai vizibil față de Excel/Google Sheets. Părinții văd
că sistemul „se ocupă singur" la absență — argument direct de retenție.

---

## Grup 2: Abonamente cu Sold de Unități

> *Abonamentele bănești există deja (`subscriptions` — FIN-603). Itemii de mai jos adaugă modelul
> de pachete de lecții (sold de unități), complet diferit conceptual de abonamentul lunar bănesc.*

---

### GAP-006: Sold de unități per student per grupă (pachete de lecții)

**Prioritate:** HIGH
**Dependențe:** `students` (existent), `courses` (existent), `invoices` / `payments` (existent — FIN-601)
**Alimentează:** GAP-007 (deducere automată la prezență), GAP-008 (auto-billing la epuizare), GAP-009 (recuperarea nu consumă unități), GAP-010 portal student (afișează soldul)

**Ce face:** Introduce conceptul de pachet de lecții prepay: un student cumpără N lecții
(ex. „Pachet 10 lecții — 1500 RON"). Se creează un `lesson_package` cu `unitsTotal = 10`,
`unitsRemaining = 10`, legat de student + grupă + factură. La fiecare lecție marcată `present`,
`unitsRemaining` scade cu 1. Separate de `subscriptions` (bănești/lunare). Un student poate
avea simultan un pachet de unități ȘI un abonament bănesc pe aceeași grupă.

**Criterii de acceptare:**
- [ ] Tabel `lesson_packages`: `id`, `tenantId`, `studentId` FK, `courseId` FK, `invoiceId` FK null, `unitsTotal integer`, `unitsRemaining integer`, `validFrom date`, `validUntil date null`, `status` enum(active/exhausted/expired/cancelled), timestamps
- [ ] `POST /api/lesson-packages` → creare pachet; `GET /api/lesson-packages?studentId=` → lista pachete active
- [ ] Soldul curent vizibil pe pagina studentului cu badge „X lecții rămase"
- [ ] Alertă automată (notificare in-app + COMM-205) când `unitsRemaining <= 2`
- [ ] Soldul vizibil și în portalul student (GAP-010)

**De ce acum:** Modelul dominant de facturare în centrele de muzică, limbi, dans este „pachet de
lecții", nu abonament lunar. Fără sold de unități, Vector Learn e incompatibil cu modul de lucru
al ~60% din clienți potențiali.

---

### GAP-007: Deducere automată din sold unități la prezență marcată

**Prioritate:** HIGH
**Dependențe:** GAP-006 (sold unități), SCHED-503 prezență (`student_lessons.attendanceStatus`, existent)
**Alimentează:** GAP-008 (auto-billing când sold = 0), GAP-010 portal student (sold actualizat în timp real)

**Ce face:** Hook declanșat la `PATCH .../attendance` cu `status: present` — dacă studentul are
un pachet activ pentru grupă, scade 1 unitate din `lesson_packages.unitsRemaining`. Dacă nu are
pachet activ (sau are abonament bănesc), nu face nimic. Operația e atomică (tranzacție DB).

**Criterii de acceptare:**
- [ ] La marcarea `present`, `lesson_packages.unitsRemaining` scade cu 1 în mod atomic (tranzacție)
- [ ] Dacă studentul are mai multe pachete active pentru aceeași grupă, se consumă cel mai vechi (FIFO pe `validFrom`)
- [ ] Dacă nu există pachet activ, marcarea prezentei reușește fără eroare (behavior unchanged față de azi)
- [ ] Deducerea e logată în `audit_log` cu `{ action: "unit_deducted", packageId, studentId, lessonId }`
- [ ] Lecțiile trial (GAP-003) și recuperările incluse în pachet (GAP-009) **nu** declanșează deducerea

**De ce acum:** Fără deducere automată, managerii numără manual lecțiile din pachete — principala
sursă de erori și dispute cu clienții.

---

### GAP-008: Auto-billing la epuizare unități

**Prioritate:** MEDIUM
**Dependențe:** GAP-006 (sold unități), FIN-603 abonamente bănești (existent), FIN-601 invoices (existent), COMM-205 notificări (existent)
**Alimentează:** GAP-010 portal student (vede factura generată), REP-301 KPI dashboard (existent)

**Ce face:** Când `lesson_packages.unitsRemaining = 0`, sistemul generează automat o factură pentru
un pachet nou (dacă `auto_renew = true` pe pachet) și trimite notificarea. Extinde logica din
FIN-603 cu un al doilea trigger: epuizare unități, nu doar dată calendaristică.

**Criterii de acceptare:**
- [ ] Câmp `auto_renew boolean default false` și `package_template_id` (FK sau jsonb config) pe `lesson_packages`
- [ ] La `unitsRemaining = 0`, dacă `auto_renew = true`, se generează factură și un pachet nou cu `unitsTotal` identic, `status: active`
- [ ] Notificare (COMM-205) trimisă părintelui: „Pachetul X s-a epuizat. Factură nr. Y generată."
- [ ] Manager poate configura per grupă dacă reînnoirea e automată sau necesită confirmare
- [ ] Endpoint `POST /api/lesson-packages/run-renewal` pentru declanșare manuală + cron

**De ce acum:** Fără auto-billing, un student rămâne fără acces dacă nimeni nu observă că pachetul
s-a terminat — churn nedorit, evitabil.

---

## Grup 3: Portal Student & Comunicare Avansată

---

### GAP-010: Portal Student self-service

**Prioritate:** HIGH
**Dependențe:** SCHOOL-007 portal părinte (existent, dar read-only și pentru copii de școală), `student_lessons` (existent), GAP-006 sold unități, GAP-009 recuperare, FIN-601 invoices (existent), COMM-205 (existent)
**Alimentează:** GAP-009 (rezervare recuperare din portal), GAP-008 (plată pachet din portal — după PAY-901), GAP-020 puncte de progres (vizibile în portal)

**Ce face:** Portal dedicat **studenților adulți** la `/app/student/portal` — diferit de SCHOOL-007
care e pentru părinți de elevi de școală. Studentul autentificat vede: orarul personal săptămânal,
soldul de unități (GAP-006), lecțiile cu posibilitate de a rezerva recuperarea (GAP-009), facturile
deschise, materialele atașate lecției, și poate trimite un mesaj profesorului.

**Criterii de acceptare:**
- [ ] Rol `student` pe `user_role` enum (dacă nu există) + redirect la `/app/student/portal` la login
- [ ] `GET /api/student/schedule` → lecțiile viitoare ale studentului logat, scoped la tenantId
- [ ] `GET /api/student/balance` → pachete active (GAP-006) cu `unitsRemaining`
- [ ] `GET /api/student/invoices` → facturile studentului (FIN-601)
- [ ] `GET /api/student/recovery-requests` → cererile de recuperare pending (GAP-009)
- [ ] `POST /api/student/recovery/:token/reserve` → rezervare slot recuperare
- [ ] `StudentPortalPage.tsx` la `/app/student/portal` cu tab-uri: Orar / Sold / Facturi / Recuperare
- [ ] Datele sunt strict ale studentului logat (tenant + student_id scoping — nu vede alți studenți)

**De ce acum:** Competitorii HOLLIHOP și Teachworks prezintă portalul ca feature #1 în demo-uri.
Clienții existenți cer explicit: „Pot elevii să-și vadă orarul singuri?"

---

### GAP-017: Notificări în cascadă (WhatsApp → Telegram → SMS → Push)

**Prioritate:** MEDIUM
**Dependențe:** COMM-205 coadă notificări (existent), `messages` cu `messageChannelEnum` (existent — whatsapp/sms/email/in_app), `students` / `leads` (existent)
**Alimentează:** GAP-009 (trimitere WhatsApp la absență), GAP-003 trial (confirmare trial), GAP-008 (notificare epuizare pachet)

**Ce face:** Extinde `notification_queue` cu logica de fallback: dacă un mesaj WhatsApp nu e livrat
în N minute (fără delivery receipt), sistemul reîncearcă pe canalul următor din lista configurabilă
a tenant-ului (ex. WhatsApp → Telegram → SMS). Ordinea canalelor și timeout-urile sunt configurabile
per tenant. Fiecare tentativă e logată separat în `messages`.

**Criterii de acceptare:**
- [ ] Tabel `notification_channel_config`: `tenantId`, `channelOrder` jsonb (array de canale), `fallbackTimeoutMinutes integer`
- [ ] La expirarea timeout-ului fără delivery receipt, se creează o înregistrare nouă în coadă pentru canalul următor, cu `parent_notification_id` FK pentru trasabilitate
- [ ] Delivery receipt marcat când canalul confirmă livrarea (ex. WhatsApp `status: delivered`)
- [ ] Configurare vizibilă în Settings → Notificări (pagina Settings existentă)
- [ ] Dacă toate canalele eșuează, notificarea capătă `skippedReason: "all_channels_failed"` și se loghează în audit

**De ce acum:** Rata de livrare WhatsApp în România variază — unii părinți au numai Telegram sau SMS.
Fără fallback, notificări critice (absență, factură restantă) sunt pierdute.

---

## Grup 4: Analytics & Rapoarte Extinse

---

### GAP-011: Funnel vizual bazat pe schimbări de status lead

**Prioritate:** MEDIUM
**Dependențe:** `leads` cu `leadStageEnum` (existent: new/contacted/trial/paid/lost), `leadInteractions` cu `type: stage_change` (existent), CRM-112 analytics (existent)
**Alimentează:** GAP-012 (partajă același data source), KpiDashboardPage (existent — poate adăuga widget)

**Ce face:** Vizualizare tip pâlnie care arată câți leads au trecut prin fiecare etapă de status
(new→contacted→trial→paid) și rata de conversie între etape pe o perioadă selectată.
Diferit de kanban-ul din CRM (stare curentă) — funnel-ul arată fluxul cumulat.

**Criterii de acceptare:**
- [ ] `GET /api/analytics/lead-funnel?from=&to=` returnează `[{ stage, count, conversionFromPrev }]` bazat pe `leadInteractions.type = 'stage_change'`
- [ ] Widget „Funnel Leads" adăugat în KpiDashboardPage sau ReportsPage
- [ ] Filtrabil pe perioadă (luna curentă / trimestru / an / custom)
- [ ] Filtrabil pe sursă (leadSourceEnum) pentru a vedea care surse au cea mai bună conversie per etapă
- [ ] Rata de conversie new→paid afișată atât procentual cât și ca număr absolut

**De ce acum:** Directoarele cer constant „Câți din cei care au venit la trial au rămas?" — azi
răspunsul se calculează manual în Excel.

---

### GAP-012: Raport sursă reclamă cu conversie completă

**Prioritate:** MEDIUM
**Dependențe:** `leads` cu UTM fields (utmSource, utmMedium, utmCampaign, fbclid, gclid — existente), `payments` (existent), CRM-112 analytics (existent)
**Alimentează:** GAP-011 (partajă conceptul de funnel), REP-301 KPI dashboard (poate adăuga coloana ROI)

**Ce face:** Raport tabelar care agregă per sursă UTM: număr leads, număr convertiți la student,
valoarea totală plăților generate, rata de conversie. Calculează ROI per sursă dacă se introduce
costul campaniei (câmp opțional manual).

**Criterii de acceptare:**
- [ ] `GET /api/analytics/source-conversion?from=&to=` returnează `[{ source, leads, converted, revenue_cents, conversion_rate }]`
- [ ] RevenueChartsPage sau ReportsPage afișează tabelul sortat după revenue_cents
- [ ] Suport pentru filtrare per sursă (`utm_source`, `utm_medium`) și per campanie (`utm_campaign`)
- [ ] Export CSV al raportului (refolosește REP-304 export logic existent)
- [ ] Coloana „Cost campanie" poate fi introdusă manual per sursă pentru calculul ROI (stored în settings jsonb)

**De ce acum:** Centrele care rulează Facebook/Google Ads nu știu care anunț aduce studenți
plătitori vs. leads moarte. Acest raport justifică bugetul de marketing.

---

### GAP-014: Salarizare bazată pe prezența efectivă (tarif per elev prezent)

**Prioritate:** MEDIUM
**Dependențe:** `payrollEntries` cu `breakdown jsonb` (existent — HR-401), `student_lessons.attendanceStatus` (existent — SCHED-503), `teachers.hourlyRateCents` (existent)
**Alimentează:** HR-401 payroll (existent — extinde logica de calcul existentă)

**Ce face:** Extinde calculul de payroll (HR-401) cu un al doilea model de tarifare: în loc de
`hourlyRateCents × durationMinutes/60`, profesorul primește `ratePerStudentPresent × N` unde
N = elevii marcați `present` la lecție. Cele două modele coexistă — configurabil per profesor
sau per tip de curs.

**Criterii de acceptare:**
- [ ] Câmp `payroll_model enum('hourly','per_student') default 'hourly'` adăugat pe `teachers` sau `courses`
- [ ] Câmp `rate_per_student_cents integer` pe `teachers` (analog `hourlyRateCents`)
- [ ] La generarea payroll-ului, dacă `payroll_model = 'per_student'`, agregă `COUNT(student_lessons WHERE attendanceStatus = 'present') × rate_per_student_cents` per lecție
- [ ] `breakdown` jsonb include `studentsPresent: N` per lecție pentru transparență
- [ ] UI PayrollPage afișează modelul de tarifare ales per profesor

**De ce acum:** Centrele de dans, muzică, sport plătesc des profesorii în funcție de câți elevi au
venit. Fără acest model, payroll-ul se calculează în Excel separat.

---

### GAP-013: Raport ocupare săli

**Prioritate:** LOW
**Dependențe:** `rooms` (existent — SCHED-501), `lessons` cu `roomId` (existent), `timetable_slots` cu `roomId` (existent — SCHOOL-006)
**Alimentează:** Decizii operaționale (deschidere nouă sală, redistribuire)

**Ce face:** Raport heat-map care arată procentul de ocupare per sală per zi a săptămânii și per
interval orar. Bazat pe `lessons` cu `roomId` și `durationMinutes`, față de numărul total de
minute disponibile pe zi.

**Criterii de acceptare:**
- [ ] `GET /api/analytics/room-occupancy?from=&to=&roomId=` returnează `[{ roomId, roomName, dayOfWeek, occupancyPct }]`
- [ ] Vizualizare heat-map (7 zile × N săli) în ReportsPage sau SchedulePage tab „Săli"
- [ ] Filtrabil pe perioadă și pe sală individuală
- [ ] Calculul ține cont de durata lecțiilor (`durationMinutes`), nu doar de numărul de lecții

**De ce acum:** Centrele cu mai multe săli iau decizii de investiție pe baza ocupării reale.

---

## Grup 5: Funcționalități Operaționale

---

### GAP-005: Rezervă grupă (lista de așteptare)

**Prioritate:** MEDIUM
**Dependențe:** `courses` (existent), `students` (existent), `student_lessons` (existent), COMM-205 notificări (existent)
**Alimentează:** GAP-004 (conversie trial — dacă grupul e plin → rezervă), GAP-010 portal student (vede poziția în lista de așteptare)

**Ce face:** Când o grupă e la capacitate maximă (`maxStudents`), un student poate fi pus în
„rezervă". La eliberarea unui loc, primul din rezervă e notificat și are 48h să confirme înrolarea,
altfel trece locul la al doilea.

**Criterii de acceptare:**
- [ ] Câmp `max_students integer null` adăugat pe `courses` (null = fără limită)
- [ ] Tabel `course_waitlist`: `id`, `tenantId`, `courseId` FK, `studentId` FK, `position integer`, `notifiedAt null`, `confirmedAt null`, `expiresAt null`, timestamps
- [ ] `POST /api/courses/:id/waitlist` → adaugă student în lista de așteptare
- [ ] La eliberarea unui loc, sistemul notifică automat primul pe lista (COMM-205) și setează `expiresAt = now() + 48h`
- [ ] La `confirmedAt` setat, se creează înrolarea normală (`student_lessons`) și poziția e eliminată din waitlist
- [ ] Lista de așteptare per grupă vizibilă în pagina cursului

**De ce acum:** Centrele populare au grupe pline cu liste de așteptare gestionate azi în caiet sau
WhatsApp. Automatizarea este un argument de vânzare direct.

---

### GAP-015: Excursii și tabere ca tip de eveniment

**Prioritate:** LOW
**Dependențe:** `cohorts` / `cohortParticipants` (existent — CX-701), `invoices` (existent — FIN-601), COMM-205 (existent)
**Alimentează:** GAP-010 portal student (vede excursiile înscrise), GAP-011 rapoarte (excursiile ca sursă de venit)

**Ce face:** Extinde modelul de cohorte (CX-701) cu un tip `tour`. O excursie are locuri limitate,
dată plecare/întoarcere, preț per participant, link de înregistrare externă. Înscrierea generează
automat o factură. Nu are profesor și nu intră în payroll.

**Criterii de acceptare:**
- [ ] Câmp `cohort_type enum('course','tour','open_lesson') default 'course'` adăugat pe `cohorts`
- [ ] Câmpuri pentru tip `tour`: `departure_date`, `return_date`, `meeting_point`, `price_per_person_cents`, `max_participants`
- [ ] Înrolarea în excursie generează factură automată (POST /api/invoices intern)
- [ ] Link public de înregistrare `/public/tours/:slug` cu formular fără login
- [ ] Lista excursii vizibilă în CXPage ca tab sau filtru separat

---

### GAP-016: Lecții deschise (Open Lessons) cu înregistrare externă

**Prioritate:** LOW
**Dependențe:** `lessons` sau `cohorts` (existent), COMM-205 (existent), CRM-101 intake web (existent — reutilizează formularul)
**Alimentează:** `leads` (GAP-016 generează un lead nou la fiecare înregistrare externă), GAP-003 lecție trial (o lecție deschisă → propunere trial)

**Ce face:** O lecție cu link public de înregistrare (`/public/events/:slug`). Vizitatorii externi
se înregistrează fără cont — înregistrarea creează automat un lead în CRM cu `source: 'open_lesson'`.
Profesorul vede lista participanților externi + interni.

**Criterii de acceptare:**
- [ ] Câmp `is_open_event boolean default false` și `public_slug varchar` pe `lessons` sau `cohorts`
- [ ] Pagina publică `/public/events/:slug` cu detalii lecție + formular (nume, telefon, email)
- [ ] Înregistrarea externă creează un `lead` cu `source: 'webform'` și interacțiune `type: 'system'` cu `{ origin: 'open_lesson', lesson_id }`
- [ ] Link-ul public e generabil și copiat din SchedulePage sau CXPage
- [ ] Lista participanților (interni + externi) vizibilă pe cardul lecției

---

### GAP-018: Bibliotecă fizică (inventar materiale)

**Prioritate:** LOW
**Dependențe:** `students` (existent), `tenants` (existent)
**Alimentează:** GAP-010 portal student (vede materialele împrumutate), audit log (existent)

**Ce face:** Modul simplu de inventar pentru manuale și materiale fizice: titlu, stoc total/disponibil,
emitere per student (împrumut), returnare, transfer între filiale. Fiecare mișcare e logată în audit.

**Criterii de acceptare:**
- [ ] Tabel `library_items`: `id`, `tenantId`, `title`, `author`, `isbn`, `totalCopies`, `availableCopies`, `locationBranchId null`, timestamps
- [ ] Tabel `library_loans`: `id`, `tenantId`, `itemId` FK, `studentId` FK, `loanedAt`, `dueDate`, `returnedAt null`, timestamps
- [ ] `POST /api/library/loans` → emitere; `PATCH /api/library/loans/:id/return` → returnare
- [ ] `GET /api/library/items?studentId=` → lista materialelor împrumutate de un student
- [ ] Pagină `/app/library` cu tabel inventar + formulare de emitere/returnare
- [ ] Alertă in-app pentru materiale nereturnate la termen

---

## Grup 6: Gamificare & Motivare

---

### GAP-019: Rating profesori (configurat per tenant)

**Prioritate:** LOW
**Dependențe:** `teachers` (existent), `feedback` cu NPS/stele (existent — FEEDBACK-601), `students` (existent)
**Alimentează:** HR-402 teacher-stats (existent — poate adăuga coloana rating mediu), GAP-010 portal student (poate afișa ratingul profesorului)

**Ce face:** După fiecare lecție, sistemul poate trimite o evaluare scurtă (1–5 stele) pentru
profesor. Ratingul mediu apare pe profilul profesorului. Configurat per tenant: activare/dezactivare,
intervalul de trimitere (per lecție / săptămânal / lunar).

**Criterii de acceptare:**
- [ ] Tabel `teacher_ratings`: `id`, `tenantId`, `teacherId` FK, `studentId` FK, `lessonId` FK null, `score smallint(1–5)`, `comment varchar(500) null`, timestamps
- [ ] `GET /api/teachers/:id/rating` returnează `{ avg: 4.2, count: 47, recent: [...] }`
- [ ] Ratingul mediu apare pe TeachersPage și TeacherStatsPage
- [ ] Solicitare rating trimisă prin COMM-205 (opțional, configurat în Settings) la N ore după lecție
- [ ] Tenant poate activa/dezactiva din Settings → HR → Rating profesori

---

### GAP-020: Clasament elevi și sistem de puncte de progres

**Prioritate:** LOW
**Dependențe:** `students` (existent), `student_lessons.attendanceStatus` (existent), `schoolGrades` (existent — SCHOOL-002), COMM-205 (existent)
**Alimentează:** GAP-010 portal student (vede propriul punctaj și clasamentul grupei)

**Ce face:** Elevi câștigă puncte pentru prezență (1 punct/lecție), note mari (bonus), recuperare
completată (bonus). Clasament vizibil per grupă — anonimizat sau cu nume, configurat per tenant.
Scopul: motivarea prezenței și reducerea abandonului timpuriu.

**Criterii de acceptare:**
- [ ] Tabel `student_points`: `id`, `tenantId`, `studentId` FK, `points integer`, `reason enum(attendance/grade/recovery/bonus)`, `refId uuid null`, timestamps
- [ ] La marcarea prezentei `present`, se adaugă automat 1 punct (hook în SCHED-503)
- [ ] `GET /api/students/:id/points?termId=` returnează suma punctelor și istoricul
- [ ] `GET /api/courses/:id/leaderboard` returnează clasamentul studenților din grupă
- [ ] Clasamentul vizibil în portalul student (GAP-010) — anonimizat implicit, opțional cu nume

---

## Tabel de prioritizare

| ID | Titlu | Grup | Prioritate | Dependențe cheie |
|----|-------|------|-----------|-----------------|
| GAP-001 | Slot preferat orar pe lead/student | 1 — Trial & Prezență | **HIGH** | `leads`, `students`, CRM-106 |
| GAP-002 | Potrivire automată grupă | 1 | **HIGH** | GAP-001, `courses`, `availability` |
| GAP-003 | Lecție Trial (tip distinct) | 1 | **HIGH** | `lessons`, `leads`, SCHED-503, GAP-002 |
| GAP-004 | Conversie automată trial → student + înrolare | 1 | **HIGH** | GAP-003, CRM-111, `courses` |
| GAP-009 | Lecție Recuperare (make-up) | 1 | **HIGH** | SCHED-503, `lessons`, GAP-006 |
| GAP-006 | Sold de unități per student (pachete lecții) | 2 — Abonamente | **HIGH** | `students`, `courses`, FIN-601 |
| GAP-007 | Deducere automată sold unități la prezență | 2 | **HIGH** | GAP-006, SCHED-503 |
| GAP-010 | Portal Student self-service | 3 — Portal & Comunicare | **HIGH** | GAP-006, GAP-009, FIN-601 |
| GAP-008 | Auto-billing la epuizare unități | 2 | MEDIUM | GAP-006, FIN-603, COMM-205 |
| GAP-017 | Notificări în cascadă (WA→TG→SMS→Push) | 3 | MEDIUM | COMM-205, `messages` |
| GAP-005 | Rezervă grupă (lista de așteptare) | 5 — Operațional | MEDIUM | `courses`, `students`, COMM-205 |
| GAP-011 | Funnel vizual statusuri lead | 4 — Analytics | MEDIUM | `leads`, `leadInteractions`, CRM-112 |
| GAP-012 | Raport sursă reclamă cu conversie | 4 | MEDIUM | `leads` UTM, `payments` |
| GAP-014 | Salarizare bazată pe prezența efectivă | 4 | MEDIUM | HR-401, SCHED-503, `teachers` |
| GAP-013 | Raport ocupare săli | 4 | LOW | `rooms`, `lessons` |
| GAP-015 | Excursii și tabere ca tip eveniment | 5 | LOW | `cohorts`, FIN-601 |
| GAP-016 | Lecții deschise cu înregistrare externă | 5 | LOW | `lessons`, CRM-101 |
| GAP-018 | Bibliotecă fizică (inventar materiale) | 5 | LOW | `students`, `tenants` |
| GAP-019 | Rating profesori | 6 — Gamificare | LOW | `teachers`, FEEDBACK-601 |
| GAP-020 | Clasament elevi și puncte de progres | 6 | LOW | `students`, SCHED-503 |

---

## Ce NU am inclus (există deja în Vector Learn)

- Prezență per lecție → `student_lessons.attendanceStatus` (SCHED-503, existent)
- Abonamente bănești recurente → `subscriptions` (FIN-603, existent)
- Portal părinte pentru elevi de școală → `ParentPortalPage` (SCHOOL-007, existent)
- Conversie lead → student → `POST /api/leads/:id/convert` (CRM-111, existent)
- Payroll profesori tarif orar → `payrollEntries` (HR-401, existent)
- Notificări cu coadă → `notifications` + COMM-205 (existent)
- Import CSV leads/studenți → CRM-103, CRM-150 (existent)
- Cohorte/cursuri cu participanți → CX-701..704 (existent)
- Gradebook/raport card → SCHOOL-002 (existent)
- Admitere cu dosar → SCHOOL-005 (existent)

---

*Document generat: 2026-06-01
Surse: hollihop-functions.md, server/db/schema/, src/pages/app/, backlog/BACKLOG.md*
