---
id: DOCMERGE-002
title: "Document Merge — upload Excel, parsare rânduri, mapare coloane → placeholdere"
milestone: DOCMERGE
phase: 1
status: pending
depends_on: [DOCMERGE-001]
slug: excel-import-mapping
---

## Goal

Pentru un template existent (DOCMERGE-001), permite user-ului să **încarce un Excel (.xlsx)**,
sistemul **parsează rândurile** și oferă un UI de **mapare a coloanelor Excel la placeholderele**
detectate în template (auto-match pe nume identic, restul manual). Rezultatul mapării e folosit în
DOCMERGE-003 pentru a genera N PDF-uri.

**Reuse obligatoriu (NU reimplementa):**
- Citirea `.xlsx` cu **`exceljs`** (deja instalat — NU adăuga `xlsx`/`sheetjs`). **CRITICAL §par-port:**
  `exceljs` se importă DOAR prin `await import("exceljs")` în interiorul funcției, NICIODATĂ top-level —
  un import top-level a căzut tot API-ul în prod (vezi `server/lib/par/excelExport.ts` care face exact asta).
- Pattern preview+mapping din STU-203 / CRM-103 (import CSV studenți): server parsează → client preview
  + mapare coloane. Adaptează, nu duplica.

## In scope

### Lib — `server/lib/docmerge/excelImport.ts` (nou)
- `parseWorkbook(buffer: Buffer): { headers: string[]; rows: Record<string,string>[] }`
  - `const { default: ExcelJS } = await import("exceljs");` (lazy, vezi nota de mai sus).
  - Citește primul worksheet; rândul 1 = headere; restul = date (string-uite, valorile numerice/date → string lizibil).
  - Limită: >5000 rânduri → aruncă eroare clară (procesare batch enormă = altă poveste).
- `autoMap(headers: string[], placeholders: string[]): Record<string,string>`
  - Mapează automat un placeholder la o coloană cu același nume (case-insensitive, fără diacritice/spații).
  - Întoarce `{ placeholder: header }` doar pentru cele găsite; restul rămân nemapate (UI le cere manual).

### Routes — extensie `server/routes/docmergeTemplates.ts` (sau `docmergeJobs.ts` nou montat în app.ts)
- `POST /api/docmerge/parse-excel` — `multipart/form-data` câmp `file` (.xlsx).
  Întoarce `{ headers, rowCount, sample: rows[0..4], previewRows: rows[0..199] }`.
  - >5000 rânduri → 400 cu mesaj.
- `POST /api/docmerge/automap` — body `{ headers, placeholders }` → `{ mapping }` (autoMap).
  (Sau calculează autoMap în client din răspunsul parse-excel; alege una și fii consecvent.)

### Frontend — extinde `DocMergeTemplatesPage` SAU pagină nouă `DocMergeJobPage.tsx`
Flux pe pași pentru un template selectat:
- **Pasul 1 — Excel:** dropzone accept `.xlsx` → `POST /api/docmerge/parse-excel` → afișează
  „N rânduri găsite, coloane: …".
- **Pasul 2 — Mapare:** pentru fiecare placeholder din template, un `<select>` cu coloanele Excel
  (pre-selectat din autoMap). Indică vizual placeholderele nemapate (vor rămâne literal `{{tag}}`).
- **Pasul 3 — Preview rând:** un selector „rândul 1..N" → randează template-ul (preview API din 001)
  cu valorile rândului ales prin mapare. Confirmă vizual că totul se completează corect.
- (Generarea efectivă a PDF-urilor = DOCMERGE-003; aici doar pregătim datele + mapping.)
- Tokens Vector 365, dark mode, a11y (fiecare `<select>` are `<label>`). Zero hex în `.tsx`.

### API client — extinde `src/lib/api/docmerge.ts`
- `parseExcel(file: File)`, `autoMap(headers, placeholders)`.

## User stories
- Ca **Admin**, vreau să încarc un Excel cu o linie per document, pentru că am 50 de contracte de generat.
- Ca **Manager**, vreau ca sistemul să potrivească automat coloanele cu numele identic, pentru că
  nu vreau să mapez manual 15 câmpuri.
- Ca **Admin**, vreau să văd preview-ul unui rând cu datele reale înainte de a genera tot, pentru că
  vreau să prind greșelile de mapare devreme.

## Acceptance criteria
- AC1: Upload `.xlsx` cu headere `nume, suma` și 3 rânduri → `{ headers:["nume","suma"], rowCount:3 }`.
- AC2: `exceljs` importat DOAR dinamic (grep: zero `import … from "exceljs"` top-level în fișiere noi).
- AC3: autoMap leagă `nume→nume`, `Suma → suma` (case/diacritice-insensitive); placeholderul fără
  coloană potrivită rămâne nemapat în UI.
- AC4: Preview rând randează template-ul cu valorile rândului selectat.
- AC5: Fișier >5000 rânduri → 400 cu mesaj clar (nu crash).
- AC6: Build+typecheck+lint curate; zero `any`; ruta montată în app.ts (§3.5.1); dark mode OK.

## Tests (Given/When/Then)
- **T-DOCMERGE-002-1** [blocant] Given un .xlsx (fixture) cu 2 coloane + 3 rânduri, When `parseWorkbook`, Then `headers` și `rows` corecte.
- **T-DOCMERGE-002-2** [blocant] Given headers `["Nume","SUMA"]` + placeholders `["nume","suma"]`, When `autoMap`, Then `{nume:"Nume", suma:"SUMA"}`.
- **T-DOCMERGE-002-3** [blocant] Given placeholder `data` fără coloană potrivită, When `autoMap`, Then `data` lipsește din mapping (rămâne manual).
- **T-DOCMERGE-002-4** [blocant] Given serverul pornit + user autentificat, When `POST /api/docmerge/parse-excel` cu .xlsx valid, Then 200 + headers/rowCount (live API smoke).
- **T-DOCMERGE-002-5** [normal] Given .xlsx cu 5001 rânduri, When parse, Then 400 cu mesaj despre limită.
- **T-DOCMERGE-002-6** [blocant] Given mapping + un rând, When preview, Then HTML-ul conține valorile rândului.
- **T-DOCMERGE-002-7** [blocant] Given grep peste fișierele noi, Then NICIUN `import` static de `exceljs` (doar `await import`).

## DoD
Build+typecheck+lint curate, live API smoke verde, reviewer APPROVED după review→improve loop,
persona reports salvate, commit pe `feat/DOCMERGE-faza-1-document-merge`.
