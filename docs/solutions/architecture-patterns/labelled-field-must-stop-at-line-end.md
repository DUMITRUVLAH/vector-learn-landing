---
title: A labelled requisite extracted with a CHARACTER window swallows the next line
problem_type: architecture_pattern
module: PAR AI prefill — stub party parser (server/lib/par/stubPartyParser.ts)
tags: [parsing, extraction, pdf, line-structure, par, ai-prefill, window, stop-words]
symptoms: "câmpurile completate automat conțin și textul de pe rândul următor: legalAddress=\"…, of. 12 Administrator: Vasile Popescu Cont bancar (\", administratorName=\"Vasile Popescu\\nCont\""
severity: P2
date: 2026-08-25
---

## Symptom
`POST /api/par/ai-prefill` on an ordinary services contract returned, for the SAME party:

```
legalAddress      = "mun. Chișinău, bd. Ștefan cel Mare 132, of. 12 Administrator: Vasile Popescu Cont bancar ("
administratorName = "Vasile Popescu\nCont"
```

The source is unremarkable — one requisite per line:

```
Adresa juridică: mun. Chișinău, bd. Ștefan cel Mare 132, of. 12
Administrator: Vasile Popescu
Cont bancar (IBAN): MD24AG000225100013104168
```

Not caught by any test: the unit tests fed single-line fixtures, and the e2e asserted the upload
control existed rather than calling the endpoint and reading the fields back.

## Root cause
One mechanism, two symptoms. Both extractors located their label, then took a **fixed-size
character window** after it and relied on a **stop-word list** to end the value:

```ts
const rest = block.slice(start, start + 160);        // crosses newlines
const stop = rest.search(ADDRESS_STOP_RE);           // only ends at a known keyword
```

Neither boundary respects a line. `\s` in the administrator's name regex matches `\n` too, so
`(?:\s+[A-Z]\w+){1,2}` cheerfully borrowed the first word of the following line. Whenever no
stop word happened to sit between the value and the next requisite, the next requisite got
appended.

The stop-word list is inherently incomplete — it is a blacklist of everything a value must not
run into. `Administrator`, `Cont bancar`, `Director`, `Tel` were all missing from it.

## Fix
Bound a labelled value by **the end of its own line first**, and keep the stop words as the
within-line guard:

```ts
function restOfLine(block: string, from: number, maxChars: number): string {
  const rest = block.slice(from, from + maxChars);
  const nl = rest.search(/\r?\n/);
  return nl >= 0 ? rest.slice(0, nl) : rest;
}
```

plus, inside the line, `[ \t]+` instead of `\s+` between name words, and a `REQUISITE_WORD_RE`
split so a collapsed one-line source still stops at `Cont|Banca|IBAN|Cod|Adresa|Tel|…`.

## Why the boundary only became available now
Until [pdf-text-single-line-root-cause] (same day), `extractPdfText` ran unpdf with
`mergePages: true`, whose `.replace(/\s+/g, " ")` collapsed **every** newline — PDF text arrived
as one giant line, so "end of line" did not exist and a character window was the only option.
Restoring the line structure made the correct boundary available; the extractors written before
that were never updated to use it.

**The general lesson:** when a fix restores structure to an input (lines, sections, columns), go
back and re-derive the parsers that had to guess without it. A workaround that outlives the
constraint it worked around becomes a bug.

## Guard
`server/lib/par/__tests__/stubPartyParser.lineBounded.test.ts` — two parties, each with its own
address + administrator followed immediately by other requisites. Asserts exact values, no
newline in any requisite, no cross-contamination between parties, and keeps a collapsed
(newline-free) variant so the stop-word path cannot regress either.

## Related
- [pdf-text-single-line-root-cause] — restored the line structure this fix depends on
- [excel-import-detect-sheets-by-headers] — same family: a heuristic that looked right and
  failed silently on a real client file
