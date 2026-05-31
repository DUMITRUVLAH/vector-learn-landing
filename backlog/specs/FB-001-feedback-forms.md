---
id: FB-001
title: Formulare de feedback pentru cursanți + analiză
milestone: FEEDBACK
phase: 1
priority: P1
status: done
---

# FB — Feedback forms (formulare de feedback)

## Goal
Centrele educaționale trimit formulare de feedback cursanților în 3 momente-cheie ale cursului
și analizează răspunsurile agregate. Sursa cererii (owner): 3 tipuri de șablon —
**Feedback Inițial** (trimis după prima săptămână de curs), **Feedback Mijloc Curs**,
**Feedback Final** — aplicabile la toate cursurile.

## In scope
- **3 tipuri de formular (stage):** `initial`, `mid`, `final`, cu label + descriere predefinite
  (ex. „Feedback Inițial — Trimis după prima săptămână de curs").
- **Form builder:** întrebări ordonate, 6 tipuri (rating 1–5, scală 0–10, alegere unică,
  alegere multiplă, text liber, da/nu), obligatorii/opționale, opțiuni per întrebare, reorder.
  Șablon implicit de întrebări per stage la creare cu un click.
- **Trimitere către cursanți:** selectezi cursanți (din modulul Elevi, tenant-scoped) → se
  creează invitații cu token public unic. Un cursant nu poate fi invitat de două ori la același
  formular (unique index form+student).
- **Completare publică (fără login):** cursantul deschide `/#/feedback/:token`, vede întrebările,
  trimite o singură dată (idempotent: re-submit → 409). Validare câmpuri obligatorii.
- **Analiză:** rată de răspuns, medie pentru rating/scală + histogramă, tally pentru alegeri,
  da/nu, listă răspunsuri text.
- Date demo în seed: un formular „Feedback Inițial" cu 6/8 răspunsuri pentru a popula analiza.

## Out of scope
- Trimiterea efectivă prin email/WhatsApp (link-ul e copiabil din UI; integrarea cu providerul de
  comunicare — COMM-201 — poate trimite automat ulterior).
- Programare automată („trimite la 7 zile după start curs") — viitor, prin Automatizări (CRM-110).

## Acceptance criteria
- [x] 3 tipuri de formular cu label/descriere conform cererii owner-ului
- [x] CRUD formular + întrebări; builder cu 6 tipuri, reorder, validare opțiuni
- [x] Trimitere către cursanți tenant-scoped; fără dubluri (unique index)
- [x] Pagină publică token-based (fără auth) cu submit idempotent + validare obligatorii
- [x] Analiză agregată (rată răspuns, medii, histogramă, tally, text)
- [x] Migrare generată + commisă; `db:reset` + `db:seed` trec (§3.5.1)
- [x] Live API smoke: login + create→send→public get→submit→results, toate 200/409/404 corecte
- [x] Endpoints tenant-scoped; query builder portabil (fără raw `.execute().rows`)
- [x] 7 teste vitest verzi; suita completă verde (352/352); typecheck + build verzi

## Files
- `server/db/schema/feedback.ts` — 4 tabele + helper token
- `server/routes/feedback.ts` — manager CRUD/send/analytics (auth)
- `server/routes/feedbackPublic.ts` — public submit (token, no auth)
- `src/lib/api/feedback.ts` — client + tipuri + șabloane implicite
- `src/pages/app/FeedbackPage.tsx` — hub (type picker + listă)
- `src/components/app/feedback/{FeedbackFormBuilder,FeedbackSendPanel,FeedbackResults}.tsx`
- `src/pages/app/FeedbackPublicPage.tsx` — formular public student
- seed + AppShell nav + App.tsx routing

## Notes / decizii
- **Bug prins de integration smoke (nu de unit tests):** `tagRoutes` montat pe `/api` cu
  `use("/*", requireAuth)` intercepta orice `/api/*`, inclusiv ruta publică → 401. Rezolvat
  montând `/api/public/feedback` ÎNAINTE de `tagRoutes` și folosind un prefix care nu se
  suprapune cu `/api/feedback` (auth). Exact tipul de breakage pe care îl vizează gate-ul §3.5.1.
