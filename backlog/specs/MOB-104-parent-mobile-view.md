---
id: MOB-104
title: Parent mobile view — balance, invoices, 1:1 chat
milestone: MOB
phase: "1"
status: pending
priority: P0
depends_on: [MOB-103, PAY-001]
spec: backlog/specs/MOB-104-parent-mobile-view.md
---

## Goal

Parents get their own mobile-optimized view (`/m/parent`). They see their child's upcoming
lessons, current balance (outstanding invoices), can download invoice PDFs, and can chat 1:1
with the teacher (threaded, quiet-hours respected).

---

## User stories

- **Ca Părinte**, vreau să văd balanța curentă (cât datorez), pentru că știu dacă trebuie să plătesc.
- **Ca Părinte**, vreau să descarc factura PDF direct din app, pentru că o trimit la contabil.
- **Ca Părinte**, vreau să văd orarul copilului meu, pentru că îl duc la timp la lecție.
- **Ca Părinte**, vreau să chat cu profesorul, pentru că pun o întrebare fără să sun.

---

## Acceptance criteria

1. Route `/m/parent` — authenticated, role=parent. Shows child's info (name, enrolled course).
   If user has role=student or admin → redirect to `/m/dashboard` or `/app`.
2. Balance card: total outstanding invoices for the linked student.
   API `GET /api/m/parent/balance` → `{ student, outstandingTotal, invoices[{id, amount, dueDate, status, pdfUrl}] }`.
3. Invoice download: link to existing `/api/invoices/:id/pdf` endpoint (from PAY-001).
4. Upcoming lessons card — next 3 lessons of the linked student.
5. DB: new table `parent_student_links` with columns:
   `id UUID PK`, `tenant_id UUID FK`, `parent_user_id UUID FK users(id)`,
   `student_id UUID FK students(id)`, `created_at TIMESTAMPTZ DEFAULT now()`.
   Admin UI: `/app/students/:id` gets a "Linkuiește un Cont Părinte" section to associate parent users.
6. Chat 1:1 (`/m/chat/:teacherId`):
   - DB: new table `direct_messages` with columns:
     `id UUID PK`, `tenant_id UUID FK`, `from_user_id UUID FK`, `to_user_id UUID FK`,
     `body TEXT NOT NULL`, `sent_at TIMESTAMPTZ DEFAULT now()`, `read_at TIMESTAMPTZ`.
   - API `GET /api/m/chat/:teacherId` → conversation thread (array of messages).
   - API `POST /api/m/chat/:teacherId` → send message.
   - Quiet hours from teacher's `SET-805` notification preference; if outside → message queued, not sent.
7. Migration `0039_mob104_parent_links_chat.sql` committed.
8. `db:reset && db:seed` succeeds.
9. Unit tests for parent dashboard render + balance API.

---

## Files

- `server/db/schema/parentLinks.ts` — new
- `server/db/schema/directMessages.ts` — new
- `server/db/schema/index.ts` — export both
- `drizzle/0039_mob104_parent_links_chat.sql` — new migration
- `server/routes/mobile.ts` — parent balance, upcoming lessons, chat endpoints
- `src/pages/app/mobile/ParentDashboardPage.tsx` — new
- `src/pages/app/mobile/ChatPage.tsx` — new
- `src/pages/app/mobile/ParentDashboardPage.test.tsx` — new
- router — `/m/parent`, `/m/chat/:teacherId`

---

## Tests

- **T-MOB-104-1** `[blocant]` Given migration applied, When `db:reset && db:seed`, Then succeeds.
- **T-MOB-104-2** `[blocant]` Given parent token with linked student, When GET `/api/m/parent/balance`, Then 200 with `{outstandingTotal, invoices}`.
- **T-MOB-104-3** `[blocant]` Given parent token, When POST `/api/m/chat/:teacherId` with `{body:"Bună ziua"}`, Then 201 message created.
- **T-MOB-104-4** `[normal]` Given `ParentDashboardPage` rendered with mock data, When mounts, Then shows balance card and upcoming lessons.
- **T-MOB-104-5** `[normal]` Given parent without linked student, When `/m/parent` loaded, Then shows "Niciun elev asociat" empty state.

---

## Definition of Done

- [ ] `parent_student_links`, `direct_messages` tables migrated
- [ ] `/m/parent` and `/m/chat/:teacherId` routes working
- [ ] Balance API returns correct data
- [ ] All T-MOB-104-* green
- [ ] Migration gate green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/MOB-faza-1-student-pwa`
