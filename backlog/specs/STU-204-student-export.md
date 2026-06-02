---
id: STU-204
title: "Export elevi în CSV/Excel (lista filtrată)"
milestone: STUDENTS
phase: 2
status: pending
depends_on: [STU-203]
slug: student-export
---

## Goal

Buton "Export" pe pagina `/app/students` care descarcă lista curentă (cu filtrele active) în format
CSV. Streaming pentru liste mari (nu blochează UI). Scopul: managerul exportă lista elevilor activi
pentru contabilitate, avize medicale, sau comunicare de masă.

**Reuse obligatoriu:**
- Filtrele existente din `StudentsPage.tsx` (status, search) → aplicate și pe export.
- Pattern REP-304 (export CSV) — `server/routes/reports.ts` secțiunea export. Adaptează, nu reimplementa.
- Nu instala noi dependențe. CSV simplu cu `Papa.unparse` client-side SAU stream server-side cu
  `text/csv; charset=utf-8` (recomandare: server-side streaming pentru date mari).

## In scope

### `GET /api/students/export` (server-side streaming)
- Parametri query: `status` (all|active|trial|paused|archived), `search` (string).
- Returnează `Content-Type: text/csv; charset=utf-8` cu header `Content-Disposition: attachment; filename="elevi-<date>.csv"`.
- Coloane: `Nume complet, Email, Telefon, Parinte, Email Parinte, Telefon Parinte, Status, Data inscrierii`.
- Tenant-safe (filtrare pe `tenantId`).
- Fără paginare — toți elevii care corespund filtrelor (max 5000; peste → truncat cu avertisment în header X-Truncated).

### Frontend — buton "Export" în `StudentsPage.tsx`
- Lângă butonul "Import CSV".
- Click → `GET /api/students/export?status=<curent>&search=<curent>` → browser descarcă CSV.
- Implementare: `window.location.href` cu URL-ul complet (cel mai simplu, funcționează cu streaming).
- Toast: "Se pregătește exportul..." la click (optional, dacă e lent).

### Tests
- `src/__tests__/students/export.test.ts`:
  - `GET /api/students/export` returnează CSV cu header corect.
  - Filtrare pe status=active → doar elevii activi.
  - Tenant-safe (alt tenant nu vede).

## User stories
- Ca **Manager**, vreau să export lista elevilor activi în CSV, pentru că o trimit contabilului pentru facturare.
- Ca **Recepționer**, vreau că exportul respecte filtrul curent (ex. doar studenți Trial), pentru că nu vreau să filtrez manual în Excel.

## Acceptance criteria
- AC1: `GET /api/students/export` returnează `text/csv` cu `Content-Disposition: attachment`.
- AC2: Filtrele de pe pagină (status, search) sunt aplicate și în export.
- AC3: Exportul include coloanele: Nume, Email, Telefon, Parinte, Status, Data inscrierii.
- AC4: Tenant-safe.
- AC5: Build+typecheck+lint curate.

## Tests (Given/When/Then)
- **T-STU-204-1** [blocant] Given serverul pornit + user autentificat, When `GET /api/students/export`, Then răspuns 200 cu Content-Type `text/csv` (live API smoke).
- **T-STU-204-2** [blocant] Given 2 elevi activi + 1 arhivat, When export cu `?status=active`, Then CSV cu 2 rânduri (nu 3).
- **T-STU-204-3** [blocant] Given user tenant B, When `GET /api/students/export` cu auth tenant A, Then 403.
- **T-STU-204-4** [normal] Given `<StudentsPage />` cu mock, When render, Then butonul "Export" e vizibil.
- **T-STU-204-5** [blocant] Given build, When `npm run build`, Then zero erori TypeScript.

## DoD
Build+typecheck+lint curate, tests verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/STUDENTS-faza-2-profile`.
