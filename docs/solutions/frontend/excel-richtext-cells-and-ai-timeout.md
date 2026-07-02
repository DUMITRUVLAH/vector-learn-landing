# Excel upload: rich-text cells → "[object Object]" → prod AI-timeout 500

**Symptom:** owner uploaded a bank-statement `.xlsx` → "Eroare la upload. Încearcă din nou."
Only on prod; locally the same file returned 201 with 0 transactions (no visible error).

**Root cause (one sentence):** the upload route stringified exceljs cells with
`String(cell.value)`, but MAIB cells are **rich-text objects** (`{ richText: [{text}] }`), so
every cell became the literal `"[object Object]"` → the deterministic parser found 0
transactions → the empty heuristic fell through to a 4000-token **AI call over ~100KB of
garbage** → **Vercel's 30s function limit → 500**.

**Why the PDF-only smoke missed it:** PDF text extraction (unpdf) yields plain text, so the
PDF path worked; the Excel path has a completely different cell model. And locally (no
`AI_API_KEY`) the slow path is a no-op stub, so the upload "succeeded" with 0 lines — the
failure only exists where the AI key is set (prod). Two environment-specific factors hid it.

**Fix:**
1. `cellTextForStatement()` extracts real text from richText / hyperlink / formula / date cells.
2. Route TAB-joins cells (amounts contain commas: `346 764,10`) → `parseMaibExcelStatement()`
   reads columns **by position from the deduped header** (content-guessing mistook an IBAN or
   a details string for the partner name). MAIB `.xlsx` spreads one transaction across 2–3
   sibling rows cycling name → IDNO → IBAN in the "Date partener" column.
3. **AI-fallback guard**: never call the AI for tab-delimited (Excel) input — the Excel parser
   is authoritative; an unrecognized Excel returns `[]` cleanly instead of risking the timeout.

**Lessons / rules carried forward:**
- **A parser fed a NEW input encoding needs a fixture in THAT encoding.** exceljs cell values
  are objects, not strings — never `String(cell.value)`; go through a cell→text helper.
- **"201 with empty result" is a silent failure, not success.** When a heuristic returns
  nothing, decide explicitly whether the expensive fallback (AI/network) is worth the latency
  budget — an unbounded model call on a serverless function is a latent 30s-timeout 500.
- **Test each upload FORMAT, not just one.** The PDF smoke green ≠ Excel works. Verified the
  Excel action against real files (totals equal the bank's reported Total Intrări/Ieșiri to the
  cent) + 12 regression tests that fail on the old code.

## Follow-up (STMT-007): the ACTUAL prod 500 was a packaging bug, not the timeout

The richText fix above was necessary but did NOT resolve the owner's error, because
`await import("exceljs")` was throwing **before any parsing**: `scripts/build-vercel.mjs`
listed `exceljs` in esbuild's `external`. The Vercel Build Output API `.func` directory ships
ONLY the bundled `index.mjs` — there is no `node_modules` — so an external package can never
resolve at runtime → `500: Cannot find package 'exceljs'` on every `.xlsx` upload (statement
import AND the PAR Excel export). Fix: remove exceljs from `external` (esbuild bundles it
fine; 8.2 MB). **Rule: never mark a package that request-path code imports as esbuild
`external` in build-vercel.mjs.** Only guarded/never-on-Vercel packages (pglite, playwright)
may be external. Lesson reinforced: when the fix you shipped doesn't clear the reported error,
re-derive the root cause from the ACTUAL failing environment — don't assume your first theory
was complete.
