---
id: VM1-12
title: Dosar complet PDF — merge PAR form + atașamente + ordin de plată
milestone: VIOLETA
phase: DOSAR
priority: high
status: pending
depends_on: [VM1-04]
spec_created: 2026-06-28
---

## Goal

Finance officers need to download **one combined PDF** that contains, in order: the official PAR form, all supporting attachments (contract, act, quotations, invoice), and the payment order (ordin de plată) — the full paper trail as a single file.

Today they must download each file individually. The combined dosar eliminates manual collation before filing or sending to an auditor.

---

## User stories

- Ca **director financiar (Violeta)**, vreau să descarc dosarul complet al unui PAR (formular + atașamente + ordin) cu un singur buton, pentru că trebuie să arhivez o singură fișă la dosar.
- Ca **finanțist**, vreau să încarc ordinul de plată după efectuarea plății, pentru ca el să fie inclus automat în dosar.
- Ca **aprobator**, vreau să văd dosarul complet ca un singur PDF, pentru că auditorul cere toate documentele împreună.
- Ca **manager de proiect**, vreau ca fiecare tip de document să apară în ordinea corectă (PAR → contract → act → oferte → factură → ordin de plată), pentru că aceasta este ordinea standard de dosar.

---

## Acceptance criteria

1. **Noul tip `payment_order`** este adăugat la `parAttachmentKindEnum` în schema Drizzle, cu migrare commit-ted; `db:reset && db:seed` trec.
2. **Upload ordin de plată**: pe ParDetail (secțiunea Atașamente) și pe ParFinanceQueue, persoanele cu rol `par_finance` pot uploada un fișier cu `kind: "payment_order"`. Butonul este vizibil doar după ce PAR-ul ajunge în statusul `paid` sau `approved_final`.
3. **Endpoint `GET /api/par/:id/dosar`** returnează un PDF binar (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Dosar_PAR_<nr>.pdf"`). Folosește `pdf-lib` via **`import()` dinamic** (niciodată top-level — lecția exceljs/PAR-port). Serverul returnează 404 dacă PAR-ul nu există, 403 dacă userul nu are rol PAR.
4. **Ordinea documentelor** în dosar este deterministă:
   - Pagina 1+: formularul PAR (generat cu aceeași logică HTML→canvas din `parPdf.ts` sau re-exportat ca pagini PDF). Alternativ: dacă există un `par_pdf` attachment, folosește el.
   - Pagini separator între secțiuni (o pagină albă cu titlul tipului de document, bold, centrat).
   - Documente în ordinea: `contract` → `act_of_receipt` → `quotation` → `invoice` → `payment_order` → `other`.
   - Fișierele non-PDF (imagine, DOCX, XLSX) apar ca pagini separator cu nota „Anexă: <filename> (tipul de fișier nu permite include în PDF)".
5. **Buton „Descarcă dosarul complet (PDF)"** pe ParDetail (în header, lângă butonul PDF existent) și pe ParFinanceQueue (în coloana Acțiuni), cu stare loading și disabled cât descarcă.
6. **Diacritice românești** păstrate intact (pdf-lib suportă UTF-8; titlurile separator sunt scrise corect: ș/ț/ă/î/â).
7. **Fișierele PDF existente** ca atașamente sunt incluse cu paginile lor originale (PDFDocument.copyPages). Fișierele non-PDF produc pagini separator.
8. **Schema-index rule**: dacă nu se modifică schema, nu se exportă nimic din schema/index.ts. Dacă se adaugă tabelă nouă — export din index.ts în ACELAȘI commit.
9. **Route-mount rule**: endpointul `/api/par/:id/dosar` este montat în `server/app.ts` în ACELAȘI commit.
10. Migratia adaugă `payment_order` la enummul `par_attachment_kind` cu `ALTER TYPE ... ADD VALUE 'payment_order'`.

---

## Files to create / modify

| File | Action |
|------|--------|
| `server/db/schema/par.ts` | Adaugă `"payment_order"` la `parAttachmentKindEnum` |
| `server/db/migrations/XXXX_par_payment_order_kind.sql` | ALTER TYPE ... ADD VALUE (manuală, cu → statement-breakpoint dacă e nevoie) |
| `server/db/meta/_journal.json` | Append entry nouă |
| `server/routes/par.ts` | Adaugă `GET /:id/dosar` + `POST /:id/attachments` (dacă lipsește) |
| `src/pages/par/ParDetail.tsx` | Buton „Descarcă dosarul complet" + upload ordin de plată |
| `src/pages/par/ParFinanceQueue.tsx` | Buton dosar + upload ordin de plată |
| `src/lib/api/par.ts` | `downloadDosar(id)` client helper |

---

## Tests (Given/When/Then)

- **T-VM1-12-1** [blocant] Given PAR-ul cu id valid există, When `GET /api/par/:id/dosar` e apelat cu token valid, Then răspunsul are status 200, `Content-Type: application/pdf`, și Content-Disposition cu `filename=Dosar_PAR_`.
- **T-VM1-12-2** [blocant] Given PAR-ul are atașamente PDF, When dosarul e generat, Then toate PDF-urile originale sunt incluse (numărul de pagini crește față de dosarul fără atașamente).
- **T-VM1-12-3** [blocant] Given schema cu `payment_order` kind, When `db:reset && db:seed` rulează, Then nu există eroare; migrația a rulat și enum-ul conține `payment_order`.
- **T-VM1-12-4** [blocant] Given userul nu are rol PAR, When `GET /api/par/:id/dosar`, Then 403.
- **T-VM1-12-5** [normal] Given PAR cu atașamente non-PDF (ex. .xlsx), When dosarul e generat, Then pagina separator „Anexă: <filename>" apare în loc de conținut.
- **T-VM1-12-6** [normal] Given ParDetail cu PAR finalizat, When userul face click pe „Descarcă dosarul complet (PDF)", Then browser-ul descarcă un PDF (nu eroare JS, nu 500).

---

## Definition of done

- [ ] Migration `payment_order` committed, `db:reset && db:seed` green
- [ ] `GET /api/par/:id/dosar` returne binary PDF valid
- [ ] pdf-lib importat DOAR via `const { PDFDocument } = await import("pdf-lib")` (niciodată top-level)
- [ ] Buton pe ParDetail + ParFinanceQueue funcțional
- [ ] Upload `payment_order` disponibil pentru `par_finance` post-aprobare
- [ ] Build + typecheck + lint green
- [ ] T-VM1-12-1..T-VM1-12-6 pass
- [ ] Reviewer APPROVED + Persona saved
