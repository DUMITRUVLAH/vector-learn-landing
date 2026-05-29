# User Stories — Vector Learn

> 14 module × ~20 user stories = ~280 stories pentru implementare iterativă.
>
> Format per story:
> ```
> ## US-{MODULE}-{NN}: <one-line summary>
> **As a** [role], **I want to** [action], **so that** [benefit].
>
> - **Status**: done ✅ | in_progress | backlog | idea
> - **Priority**: P0 (must) | P1 (should) | P2 (nice)
> - **Acceptance**:
>   - [ ] criterion 1
>   - [ ] criterion 2
> - **Notes**: technical context, dependencies
> ```

## Module index

| Module | File | Done / Total |
|---|---|---|
| Auth & Users | [auth.md](auth.md) | 3 / 20 |
| Students | [students.md](students.md) | 6 / 20 |
| Schedule & Lessons | [schedule.md](schedule.md) | 4 / 20 |
| Teachers & HR | [hr.md](hr.md) | 1 / 20 |
| Courses | [courses.md](courses.md) | 3 / 20 |
| Payments | [payments.md](payments.md) | 4 / 20 |
| CRM & Leads | [crm.md](crm.md) | 7 / 20 |
| Comunicare | [comunicare.md](comunicare.md) | 0 / 20 |
| Mobile App | [mobile.md](mobile.md) | 0 / 20 |
| Rapoarte | [rapoarte.md](rapoarte.md) | 0 / 20 |
| Multi-filiale | [multifilale.md](multifilale.md) | 0 / 20 |
| Integrări | [integrari.md](integrari.md) | 0 / 20 |
| AI Assistant | [ai.md](ai.md) | 0 / 20 |
| Settings & Admin | [settings.md](settings.md) | 0 / 20 |

**Total: 28 done / 280 stories** (cele 28 livrate în M1+M2+M3 landing + MVP-001..009)

## Roluri standard (referite în stories)

- **Owner** — fondator/CEO al centrului, plătește abonamentul Vector Learn
- **Admin** — acces complet în sistem, gestionează echipa
- **Manager** — conduce operațional o filială
- **Recepționer** — front-office, leaduri, plăți
- **Teacher** — profesor
- **Student** — elevul
- **Parent** — părintele
- **Anonymous** — vizitator pe site, nu logat
- **System** — automated/cron jobs

## Priorități

- **P0** = blocant pentru go-live, trebuie să existe în MVP
- **P1** = important după go-live, în primele 3 luni post-launch
- **P2** = nice-to-have, când avem timp și budget

## Workflow

1. Tu/echipa schimbi status: `backlog` → `in_progress` → `done`
2. Story-urile cu status `done` au PR/commit referit în Notes
3. Story-urile noi se adaugă la sfârșit cu numerotare următoare disponibilă
4. Update README counter pe măsură ce avansezi
