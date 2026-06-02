---
id: STU-203
title: "Import CSV/Excel studenți — preview, mapping coloane, dedup, dry-run"
milestone: STUDENTS
phase: 2
status: pending
depends_on: [STU-202]
slug: csv-import-students
---

## Goal

Permite unui admin/manager să încarce un fișier `.csv` sau `.xlsx` cu lista elevilor (export din
sistemul vechi / Excel), să mapeze coloanele la câmpurile DB, să vadă un dry-run cu preview
(câți valid, câți duplicate, câți cu erori), și să confirme importul.

**Reuse obligatoriu:**
- Pattern CRM-103 (manual-import de leaduri din CSV) — server-side parser + client preview.
  Codul din `server/routes/leads.ts` secțiunea `/import` + `src/components/app/ImportLeadsModal.tsx`.
  Nu reimplementa; adaptează.
- `normalizePhone`/`normalizeEmail` din `server/lib/normalize.ts` — aceleași funcții, nu duplicate.
- Dedup pe `phoneNormalized` SAU `emailNormalized` (același student nu se importă de 2 ori).
- Library CSV: `papaparse` deja instalat (verifică). XLSX: `xlsx` — instalează dacă lipsește.

## In scope

### `server/routes/students.ts` — extensie

#### `POST /api/students/import/preview`
- Acceptă `multipart/form-data` cu câmpul `file` (`.csv` sau `.xlsx`).
- Parsează fișierul (papaparse pentru CSV, xlsx pentru Excel).
- Mapare coloane automată: caută header-uri comune (`Nume`, `Prenume`, `Telefon`, `Email`,
  `Parinte`, `Telefon Parinte`, `Email Parinte`, `Data nasterii`, `Note`).
- Deduplică pe `phoneNormalized`/`emailNormalized` față de DB (studenții existenți).
- Returnează:
  ```json
  {
    "preview": [
      { "row": 1, "fullName": "...", "phone": "...", "status": "new|duplicate|error", "error": null | "..." }
    ],
    "summary": { "total": N, "new": N, "duplicates": N, "errors": N }
  }
  ```
- Limitează preview la primele 200 rânduri; fișiere >2000 rânduri → 400 cu mesaj.

#### `POST /api/students/import/commit`
- Body: `{ rows: [{ fullName, phone?, email?, parentName?, parentPhone?, parentEmail?, birthDate?, notes? }] }`.
- Insertează studenții (cei cu status `new` din preview — clientul trimite doar rândurile valide).
- `onConflictDoNothing` pe `(tenantId, phoneNormalized)`.
- Returnează `{ imported: N, skipped: N }`.

### Frontend — `ImportStudentsModal.tsx` (nou)

Declanșat de butonul "Import CSV" din `StudentsPage.tsx` (deja există pagina).

**Pasul 1 — Upload:**
- Dropzone cu accept `.csv, .xlsx`.
- Upload → `POST /api/students/import/preview` → afișează preview.

**Pasul 2 — Preview:**
- Tabel cu primele 10 rânduri. Badge per rând: verde=nou, galben=duplicat, roșu=eroare.
- Sumar: "245 noi · 12 duplicate (vor fi sărite) · 3 erori (nu se importă)".
- Buton "Importă X studenți noi" → `POST /api/students/import/commit`.

**Pasul 3 — Done:**
- "Import complet: 245 studenți adăugați."
- Buton "Închide" (reîncarcă lista).

### Adăugare buton în `StudentsPage.tsx`
- Buton "Import CSV" lângă "Adaugă elev" → deschide `ImportStudentsModal`.

### Tests
- `src/__tests__/students/import.test.ts`:
  - Preview cu CSV valid → summary corect.
  - Preview cu duplicat (student existent cu același telefon) → status "duplicate".
  - Commit → studenții noi apar în DB.
  - Fișier >2000 rânduri → 400.
- `src/components/app/ImportStudentsModal.test.tsx`:
  - Render fără crash.
  - Pasul 2 afișează sumar după upload mock.

## User stories
- Ca **Admin**, vreau să import 200 de elevi dintr-un Excel, pentru că migrez rapid din sistemul vechi fără să introduc manual.
- Ca **Manager**, vreau să văd un dry-run cu câți sunt noi vs. duplicate, pentru că nu vreau să creez duplicate accidentale.
- Ca **Admin**, vreau ca telefoanele duplicate să fie detectate automat (normalizate), pentru că aceeași persoană poate apărea cu formate diferite (+40... vs 07...).

## Acceptance criteria
- AC1: Upload `.csv` → preview în tabel cu status per rând.
- AC2: Elevii cu același `phoneNormalized` ca un student existent → status "duplicate", NU importați.
- AC3: "Importă" → studenții noi apar în DB și lista se reîncarcă.
- AC4: Fișiere >2000 rânduri → eroare clară (nu crash).
- AC5: Coloane mapate automat pentru header-uri comune românești.
- AC6: Build+typecheck+lint curate; zero `any`.

## Tests (Given/When/Then)
- **T-STU-203-1** [blocant] Given CSV cu 5 studenți noi, When `POST /api/students/import/preview`, Then summary `{ new: 5, duplicates: 0, errors: 0 }`.
- **T-STU-203-2** [blocant] Given student existent cu phone "+40700000001", When preview CSV cu "0700000001", Then rândul e marcat "duplicate".
- **T-STU-203-3** [blocant] Given preview cu 3 noi, When `POST /api/students/import/commit` cu cei 3, Then `{ imported: 3, skipped: 0 }` și studenții există în DB.
- **T-STU-203-4** [normal] Given CSV cu 2001 rânduri, When preview, Then 400 cu mesaj despre limită.
- **T-STU-203-5** [blocant] Given serverul pornit + user autentificat, When `POST /api/students/import/preview` cu fișier CSV valid, Then 200 (live API smoke).
- **T-STU-203-6** [blocant] Given render `<ImportStudentsModal />` cu mock preview response, When step 2, Then sumar "X noi · Y duplicate" vizibil.
- **T-STU-203-7** [blocant] Given build, When `npm run build`, Then zero erori TypeScript.

## DoD
Build+typecheck+lint curate, unit+integration verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/STUDENTS-faza-2-profile`.
