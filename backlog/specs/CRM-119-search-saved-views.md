---
id: CRM-119
slug: search-saved-views
depends_on: [CRM-117]
phase: G
milestone: CRM
---

# CRM-119 — Căutare globală + Vizualizări salvate (Saved Views)

## Goal

Permite utilizatorilor să salveze combinații de filtre ca "Vizualizări" denumite (ex: "Leaduri mele necontactate", "Facebook overdue"), să comute rapid între ele, și să beneficieze de o căutare globală mai puternică pe pipeline (server-side search pe toate câmpurile relevante: nume, telefon, email, curs, companie, tag-uri).

## User stories

- **US-CRM-119-1**: Ca vânzător, vreau să salvez combinația curentă de filtre (sursă + responsabil + search + task signal) ca "Vizualizare" cu un nume, ca să o pot reactiva cu un click.
- **US-CRM-119-2**: Ca manager, vreau să văd vizualizările create de toți membrii echipei (sau să le fac publice/private), ca să standardizez fluxul.
- **US-CRM-119-3**: Ca utilizator, vreau să șterg sau redenumesc vizualizările mele, ca să mențin lista curată.
- **US-CRM-119-4**: Ca utilizator, vreau ca search-ul să caute și în `company`, `interest_course`, `deal_name`, nu doar `full_name`/`phone`.

## Acceptance criteria

1. **Salvare vizualizare**: Buton "Salvează filtrul" în bara de filtre (apare când e activ cel puțin un filtru) → modal cu câmp "Nume vizualizare" → POST salveazá în `saved_views` tabelul.
2. **Listare vizualizări**: Dropdown "Vizualizări" în bara de filtre care listează vizualizările tenant-ului (user_id sau `is_public=true`).
3. **Activare vizualizare**: Click pe o vizualizare din dropdown → aplică filtrele ei instant (client-side setState).
4. **Ștergere vizualizare**: Buton X lângă fiecare vizualizare în dropdown → DELETE `/api/saved-views/:id` (numai own views sau owner/manager).
5. **Căutare extinsă**: Server-side `GET /api/leads?search=X` caută și în `email_normalized`, `company`, `interest_course`, `deal_name` (ILIKE pe toate).
6. **UI client-side search** (în `LeadsPage`): când `searchQuery` se schimbă, filtrarea se face și client-side pentru câmpurile `company`, `interestCourse`, `dealName` pe lângă `fullName`/`phone`.
7. **Schema DB**: tabel `saved_views` (`id`, `tenant_id`, `user_id`, `name`, `filters` JSONB, `is_public` boolean, `created_at`).
8. **Migration**: `npm run db:generate` generează migrația pentru `saved_views`; `npm run db:reset && npm run db:seed` trece cu succes.
9. **API smoke**: `GET /api/saved-views` → 200 cu `{ views: [] }` după login.
10. **A11y**: dropdown vizualizări are role="listbox" sau e un `<select>`/`<menu>` accesibil; toate butoanele au aria-label.
11. **Dark mode**: componenta funcționează în light + dark fără culori hardcodate.
12. **Multi-tenant**: vizualizările sunt scoped pe `tenant_id`; nu se poate vedea cross-tenant.

## Files

### New
- `server/db/schema/saved-views.ts` — schema tabel `saved_views`
- `server/routes/saved-views.ts` — GET/POST/DELETE `/api/saved-views`
- `src/lib/api/savedViews.ts` — client API helper
- `src/components/crm/SavedViewsDropdown.tsx` — dropdown vizualizări
- `src/__tests__/crm/saved-views.test.tsx` — unit tests

### Modified
- `server/db/schema/index.ts` — re-export `savedViews`
- `server/index.ts` — mount `/api/saved-views` routes
- `server/routes/leads.ts` — extend search to cover `company`/`interest_course`/`deal_name`
- `src/pages/app/LeadsPage.tsx` — integrate SavedViewsDropdown + extend client-side search
- `backlog/crm/TEST-SCENARIOS.md` — append CRM-119 scenarios

## Tests (Given/When/Then)

- **T-CRM-119-1** `[blocant]` Given filtre active (sursă=Facebook), When apăs "Salvează filtrul" și introduc un nume, Then vizualizarea apare în dropdown și o pot reactiva.
- **T-CRM-119-2** `[blocant]` Given o vizualizare salvată, When apăs X, Then e ștearsă și nu mai apare în dropdown.
- **T-CRM-119-3** `[blocant]` Given search "Popescu", Then filtrarea returnează leaduri care au "Popescu" în `fullName` sau `company` sau `dealName`.
- **T-CRM-119-4** `[blocant]` Given `GET /api/saved-views` autenticat, Then răspuns 200 `{ views: [] }` (sau lista).
- **T-CRM-119-5** Multi-tenant: vizualizările tenantului A nu sunt vizibile din tenantul B.

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verzi
- [ ] Migration gate: `db:generate` fără uncommitted diff, `db:reset && db:seed` trece
- [ ] API smoke: login + GET /api/saved-views → 200
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
