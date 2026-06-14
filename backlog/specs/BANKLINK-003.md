---
id: BANKLINK-003
title: "BankLink — auto-match tranzacții bancare → reconciliere CASH (motor unificat)"
milestone: FIN
phase: "18"
status: pending
depends_on: [BANKLINK-002, CASH-003]
spec: backlog/specs/BANKLINK-003.md
branch: feat/FIN-banklink
---

## Goal

Conectează tranzacțiile importate din BankLink (`fin_bank_transactions`) cu plățile și facturile
din modulul CASH (GAP-ANALYSIS G2 — reconciliere automată):

1. **Auto-match endpoint** `POST /api/fin/banklink/auto-match` — rulează motorul de reconciliere
   din CASH-003 (`reconcileEngine.ts`) pe toate tranzacțiile `status=unmatched` ale tenant-ului,
   actualizând `status`, `matched_source_type`, `matched_source_id` pe `fin_bank_transactions`.
2. **Manual match** `PATCH /api/fin/banklink/transactions/:id/match` — permite utilizatorului să
   marcheze manual o tranzacție ca matched (cu o plată sau factură), sau ca ignored.
3. **Coadă reconciliere** `GET /api/fin/banklink/queue` — returnează tranzacțiile `unmatched`
   cu candidații potriviți (calculați de motor), sortate după scor DESC — pagina de workflow.
4. **UI coadă** `src/pages/fin/BankLinkQueuePage.tsx` — `/app/fin/banklink/queue`:
   lista tranzacțiilor nereconciliate, cu candidații sugerați, butoane Potrivește/Ignoră.
5. **Badge dashboard** — pe BankLinkPage, afișează numărul de tranzacții `unmatched` ca badge
   de alertă pe cardul conexiunii.

BANKLINK-003 nu rescrie reconcileEngine.ts — îl IMPORTA și îl apelează cu datele din
`fin_bank_transactions`. Reuse over rebuild.

---

## User stories

- Ca **contabil**, vreau ca sistemul să potrivească automat tranzacțiile importate cu facturile
  existente, pentru că reconcilierea manuală a 200 tranzacții/lună durează o zi întreagă.
- Ca **director financiar**, vreau să văd coada tranzacțiilor nereconciliate cu sugestii, pentru
  că vreau să confirm/resping propunerile motorului, nu să caut manual.
- Ca **contabil**, vreau să pot marca o tranzacție ca "ignorată" (taxe bancare, comisioane),
  pentru că nu toate tranzacțiile corespund facturilor studențești.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/banklink/auto-match` — endpoint care:
  - Preia toate `fin_bank_transactions` cu `status='unmatched'` ale tenant-ului.
  - Preia facturile și plățile relevante (din `fin_invoices`/`fin_payments` dacă există pe
    branch, altfel din tabelele de bază: `invoices` + `payments`).
  - Apelează `reconcileEngine` (importat din `server/lib/fin/reconcileEngine.ts` de pe
    feat/FIN-cash sau echivalent local — dacă nu există pe main, implementează un motor
    minimal inline: match pe sumă exactă + dată ±7 zile).
  - Actualizează `fin_bank_transactions`: `status`, `matched_source_type`, `matched_source_id`,
    `matched_score_bp` (adaugă coloana dacă lipsește — migration 0126_banklink_match_score.sql).
  - Returnează `{ matched: N, unmatched: M, skipped: K }`.
  - requireAuth + tenant isolation.

- [ ] AC2: `PATCH /api/fin/banklink/transactions/:id/match` — manual match/ignore:
  Body: `{ action: "match" | "ignore", sourceType?: string, sourceId?: string }`.
  - "match" → validare că sourceId există (dacă furnizat), setare status=matched.
  - "ignore" → status=ignored.
  - Returnează tranzacția actualizată.

- [ ] AC3: `GET /api/fin/banklink/queue` — coada reconciliere:
  Returnează tranzacțiile `unmatched`, paginate, cu câmpul `candidates: [{ id, type, score,
  description, amountCents, dueDate }]` (max 3 candidați per tranzacție, generați de motor).
  Query params: `connectionId?`, `page=1`, `limit=20`.

- [ ] AC4: Migrare `0126_banklink_match.sql` (dacă `matched_score_bp` nu există deja pe
  `fin_bank_transactions`): `ALTER TABLE fin_bank_transactions ADD COLUMN IF NOT EXISTS
  matched_score_bp INTEGER DEFAULT 0;`. Statement-breakpoint dacă > 1 SQL. Prefix 126.

- [ ] AC5: `src/pages/fin/BankLinkQueuePage.tsx` — `/app/fin/banklink/queue`:
  - Header: "Coadă reconciliere — N tranzacții nereconciliate", buton "Auto-match".
  - Tabel: Dată, Suma, Descriere, Contraparte | Candidați sugerate (max 3 badges cu scor %).
  - Per rând: buton "Potrivește" (deschide mini-dialog selectare candidat) + "Ignoră".
  - Loading state pe butonul Auto-match (poate dura câteva secunde).
  - Stare goală: "Toate tranzacțiile au fost reconciliate."
  - Badge pe BankLinkPage: "N nereconciliate" pe cardul fiecărei conexiuni.

- [ ] AC6: `src/lib/api/finBankLink.ts` extins cu:
  - `autoMatch()` → `{ matched, unmatched, skipped }`
  - `matchTransaction(id, body)` → `{ transaction }`
  - `getQueue(params)` → `{ data: QueueItem[], total, page }`
  Tip nou: `QueueItem` extinde `BankTransaction` cu `candidates[]`.

- [ ] AC7: Ruta `/app/fin/banklink/queue` adăugată în App.tsx. Link din BankLinkPage.
  Design Vector 365, light+dark, fără hex. Scoruri afișate ca procente (ex: "85%").

---

## Files to create / modify

**Create:**
- `src/pages/fin/BankLinkQueuePage.tsx`
- `drizzle/0126_banklink_match.sql` (dacă coloana lipsește)
- `src/__tests__/fin/banklink-003.test.tsx`

**Modify:**
- `server/routes/finBankLink.ts` — adaugă auto-match, manual match, queue endpoints
- `src/lib/api/finBankLink.ts` — extinde cu autoMatch, matchTransaction, getQueue
- `src/pages/fin/BankLinkPage.tsx` — adaugă badge unmatched + link queue
- `src/App.tsx` — adaugă ruta /app/fin/banklink/queue
- `drizzle/meta/_journal.json` — append idx 126 (dacă migration adăugată)
- `server/db/schema/finBankLink.ts` — adaugă matched_score_bp dacă lipsește

---

## Tests

- **T-BANKLINK-003-1** `[blocant]` Given tranzacție unmatched, When POST /api/fin/banklink/auto-match, Then răspunsul are `matched >= 0` și `unmatched >= 0` (structura corectă).
- **T-BANKLINK-003-2** `[blocant]` Given tranzacție cu status=unmatched, When PATCH /match cu action=ignore, Then status devine "ignored".
- **T-BANKLINK-003-3** `[blocant]` Given GET /api/fin/banklink/queue, Then răspunsul are `data[]` și `total` (structura paginată corectă).
- **T-BANKLINK-003-4** `[blocant]` BankLinkQueuePage randează fără crash când data=[] (stare goală).
- **T-BANKLINK-003-5** `[blocant]` finBankLinkRoutes exportat conține handler-ele auto-match și queue după modificare.
- **T-BANKLINK-003-6** [normal] BankLinkQueuePage afișează butonul "Auto-match" și e clickabil (nu disabled când lista goală).

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T5 [blocante] trec
- [ ] Motor reconciliere refolosit (nu rescris)
- [ ] Migration 0126 cu breakpoints dacă > 1 SQL
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
