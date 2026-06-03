# CX flow: Vector Learn vs Lovable (`copy-roas`)

Analiză comparativă a modelului **cohorte ↔ CX ↔ feedback** între repo-ul Lovable
(`github.com/DUMITRUVLAH/copy-roas`, Vite + Supabase) și CX-ul nostru. Cerută de owner:
„vezi legăturile dintre cohorte/CX, cum sunt organizate feedbackurile și legate între ele,
compară cu al nostru că nu-i niciun flow corect".

Data: 2026-06-03.

---

## 1. Cum leagă Lovable lucrurile (modelul lor)

**Cheia: totul se leagă prin perechea de text `(course_name, edition)`, NU prin foreign keys.**
Fiecare tabel CX/feedback/cost poartă coloanele `course_name` + `edition` ca string-uri libere.

Tabele relevante (din `src/integrations/supabase/types.ts`):

| Tabel | Rol | Legătură |
|---|---|---|
| `course_edition_costs` | „ediția" = cohorta (start_date, ore, schedule, mentor/room cost, drive URL) | `(course_name, edition)` |
| `course_edition_budgets` | buget proiectat + venit așteptat (break-even) | `(course_name, edition)` |
| `cx_manual_participants` | participanți (nume, email, phone, **payment_status**, whatsapp_joined) | `(course_name, edition)` |
| `cx_tasks` | task-uri de lifecycle per ediție (`task_type`, `is_completed`, `completed_at`) | `(course_name, edition)` |
| `scheduled_feedback` | feedback programat (`feedback_type`, `scheduled_date/time`, `status`, `sent_at`) | `(course_name, edition)` + `form_id` |
| `feedback_forms` | formular global SAU per-ediție (`form_type: initial\|middle\|final`) | opțional `(course_name, edition)` |
| `feedback_invitations` | o invitație = (form × participant email), token public, `status`, `opened_at` | `form_id`, `(course_name, edition)` |
| `feedback_responses` | răspuns trimis | `invitation_id`, `form_id` |

### Flow-ul lor (motorul CX — `src/hooks/useCXTasks.ts` + `CX.tsx`)

Fiecare cohortă **auto-generează o secvență de task-uri datate**, calculate din `start_date`
+ orarul ediției:

```
Sala rezervată → Trimis onboarding → Verificat WhatsApp/Telegram
   → Feedback INIȚIAL → Feedback MIJLOC → Feedback FINAL
   → Pregătire diplome → Trimitere diplome
```

- Task-urile de feedback (`feedback_initial / feedback_mid / feedback_final`) deschid
  `FeedbackReviewDialog`, care: găsește template-ul global pentru tipul respectiv →
  **programează** trimiterea (`scheduled_feedback`, status `pending`→`sent`) → marchează task-ul
  complet. (`TASK_TO_FORM_TYPE` mapează task → `form_type`.)
- `ScheduledFeedbackLog` arată ce feedback e programat/trimis per ediție.
- `ReassignParticipantDialog` mută un participant între cohorte literalmente cu
  `.update({ course_name, edition })`.
- CX.tsx grupează pe tab-uri active/upcoming/past, cu tabele paid/free/pending și export CSV.

**Pe scurt:** feedback-ul lor e **per-cohortă, lifecycle-driven (3 momente), programat și urmărit**,
iar CX e un motor de task-uri pe toată durata de viață a ediției.

---

## 2. Cum arată CX-ul nostru (Vector Learn)

Avem un model **mai curat relațional**, dar **fără flow de lifecycle/feedback**.

- `cohorts` → FK real la `courses` (`course_id`), `cohort_participants` → FK la `cohorts`
  (`cohort_id`) + opțional `students` (`student_id`). Sursă: `crm` | `manual`. Payment status enum
  oglindește copy-roas. ✅ **Legături prin FK reale, multi-tenant safe — superior structural.**
- `CXPage`: board cohorte (active/viitoare/trecute), 3 tabele participanți, progres, break-even,
  export CSV. ✅ Paritate bună pe partea de *board + participanți + break-even*.
- **`feedback_*`**: există un modul de feedback, dar:
  - `feedback_invitations` → **doar `students`**, NU are `cohort_id`/`edition`.
  - **ZERO** `form_type` (initial/middle/final). Feedback-ul e atemporal.
  - **ZERO** `scheduled_feedback` — nu se poate programa nimic.
  - **ZERO** motor de `cx_tasks` / lifecycle. Nimic nu auto-generează task-uri per cohortă.

---

## 3. Unde „nu-i niciun flow corect" (gap-urile reale)

| Capabilitate | Lovable | Noi | Verdict |
|---|---|---|---|
| Legătură cohortă ↔ participant | string `(course,edition)` | **FK real** | **noi mai bine** |
| Feedback legat de cohortă | da (`course_name,edition`) | **NU (doar student)** | **GAP** |
| Feedback pe lifecycle (initial/mid/final) | da (`form_type`) | **NU** | **GAP** |
| Programare feedback (`scheduled_feedback`) | da, pending→sent | **NU** | **GAP** |
| Motor task-uri CX per cohortă | da (`cx_tasks`, auto-datate) | **NU** | **GAP** |
| Review→schedule→track loop | da (`FeedbackReviewDialog`) | **NU** | **GAP** |
| Buget/cost per ediție | da | da (break-even) | paritate |
| Multi-tenant izolare | slabă (string match) | **FK + tenant_id** | **noi mai bine** |

**Concluzie:** structura noastră de date e mai sănătoasă (FK + tenant), dar ne lipsește **tot
flow-ul operațional de CX**: lifecycle de task-uri per cohortă și feedback programat la 3 momente,
legat de cohortă. La ei „flow-ul" e exact acest motor; la noi e doar un board static.

---

## 4. Plan de fix propus (păstrând FK-urile noastre, adoptând flow-ul lor)

1. **Leagă feedback de cohortă:** adaugă `cohortId` (FK) pe `feedback_invitations` și
   `feedback_forms` (nu string `edition` — folosim FK ca peste tot la noi). Migrare + index.
2. **Lifecycle de formular:** adaugă `formType` enum `initial | middle | final` pe `feedback_forms`.
3. **`scheduled_feedback`:** tabel nou (FK `cohortId`, `formId`, `scheduledAt`, `status`,
   `sentAt`) + worker care trimite la dată.
4. **Motor `cx_tasks`:** tabel `cohort_tasks` (FK `cohortId`, `taskType`, `dueAt` calculat din
   `startDate`+orar, `isCompleted`) + generator (port din `useCXTasks.ts`), surfacing în `CXPage`.
5. **Review loop:** dialog care, din task-ul de feedback, programează trimiterea și marchează
   task-ul — exact ca `FeedbackReviewDialog`, dar pe FK-urile noastre.
6. **Agregare feedback per cohortă:** scor mediu/NPS pe cohortă (acum imposibil — feedback-ul nu
   știe de cohortă).

> Item-uri de backlog sugerate: `CX-FEEDBACK-LINK`, `CX-LIFECYCLE-FORMS`, `CX-SCHEDULED-FEEDBACK`,
> `CX-TASK-ENGINE`, `CX-FEEDBACK-REVIEW-LOOP`, `CX-COHORT-FEEDBACK-SCORES`. (Treci prin backlog-critic.)
