# Audit integrare inter-module — Vector Learn
**Data:** 2026-06-01  
**Solicitare:** Owner — module nu comunică între ele (CX fără course ID unic, forms + cohorts deconectate, date fragmentate)

---

## Rezultat general

Aplicația are infrastructură intra-modul solidă (CRM→Students conversia funcționează; cohort→course FK există; branches parțial implementate), dar are **9 rupturi majore** la granițele dintre module — cel mai critic: 4 pagini de analytics se blochează la orice încărcare deoarece endpoint-urile server nu există.

---

## INVENTAR MODULE

| Modul | Schema | Route | Pagină frontend |
|---|---|---|---|
| CRM / Leads | `server/db/schema/leads.ts` | `server/routes/leads.ts` | `LeadCardPage.tsx`, `LeadsPage.tsx` |
| Students | `server/db/schema/students.ts` | `server/routes/students.ts` | `StudentsPage.tsx` |
| Courses | `server/db/schema/courses.ts` | `server/routes/courses.ts` | via `SchedulePage.tsx` |
| CX / Cohorts | `server/db/schema/cohorts.ts` | `server/routes/cohorts.ts` | `CXPage.tsx` |
| CX / CohortParticipants | `server/db/schema/cohortParticipants.ts` | `server/routes/cohortParticipants.ts` | `CXPage.tsx` |
| Forms | `server/db/schema/forms.ts` | `server/routes/forms.ts`, `publicForms.ts` | `FormsPage.tsx`, `FormBuilderPage.tsx` |
| Feedback | `server/db/schema/feedback.ts` | `server/routes/feedback.ts` | `FeedbackPage.tsx` |
| Invoices | `server/db/schema/invoices.ts` | `server/routes/invoices.ts` | `InvoicesPage.tsx` |
| Payments | `server/db/schema/payments.ts` | `server/routes/payments.ts` | `PaymentsPage.tsx` |
| Contracts | `server/db/schema/contracts.ts` | `server/routes/contracts.ts` | `ContractsPage.tsx` |
| Analytics | `server/db/schema/analytics.ts` | `server/routes/analytics.ts` | 4 pagini cu endpoints lipsă |

---

## FOREIGN KEYS LIPSĂ

| # | Tabel | Coloana lipsă | Referință | Impact |
|---|---|---|---|---|
| GAP-1 | `leads` | `courseId uuid` | `courses(id)` | "Curs de interes" = text liber, nu entitate reală |
| GAP-2 | `leads` | `branchId uuid` | `branches(id)` | Leads nevăzute per filială |
| GAP-3 | `forms` | `courseId uuid` | `courses(id)` | Form nu poate fi asociat unui curs |
| GAP-4 | `payments` | `courseId uuid` | `courses(id)` | Revenue-by-course imposibil |
| GAP-5 | `invoices` | `courseId uuid` | `courses(id)` | Revenue-by-course imposibil |
| GAP-6 | `cohorts` | `branchId uuid` | `branches(id)` | Cohortele nu filtrează per filială |
| GAP-7 | `contracts` | `courseId uuid` | `courses(id)` | Cursul contractului = text liber |
| GAP-8 | `feedback_forms` | `courseId uuid` | `courses(id)` | Feedback nu e legat de curs |
| GAP-9 | `feedback_invitations` | `cohortId uuid` | `cohorts(id)` | Invitații nu sunt legate de cohortă |

---

## ENDPOINT-URI API LIPSĂ (P0 — paginile se blochează acum)

Clientul frontend declară și apelează aceste endpoint-uri care NU există în server:

| Endpoint | Apelat de | Locație client |
|---|---|---|
| `GET /api/analytics/kpi?period=` | `KpiDashboardPage.tsx` | `src/lib/api/analytics.ts:114` |
| `GET /api/analytics/revenue-over-time?months=` | `RevenueChartsPage.tsx` | `src/lib/api/analytics.ts:132` |
| `GET /api/analytics/revenue-by-course` | `RevenueChartsPage.tsx` | `src/lib/api/analytics.ts:136` |
| `GET /api/analytics/student-ltv?limit=` | `StudentRetentionPage.tsx` | `src/lib/api/analytics.ts:152` |

Toate returnează 404 → toate paginile arată stare de eroare permanent.

---

## GOLURI DE CONECTARE UI

| # | Locație | Problemă |
|---|---|---|
| GAP-F | `LeadCardPage.tsx:872` | "Curs de interes" = `<input type="text">`, nu selector de curs |
| GAP-G | `ContractsPage.tsx:555` | Câmpul "Cursul" = `<input type="text">`, nu selector de curs |
| GAP-H | `CXPage.tsx:99` | Export CSV folosește `selectedCohort.label` ca `courseName`, nu `courses.name` real |
| GAP-I | `ParticipantTable.tsx` | Participanți cu `studentId` nu au link navigabil spre profilul studentului |
| GAP-J | `FormBuilderPage.tsx:76` | Mapping "Curs dorit" produce text liber, nu course ID |
| GAP-K | Conversia lead→student (`leads.ts:735`) | `convertLeadSchema` nu acceptă `cohortId` → studentul nou nu e înscris în cohortă |

---

## LISTA PRIORITIZATĂ DE REPARAȚII

### P0 — Blocat acum (pagini rupte)
1. Implementează 4 endpoint-uri analytics lipsă (`/kpi`, `/revenue-over-time`, `/revenue-by-course`, `/student-ltv`)

### P1 — Integrare seam ruptă
2. `leads.courseId` FK + picker în LeadCard + `leads.branchId` FK + branch filter
3. `payments.courseId` + `invoices.courseId` FK → enablează revenue-by-course
4. `cohorts.branchId` FK + `withBranchFilter` în cohorts route

### P2 — UX cross-module deconectat
5. Lead→cohort auto-enroll la conversie
6. ContractsPage: curs picker real (contracts.courseId FK)
7. CX: course name real în export + link participant→student

---

## Module generate: INTEG-faza-1 (INTEG-101..104) și INTEG-faza-2 (INTEG-201..203)
