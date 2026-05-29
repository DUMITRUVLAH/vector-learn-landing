# Students — User Stories

## US-STU-01: Listă elevi cu paginare
**As a** Recepționer, **I want to** văd lista elevilor activi, **so that** identific rapid pe cine îmi cere telefon.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Tabel cu nume + contact + status + acțiuni
  - [x] Paginare (limit 100 default)
  - [x] Sortare după created_at desc

## US-STU-02: Creare elev nou
**As a** Recepționer, **I want to** adaug un elev nou cu detaliile părintelui, **so that** îl pot înrola în grupă.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Drawer side cu form complet
  - [x] Validare Zod
  - [x] Toast confirmare

## US-STU-03: Editare profil elev
**As a** Manager, **I want to** modific datele unui elev, **so that** corectez greșeli sau actualizez contact.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Click pe edit → drawer cu valori pre-completate
  - [x] PATCH partial
  - [x] Toast modificări salvate

## US-STU-04: Arhivare elev (soft delete)
**As a** Manager, **I want to** arhivez un elev care nu mai vine, **so that** îl scot din liste active dar păstrez istoricul.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Confirm dialog
  - [x] Status → "archived"
  - [x] Nu apare în filtrele active

## US-STU-05: Search live după nume/telefon/email
**As a** Recepționer, **I want to** caut un elev tastând în search box, **so that** îl găsesc instant.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Search input cu debounce 250ms
  - [x] Caută în fullName, email, phone, parentEmail, parentPhone

## US-STU-06: Filter pe status
**As a** Manager, **I want to** filtrez doar elevii cu status "Trial", **so that** focusez follow-up-ul.
- **Status**: done ✅ (MVP-004)
- **Priority**: P0
- **Acceptance**:
  - [x] Chips: All / Active / Trial / Paused / Archived

## US-STU-07: Import CSV/Excel
**As an** Admin, **I want to** import 200 de elevi dintr-un Excel, **so that** migrez rapid din sistemul vechi.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Upload .xlsx sau .csv
  - [ ] Preview cu mapping coloane → câmpuri DB
  - [ ] Detectare duplicate (phone normalized)
  - [ ] Dry-run cu count valid/invalid
  - [ ] Import în background (job queue)
  - [ ] Raport: x imported, y skipped (duplicate), z errors

## US-STU-08: Export elevi în Excel
**As a** Manager, **I want to** export lista elevilor filtrată, **so that** trimit contabilului pentru emiterea contractelor.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] Buton "Export Excel" pe lista filtrată
  - [ ] Doar coloanele vizibile
  - [ ] Streaming (nu blochează UI pentru 1000+ rânduri)

## US-STU-09: Profil detaliat elev (page)
**As a** Manager, **I want to** văd profilul complet al unui elev pe o pagină dedicată, **so that** am toate informațiile într-un singur loc.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] /app/students/:id cu:
    - [ ] Date personale + contact părinte
    - [ ] Cursuri înscrise (lista grupelor)
    - [ ] Istoric lecții (cu prezență)
    - [ ] Plăți istoric + curent
    - [ ] Note interne timeline (cu autor)
    - [ ] Lead-ul de origine (dacă există)

## US-STU-10: Înrolare în curs/grupă
**As a** Manager, **I want to** asignez un elev la o grupă/curs, **so that** apare în lista lecțiilor profesorului.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] În profil elev: dropdown "Adaugă la grupă"
  - [ ] Listă grupe active cu nr. locuri rămase
  - [ ] Auto-creează plata pe baza pricing-ului cursului
  - [ ] Notificare automată părinte cu detalii grupă

## US-STU-11: Transfer între grupe
**As a** Manager, **I want to** mut un elev din "Grupa B2-A" în "Grupa B2-B", **so that** rezolv conflict de orar.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Buton "Transferă" în profil
  - [ ] Selectare grupă destinație + dată efectivă
  - [ ] Notificare automat părinte
  - [ ] Audit log

## US-STU-12: Tag-uri custom pe elev
**As a** Manager, **I want to** adaug tag-uri ("VIP", "atenție specială") pe elevi, **so that** segmentez fără să-mi inventez status-uri.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Tabel `student_tags` (m2m)
  - [ ] UI tag selector cu autocomplete
  - [ ] Filter pe tag în listă
  - [ ] Maxim 10 tag-uri/elev

## US-STU-13: Note timeline cu autor
**As a** Profesor, **I want to** las o notă pe profilul elevului ("Are dificultate cu past perfect"), **so that** următorul prof o vede.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Reuse `lead_interactions` cu type="note" sau tabel nou `student_notes`
  - [ ] Body + author + timestamp
  - [ ] Vizibil pe profil în timeline
  - [ ] Filter "doar notele mele" pentru profesori

## US-STU-14: Link la părinte (cont separat)
**As a** Parent, **I want to** îmi creez cont separat de elev, **so that** primesc notificările administrative direct.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Invitație cu link unique
  - [ ] Cont parent legat de unul sau mai mulți elevi (frați)
  - [ ] Vede orar + plăți + progress, NU note interne profesor

## US-STU-15: Birthday reminder
**As a** Manager, **I want to** sistemul îmi trimite alert cu o săptămână înainte de ziua elevului, **so that** trimit mesaj de felicitare.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Cron zilnic 09:00 caută birthDate în următoarele 7 zile
  - [ ] Notificare push manager
  - [ ] Template WhatsApp pre-completat

## US-STU-16: Detectare duplicate la creare
**As a** Recepționer, **I want to** sistemul îmi spune dacă elevul există deja când îl creez, **so that** nu creez duplicate.
- **Status**: backlog
- **Priority**: P0
- **Acceptance**:
  - [ ] La typing fullName + phone, query live pentru match
  - [ ] Modal "Există deja Maria Popescu (același telefon). Folosești profilul existent?"
  - [ ] Match pe phone normalized

## US-STU-17: Foto profil elev
**As a** Recepționer, **I want to** atașez o poză la profilul elevului, **so that** o recunosc la recepție.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Upload imagine (resize 256×256)
  - [ ] Storage S3/Supabase
  - [ ] GDPR: consent explicit părinte pentru copil

## US-STU-18: Lista absențelor pe ultimele 30 zile
**As a** Manager, **I want to** văd top 10 elevi cu cele mai multe absențe, **so that** intervin preventiv.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Widget pe dashboard sau /app/students/at-risk
  - [ ] Query JOIN students + student_lessons cu status='absent'
  - [ ] Sortare desc count absențe

## US-STU-19: Mass action (bulk archive/tag)
**As a** Manager, **I want to** select 50 de elevi și să-i arhivez deodată, **so that** curăț baza la finalul anului.
- **Status**: backlog
- **Priority**: P1
- **Acceptance**:
  - [ ] Checkbox pe fiecare rând + select all
  - [ ] Bar de bulk actions sticky
  - [ ] Confirm dialog cu count
  - [ ] Audit log per item afectat

## US-STU-20: Search avansat cu operators
**As a** power user, **I want to** caut `status:trial age:>13`, **so that** găsesc rapid segmente specifice.
- **Status**: backlog
- **Priority**: P2
- **Acceptance**:
  - [ ] Parser pentru operators: status:, age:, course:, tag:
  - [ ] Highlight în input cu colorare per operator
  - [ ] Documentat în tooltip
