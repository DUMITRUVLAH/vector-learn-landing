---
id: VM1-04
title: "Evenimente legate de proiect — tabel parEvents + eventId pe cerere"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/VM1-04-events.md
core: backlog/par/PAR-CORE.md
---

## Goal

Cererile PAR pot fi atribuite unui eveniment, iar evenimentul aparține unui proiect (Proiect → Eveniment).
Se adaugă un tabel nou `parEvents` (oglindind `parProjects`) și un `eventId` (nullable FK) pe `parRequests`.
În formularul de creare apare un dropdown „Eveniment" FILTRAT după proiectul selectat. Evenimentul apare
pe detaliu/PDF/email și devine criteriu de filtrare/grupare în dashboard și rapoarte. Atenție la disciplina
de migrări (prefix > max pe origin/main, migrare commit-uită, `db:reset`+`db:seed`, schema-drift).

## User stories

- **Ca** requestor, **vreau** să leg cererea de un eveniment al proiectului, **pentru că** bugetăm pe
  evenimente (conferințe, tabere, training-uri).
- **Ca** finance, **vreau** să filtrez/grupez cererile pe eveniment, **pentru că** raportăm cheltuielile
  pe fiecare eveniment către donor.
- **Ca** par_admin, **vreau** să administrez evenimentele unui proiect, **pentru că** ele se schimbă de la
  un ciclu la altul.

## Acceptance criteria

- [ ] Tabel nou `parEvents` în `server/db/schema/par.ts`: `id`, `tenantId`, `projectId` (nullable FK → `parProjects`), `name`, `startsAt?`, `endsAt?`, `active` (default true), timestamps
- [ ] `eventId` (nullable FK → `parEvents`) adăugat pe `parRequests`
- [ ] Migrare nouă în `./drizzle` cu prefix STRICT > max prefix de pe origin/main; `--> statement-breakpoint` între statement-uri dacă sunt mai multe
- [ ] Dacă `parEvents` ajunge în fișier nou de schemă, `export * from "./..."` adăugat în `server/db/schema/index.ts` în ACELAȘI commit (altfel `db.query.parEvents` e `undefined` → 500); aici stă în `par.ts`, deci index-ul deja acoperă
- [ ] Coloana `eventId` declarată ȘI în schemă ȘI în migrare (match bidirecțional, fără schema-drift)
- [ ] CRUD evenimente în `ParAdmin` (creare/editare/dezactivare), tenant-scoped, doar par_admin
- [ ] Dropdown „Eveniment" în `ParCreateForm.tsx` filtrat după proiectul selectat (gol/disabled până se alege proiectul)
- [ ] Evenimentul apare pe pagina de detaliu, pe PDF și în email-ul de cerere
- [ ] Filtru + grupare după eveniment în `ParDashboard.tsx` și `ParReports.tsx`
- [ ] `npm run db:generate` nu lasă migrare necomis; `db:reset` + `db:seed` trec

## Files

**New:**
- `drizzle/XXXX_par_events.sql` (+ snapshot/meta journal aferent)
- `server/routes/parEvents.ts` (CRUD evenimente)
- teste `server/routes/__tests__/par-events.test.ts`

**Modified:**
- `server/db/schema/par.ts` — tabel `parEvents` + `eventId` pe `parRequests`
- `server/app.ts` — mount route nou
- `src/pages/par/ParAdmin.tsx` — CRUD evenimente
- `src/pages/par/ParCreateForm.tsx` — dropdown „Eveniment" filtrat pe proiect
- `src/pages/par/ParDashboard.tsx` + `src/pages/par/ParReports.tsx` — filtru/grupare pe eveniment

## Tests

- **T-VM1-04-1** [blocant] Given un proiect cu 2 evenimente, When deschid `ParCreateForm` și aleg proiectul, Then dropdown-ul „Eveniment" arată DOAR cele 2 evenimente ale lui
- **T-VM1-04-2** [blocant] Given migrarea aplicată, When `db:reset` + `db:seed`, Then trec fără eroare și `eventId` există pe `parRequests`
- **T-VM1-04-3** [blocant] Live API smoke: login + creare cerere cu `eventId` → 200, iar GET detaliu întoarce evenimentul
- **T-VM1-04-4** [normal] Given cereri cu și fără eveniment, When raport grupat pe eveniment, Then apare și bucket „Fără eveniment"

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
