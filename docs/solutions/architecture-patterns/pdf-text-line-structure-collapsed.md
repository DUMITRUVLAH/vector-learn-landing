---
title: unpdf mergePages:true collapsed every newline → all PDF text arrived as ONE line, silently breaking every line-based parser
problem_type: architecture_pattern
module: par-ai-prefill, fin-captures, statement-import
tags: [pdf, unpdf, extraction, ai-prefill, par, parser, whitespace, root-cause]
symptoms: PAR prefilled from a contract with "iciară: VictoriaBank S.A. …" in the Bancă field, an administrator of "Președintelui Ilie", an empty BIC, phantom payees named "Beneficiar"/"Prestator", and a total of 2 224 217 675 MDL instead of 8 000
severity: P1
date: 2026-08-25
---

## Symptom
The owner uploaded a signed services contract (CRJM ↔ Vector Academy) to PAR AI-prefill and the
form came back wrong in six ways at once: garbled bank name, truncated administrator, empty
BIC/SWIFT, the payer and payee roles inverted, the same company offered twice as separate payees,
and an amount three orders of magnitude too large.

## Root cause
One upstream defect, six downstream symptoms.

`server/lib/ai/pdfText.ts` called `extractText(pdf, { mergePages: true })`. unpdf builds each
page's text from the PDF's own end-of-line markers (`item.hasEOL`) — but its `mergePages: true`
branch then runs `texts.join("\n").replace(/\s+/g, " ")`, which **collapses every newline into a
space**. A 7-page contract therefore reached the parsers as a single 17 KB line.

Everything downstream is line-based, so each heuristic silently degraded to "scan the whole
document as one line":

- `stubPartyParser.extractAmount` gives an anchor's window "the rest of the line" → the rest of the
  *document*. The first money-shaped token it found was inside the IBAN
  `MD80VI000002224217675MDL` — an IBAN ends in a currency code, so it reads as 2 224 217 675,00 MDL.
- the bank/address/administrator windows and `tryParseColumnarContract` all key off lines.
- `statementExtractor`'s parsers are all `split(/\r?\n/)` — they had never once seen a real line
  from a PDF.

The fix is `mergePages: false` + joining the per-page strings ourselves, which keeps unpdf's own
`hasEOL`-derived newlines.

Restoring the lines exposed (and then fixed) five real parser bugs that the single-line blob had
been masking, all in `stubPartyParser.ts`:

1. **Money inside a code token.** `findMoneyInWindow` now rejects a number whose preceding
   character is a letter (IBANs, reference codes), and accepts the currency printed *before* the
   number with a bracket after it (`MDL 8,000.00 (opt mii lei)`), which matched nothing before.
2. **Bank label sliced mid-word.** `cleanBankName` windowed from `keywordIndex - 20`, cutting
   `Banca Beneficiară:` into `iciară:` — which no longer looked like a label to strip, so it
   shipped verbatim into the form. The window now snaps back to a word boundary and the label
   pattern covers every printed variant up to its colon.
3. **Roles decided by proximity in a 2-column signature block.** `BENEFICIAR   PRESTATOR` is one
   line, so the nearest anchor to the first company is whichever header word happens to be closer
   — the payer came out `provider` and the payee `client`. Two positional rules now beat proximity:
   the contract's own `denumită în continuare „Beneficiar"` phrase (authoritative), and column
   headers assigning their roles to the next two names in order.
4. **The contract's defined terms extracted as parties.** `…denumit în continuare „Prestator"`
   yielded a payee literally named "Prestator" with no requisites.
5. **One company split in two.** `„Vector Academy" S.R.L` (intro) and `S.C. „Vector Academy"
   S.R.L.` (signature) keyed differently, so the IDNO landed on one entry and the IBAN/bank/address
   on the other. `partyKey()` now normalizes punctuation + legal-form tokens.

Also added: BIC/SWIFT extraction (`Codul Băncii: VICBMD2X457`), which this path never did at all.

## Lesson
When a whole family of parsers misbehaves at once, suspect the shared input, not the parsers.
Six "separate bugs" had one cause, and each patch applied only to a symptom would have left the
others live.

Corollary for any text-extraction boundary: **whitespace normalization is not cosmetic.** A
`.replace(/\s+/g, " ")` at an upstream boundary destroys structural information that everything
downstream depends on, and it fails silently — no error, no empty result, just quietly worse
answers. Guard the boundary with a test that asserts the structure survives
(`server/lib/ai/__tests__/pdfText.test.ts`), not just that some text came back.

## Tests that lock it
- `server/lib/ai/__tests__/pdfText.test.ts` — a generated PDF's printed lines survive extraction.
- `server/lib/par/__tests__/stubPartyParser.signatureBlock.test.ts` — the owner's contract shape;
  all six symptoms asserted fixed (fails on the pre-fix parser).
- `server/__tests__/par-ai-prefill-signed-contract.routes.test.ts` — invokes the REAL
  `POST /api/par/ai-prefill` with a real PDF on the no-model (stub) path and asserts the response
  the form is filled from.
