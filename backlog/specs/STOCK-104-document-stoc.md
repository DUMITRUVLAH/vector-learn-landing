---
id: STOCK-104
title: Documentul de stoc (fin_stock_docs + linii) și ciclul draft → posted → reversed
milestone: STOCK
phase: B
priority: P0
core_ref: [stock/STOCK-CORE.md §2.5, §5]
tests: inline (vezi „Tests")
depends_on: [STOCK-103]
status: pending
---

# STOCK-104 — Documentul de stoc

## Goal
Marfa nu se mai mișcă „pentru că a apăsat cineva un buton", ci pe baza unui document cu număr,
dată, gestiune și responsabil. Item-ul aduce scheletul comun al celor patru documente și motorul
de postare pe care se sprijină toată faza B.

## In scope
- `server/db/schema/finStockDocs.ts` → `fin_stock_docs` + `fin_stock_doc_lines`, cu coloanele din
  CORE §2.5 (inclusiv `kind`, `status`, `doc_number`/`doc_year`, `location_id`,
  `to_location_id`, `source_kind`/`source_id`, `currency`/`fx_rate`, `reversal_of_id`).
- FK `fin_stock_movements.doc_id → fin_stock_docs.id` (coloana s-a creat la STOCK-102).
- `server/lib/finStockPosting.ts` (nou) — motorul, o singură funcție de postare pentru toate
  `kind`-urile:
  - validează gestiunea (activă, a tenantului), articolele (active, `is_stock_tracked`), `qty > 0`;
  - pentru ieșiri, verifică disponibilul pe gestiunea documentului pentru **toate** rândurile și
    întoarce lista completă a celor insuficiente, nu doar primul;
  - rezervă numărul prin `doc_number_sequences` (`server/db/schema/docs.ts`) — abia la postare;
  - scrie mișcările (`qty_signed`), cheamă `applyBalanceDelta`, recalculează CMP prin
    `calculateAvgCost` / `calculateExitCost` din `server/lib/finInventoryEngine.ts`;
  - **totul într-o singură tranzacție**.
- `server/lib/finStockReversal.ts` — stornarea: document oglindă cu `reversal_of_id`, postat, iar
  originalul trece în `reversed`.
- Rute `server/routes/finStockDocs.ts`, montate la `/api/fin/stock/docs`:
  `GET /` (filtre: `kind`, `status`, `locationId`, perioadă), `GET /:id` (cu rânduri),
  `POST /` (draft), `PATCH /:id` (doar draft), `DELETE /:id` (doar draft),
  `POST /:id/lines`, `PATCH /:id/lines/:lineId`, `DELETE /:id/lines/:lineId`,
  `POST /:id/post`, `POST /:id/reverse`.
- Audit: fiecare postare și stornare scrie în `server/db/schema/auditLog.ts`, cu
  `entity='fin_stock_doc'`.

## Out of scope
- UI — item-ul e API + motor. Ecranele vin la STOCK-105 (NIR) și STOCK-111.
- Logica specifică fiecărui `kind` dincolo de direcția mișcării: recepția (105), ieșirea (106),
  transferul (107) și inventarierea (108) își aduc regulile proprii peste motorul ăsta.

## Decizii, cu motivul
- **O singură pereche de tabele pentru toate cele patru documente.** Au aceeași formă: antet +
  rânduri. Patru perechi ar însemna patru copii ale logicii de postare, iar a cincea ar diverge
  de prima. Costul acceptat: coloane folosite doar de un `kind` (`to_location_id`,
  `qty_counted`) rămân `NULL` în rest — coloanele nule nu produc bug-uri, logica duplicată da.
- **Numărul se rezervă la POSTARE, nu la creare.** O ciornă ștearsă nu trebuie să lase o gaură în
  numerotare. Aceeași regulă ca la `doc_documents.doc_number`.
- **Un document postat e imutabil.** Editarea unei intrări vechi ar cere recalcularea tuturor
  ieșirilor de după ea — recostare retroactivă, refuzată explicit în CORE §4.1. Corecția se face
  prin stornare.
- **Stornarea NU recalculează CMP-ul înapoi.** Ar rescrie costul unor luni deja închise
  (CORE §5.4). Diferența rămâne vizibilă în raport.
- **Totalul documentului se calculează pe server**, niciodată preluat din client — ca la
  `doc_document_lines.line_total_cents`.

## Acceptance criteria
- [ ] Ambele tabele au `tenant_id` + indecșii din CORE §2.5, inclusiv
      `(tenant_id, source_kind, source_id)` și unicitatea numărului pe (tenant, kind, an)
- [ ] `POST /:id/post` e atomic: un singur rând fără stoc → **zero** mișcări, zero modificări de
      sold, documentul rămâne `draft` (verificat în DB, nu doar prin codul HTTP)
- [ ] Răspunsul de eroare listează **toate** rândurile insuficiente, cu `available`/`requested`
- [ ] `PATCH`/`DELETE` pe un document `posted` → `409 doc_posted`
- [ ] Stornarea creează documentul oglindă și trece originalul în `reversed`; a doua stornare a
      aceluiași document → `409 already_reversed`
- [ ] Numerele sunt consecutive per (tenant, kind, an); o ciornă ștearsă nu consumă număr
- [ ] Orice id străin (document, rând, gestiune, articol) → **404**
- [ ] Migrare commisă; `export *`; `ENSURE_STATEMENTS`; router montat în `server/app.ts`

## Tests
Fișier nou `server/__tests__/stock-docs.routes.test.ts`; `stock-isolation.routes.test.ts` extins.

Blocante:
1. `[blocant]` **atomicitatea**: document cu 5 rânduri, al 3-lea fără stoc → 422, iar în DB:
   0 mișcări noi, soldurile identice cu cele dinainte, `status='draft'`.
2. `[blocant]` postare reușită → mișcări cu `qty_signed` corect, balanțe actualizate, CMP
   recalculat prin motorul existent, total pe articol actualizat.
3. `[blocant]` numerotare: trei documente `reception` postate → numere consecutive; o ciornă
   ștearsă între ele nu lasă gol.
4. `[blocant]` editarea unui document postat → 409; rândurile din DB neschimbate.
5. `[blocant]` stornare: soldurile revin la valoarea dinaintea documentului original; originalul
   e `reversed`; a doua stornare → 409.
6. `[blocant]` izolare: `GET /:id`, `POST /:id/post`, `POST /:id/reverse` pe documentul lui B ca
   A → **404**, documentul lui B neatins.
7. `[blocant]` document al lui A care referă o gestiune a lui B → 404 (nu eroare de FK, nu 500).
8. `[blocant]` audit: postarea scrie un rând în `audit_log` cu `entity='fin_stock_doc'`.

## Files
- `server/db/schema/finStockDocs.ts` (nou) + `index.ts`
- `drizzle/0179_fin_stock_docs.sql`
- `server/lib/finStockPosting.ts`, `server/lib/finStockReversal.ts` (noi)
- `server/routes/finStockDocs.ts` (nou) + `server/app.ts`
- `server/db/ensure/stock.ts`
- `src/lib/api/finStock.ts`
- `server/__tests__/stock-docs.routes.test.ts` (nou)

## DoD
Standard.
