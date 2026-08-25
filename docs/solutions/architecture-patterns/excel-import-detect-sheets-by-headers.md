---
title: Excel import matched sheets by name/position → a real client file imported 0 rows and returned 200
problem_type: architecture_pattern
module: PAR config import (server/routes/parConfigImport.ts)
tags: [excel, exceljs, import, silent-failure, varchar-limit, par, budget-codes]
symptoms: "„am încărcat codurile și nu s-au salvat" — tabelul rămâne gol, API răspunde 200 cu created:0, updated:0, errors:[]"
severity: P1
date: 2026-08-25
---

## Symptom
A client (ATIC / Violeta) uploaded her grant budget `LED.xlsx` on the **Coduri bugetare** tab of
`/business/par/admin`. The table stayed empty ("Niciun cod bugetar."). No error banner, no failed
request — `POST /api/par/config-import` answered **200** with
`budgetCodes: { created: 0, updated: 0, errors: [] }`.

## Root cause
Two independent defects, either of which alone loses the data.

**1. Sheets were located by NAME, then by POSITION.**

```ts
const projectRows = parseSheet(wb, "Proiecte", 0);      // fallback: worksheet index 0
const budgetRows  = parseSheet(wb, "Coduri buget", 2);  // fallback: worksheet index 2
```

Her workbook had **one** sheet, called `Sheet1`, columns `Cod | Denumire | Denumire proiect`.
No sheet is named "Coduri buget" and there is no index 2 → the 41 budget codes were never parsed.
Worse, the *same* sheet matched the projects fallback (index 0), and because it carries a
`Denumire proiect` column it imported cleanly as **one project, created once and updated 40 times**.
So the file "worked" — it just wrote to the wrong table and reported success.

Real users do not rename worksheets. Sheet names and positions are the two weakest signals in a
spreadsheet; the **header row is the thing a human actually fills in**.

**2. The "Cod" column carried the whole label, which is longer than the column.**

Every row had the same text in both columns — `4.2.6.3 Logistic support national makeathon
(transportation, accomodation, refreshments, materials)` (100 chars). `par_budget_codes.code` is
`varchar(50)`, so even after fixing (1) the insert would have thrown `value too long for type
character varying(50)` — and, since no row was wrapped in a try/catch, that would have 500'd the
whole upload instead of flagging one row.

## Fix
`server/lib/par/configImportSheets.ts` (pure, unit-testable):

- `detectKindFromHeaders()` — classify a sheet from its header row (diacritics/case/`*` insensitive:
  `Cod` → budget codes, `Denumire departament` → departments, …). Budget codes are checked first
  because that sheet legitimately also carries `Denumire proiect`/`Plătitor` columns; projects are
  checked before payers because the template's Proiecte sheet has a `Plătitor / Organizație` column.
- `detectKindFromName()` — sheet name as a fallback, position only when **nothing** in the whole
  workbook is recognisable (legacy files).
- `splitCodeAndName()` — `"1.1 Project Coordinator (100%)"` → `{ code: "1.1", name: "Project
  Coordinator (100%)" }`, and drops a code duplicated at the start of the label.
- Route: a workbook where nothing is recognised now returns **422 with the accepted headers listed**
  instead of a cheerful 200; per-row length checks and a per-row try/catch turn a bad cell into a row
  error; each sheet reports in `warnings[]` how it was read ("Foaia „Sheet1" a fost citită ca
  „Coduri bugetare" (41 rânduri)"), which the admin page renders.
- A project named on a budget-code row is created on the fly (that is how a grant budget arrives:
  one file, project name repeated on every line).

## Follow-up: the user decides, detection only suggests
Detection alone is still a guess. The admin page now previews the file first
(`POST /api/par/config-import/preview`, writes nothing) and opens a mapping dialog
(`src/components/par/ParImportMappingDialog.tsx`): per worksheet, the admin picks **what kind of
data it is** and **which column feeds which field**, with sample rows on screen. The choices go
back as a `mapping` form field that overrides detection entirely, so a file whose headers mean
nothing to any heuristic (`Coloana A | Coloana B`) still imports. Suggestions pre-fill the dialog;
they no longer decide.

## Lesson
1. **Import by content, not by position.** Any "sheet 2 is departments" / "column C is the amount"
   convention is a silent-data-loss bug waiting for the first real file.
2. **Zero rows imported is not a success.** If a parse recognises nothing, say so with a non-2xx and
   name what was expected. `200 + created: 0 + errors: []` is indistinguishable from "worked".
3. **Validate against the DB column limits before the INSERT**, and isolate each row, so one bad cell
   costs one row and not the whole file.
4. Tests: `server/lib/par/__tests__/configImportSheets.test.ts` +
   `server/__tests__/parConfigImport.routes.test.ts` rebuild the exact LED.xlsx shape and POST it
   through the real route (7 of the 9 integration assertions fail on the pre-fix code).
