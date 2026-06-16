---
id: INVOICE-REPORTING
title: Invoice Reporting — AI-assisted reportability triage for invoices & transactions
status: done
owner_request: 2026-06-16
supersedes: "Documente AI" (fin captures page) — renamed + extended
---

## Goal

The accountant uploads transactions/invoices (CSV bank statement / PDF / image). The AI reads each
document, extracts its fields, **and decides whether the item is "for reporting" (reportable) — yes/no
with a reason and a confidence score**. A reviewer then confirms or overrides the AI verdict; approved
items flow into reporting (VAT/declarations). This renames and extends the existing "Documente AI"
(fin_captures) flow — it does NOT rebuild it. Reuse over rebuild.

## Roles

- **Accountant (uploader)** — drops CSV/PDF/image into the inbox; can be any finance member.
- **Reviewer (approver)** — confirms/rejects the AI's reportable verdict. May be the same accountant
  (small org) or a second finance role (fin_members role `accountant`/`cfo`/`owner`).

## User stories

1. **As an accountant**, I upload a bank-statement CSV or an invoice PDF, so the AI reads it and
   proposes the extracted fields + a reportability verdict, so I don't triage every line by hand.
2. **As an accountant**, I see for each item a clear badge — **"Pentru raportare: DA / NU / DE VERIFICAT"** —
   plus the AI's one-line reason and a confidence %, so I know what needs my attention.
3. **As a reviewer**, I open an item, read the AI verdict + reason, and **Approve** (mark reportable)
   or **Reject** (not reportable, with my reason), so the decision is auditable.
4. **As a reviewer**, low-confidence items (AI < 0.7) are surfaced first ("DE VERIFICAT"), so my time
   goes where the AI is unsure.
5. **As an accountant**, once approved-reportable, the item is included in reporting totals (VAT/
   declarations), and I can filter the list by reportable status + month + team.
6. **As any user**, every state change (uploaded → AI-verdict → approved/rejected) is timestamped and
   attributed, so the reporting decision has an audit trail.

## Reportable verdict model

AI returns, in addition to the existing extracted fields:
- `reportable`: `true | false | null` (null = unsure)
- `reportable_reason`: short RO sentence ("Factură cu TVA deductibil → intră în declarația TVA")
- `reportable_confidence`: 0..1

Derived UI status (`reportableStatus`):
- `yes` — AI says reportable, OR reviewer approved
- `no` — AI says not reportable, OR reviewer rejected
- `review` — AI unsure (null) or low confidence (<0.7), awaiting human

Human override is final and recorded (`reviewedBy`, `reviewedAt`, `reviewDecision`, `reviewNote`).

## Features needed

- [F1] Schema: add `reportable` (varchar: yes/no/review), `reportableReason`, `reportableConfidenceBp`
  (int basis points), `reviewedBy`, `reviewedAt`, `reviewNote` to `fin_captures`. New migration.
- [F2] AI: `extractCaptureFields` also returns the reportable verdict (prompt + stub). Map to columns.
- [F3] Server: `PATCH /api/fin/captures/:id/review` { decision: "yes"|"no", note? } → sets reportable +
  reviewedBy/At. Extend list/summary to filter & count by reportable status.
- [F4] Frontend: rename "Documente AI" → **"Invoice Reporting"** (nav + page titles + route alias).
  Show the verdict badge, reason, confidence; Approve/Reject buttons on the detail page; filter by
  reportable status; "De verificat" count card.
- [F5] Keep existing upload + extract + confirm-to-expense flow intact (additive only).

## Acceptance criteria

- Upload CSV/PDF/image still works; AI now also returns reportable verdict (stub when no AI key).
- List shows reportable badge per item; "De verificat" surfaces low-confidence/unsure first.
- Reviewer can Approve/Reject; decision persists and shows who/when.
- Sidebar + page say "Invoice Reporting"; old /capture routes still resolve (alias).
- Build + all gates green; e2e: every button on the page works (upload, extract, review approve/reject,
  filter, confirm-to-expense). Live API smoke green.

## DoD

build + check-undefined-refs + route-mounts + migration-breakpoints green; migration applied to prod;
e2e all buttons green; no regression on the other FinDesk pages (e2e-business.mjs 0 broken).
