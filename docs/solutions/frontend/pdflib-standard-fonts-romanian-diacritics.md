# pdf-lib standard fonts cannot draw ă/ș/ț — the whole PDF route 500s

**Date:** 2026-07-16 · **Found while:** VM3-02 (fișa aprobărilor în dosarul PDF) · **PR:** #262

## Root cause (one sentence)
pdf-lib's standard fonts (Helvetica etc.) use WinAnsi/cp1252 encoding, which has NO
`ă/Ă`, `ș/Ș`, `ț/Ț` (nor legacy cedilla `ş/ţ`) — `drawText()` THROWS
`WinAnsi cannot encode "ț" (0x021b)`, so a single diacritic anywhere in the text turns the
whole PDF response into a 500.

## How it bit us
`GET /api/par/:id/dosar` drew separator pages titled with `kindLabel()` values —
„Factură", „Ordin de plată", „Act de recepție". Any PAR with an attachment of those kinds
made the ENTIRE dosar download 500. A stale comment even claimed "Romanian diacritics are
preserved via pdf-lib UTF-8 support" — false for standard fonts (only true for embedded
Unicode fonts via `@pdf-lib/fontkit`).

## Fix
`server/lib/par/pdfText.ts` → `winAnsiSafe(text)`: transliterates `ă→a, ș→s, ț→t` (+ upper
+ cedilla forms), keeps `â/î` (they ARE in cp1252), replaces anything else non-cp1252 with
`?`. **Every** `drawText` on a standard font must go through it.

## Rule going forward
- Server-side PDF text drawn with a pdf-lib **standard font** MUST be wrapped in
  `winAnsiSafe()` (or embed a real Unicode font with fontkit — heavier, only if the visual
  diacritics matter).
- Regression tests: `server/lib/par/__tests__/approvalSheet.test.ts` (winAnsiSafe unit,
  incl. a real `drawText` probe) and `server/__tests__/par-finance-queue.routes.test.ts`
  (dosar with invoice/payment_order attachments → 200, verified to FAIL on pre-fix code).
