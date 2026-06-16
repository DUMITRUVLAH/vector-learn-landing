---
id: DOCMERGE-003
title: "Document Merge — generare batch N PDF-uri din template + Excel, livrare ZIP"
milestone: DOCMERGE
phase: 1
status: pending
depends_on: [DOCMERGE-002]
slug: batch-pdf-zip
---

## Goal

Inima modulului: dat un template (DOCMERGE-001) + un Excel mapat (DOCMERGE-002), **generează câte un
PDF auto-completat pentru FIECARE rând** din Excel și le **livrează grupat ca .zip** (sau individual).
Pentru rândul N, fiecare placeholder `{{tag}}` se înlocuiește cu valoarea coloanei mapate, HTML-ul
rezultat se rasterizează la PDF, iar toate PDF-urile se împachetează într-o arhivă.

**Reuse obligatoriu (NU reimplementa):**
- **Rasterizarea HTML→PDF cu Playwright** din `server/routes/finInvoiceDoc.ts` — același helper
  (boot browser, `setContent`, `page.pdf`). Extrage-l într-un `server/lib/docmerge/htmlToPdf.ts`
  partajat dacă e inline acum; refolosește-l, nu scrie un al doilea rasterizer.
- **Substituția** `renderWithContext` din `server/lib/docmerge/placeholders.ts` (001) — cu `esc()`
  pe valori (anti-injection), tag-urile nemapate rămân literal.
- **Împachetarea ZIP**: pattern-ul din `src/lib/certificateZip.ts` (`generateBulkZip` cu `JSZip`).
  Aici ZIP-ul se face server-side (Playwright e pe server), deci folosește `jszip` în server lib
  (deja dependență) — `server/lib/docmerge/zipPdfs.ts`. Nu reimplementa naming/escaping; reia
  `buildCertificateFileName` (mută-l într-un util partajat dacă e nevoie).
- Limita de rânduri (≤5000) din DOCMERGE-002 se aplică; pentru batch mare, procesare secvențială
  (Playwright nu suportă zeci de pagini paralele) + progress.

## In scope

### Lib — `server/lib/docmerge/htmlToPdf.ts` (nou, extras din finInvoiceDoc)
- `htmlToPdfBuffer(html: string): Promise<Buffer>` — boot/reuse Playwright `chromium`, `setContent`,
  `page.pdf({ format: "A4", printBackground: true })`. Un singur browser reutilizat pentru tot batch-ul
  (lansează o dată, închide la final), nu unul per rând.
- `finInvoiceDoc.ts` se refactorează să folosească acest helper (nu rămâne cod duplicat).

### Lib — `server/lib/docmerge/zipPdfs.ts` (nou)
- `buildPdfZip(files: { name: string; pdf: Buffer }[]): Promise<Buffer>` — `await import("jszip")`,
  adaugă fiecare PDF, `generateAsync({ type:"nodebuffer" })`.
- `buildDocFileName(index, rowLabel, prefix): string` — nume sigur (strip `/ : * ? " < > | \`),
  ex. `Doc_001_Maria_Popescu.pdf`. Refolosește logica din `buildCertificateFileName`.

### Lib — `server/lib/docmerge/generateBatch.ts` (nou — orchestratorul)
- `generateBatch({ bodyHtml, placeholders, mapping, rows, fileNameColumn? }): Promise<{ name, pdf }[]>`
  - Pentru fiecare rând: construiește `context` din `mapping` (placeholder → header → valoarea rândului),
    `renderWithContext(bodyHtml, context)` → HTML → `htmlToPdfBuffer` → numele din `fileNameColumn`
    (sau index).
  - Secvențial (un browser reutilizat). Returnează lista de fișiere.

### Routes — extensie `server/routes/docmergeTemplates.ts` (sau `docmergeJobs.ts`), montat (§3.5.1)
- `POST /api/docmerge/generate` — body:
  ```json
  {
    "templateId": "uuid",
    "mapping": { "nume": "Nume", "suma": "SUMA" },
    "rows": [ { "Nume": "Maria", "SUMA": "1500" }, ... ],
    "fileNameColumn": "Nume",   // opțional, pentru numele fișierelor
    "delivery": "zip"            // "zip" (default) | "single" (doar dacă rows.length===1)
  }
  ```
  - `delivery:"zip"` → `Content-Type: application/zip`, `Content-Disposition: attachment; filename="documente.zip"`,
    body = bufferul ZIP cu N PDF-uri.
  - `delivery:"single"` (un singur rând) → `application/pdf` direct.
  - Validări: template-ul aparține tenantului; `rows.length` între 1 și 5000; mapping non-gol.
  - Timeout/limită: pentru batch mare, e acceptabil sincron până la ~200 rânduri în acest item;
    >200 → tot merge, dar notează în „Backlog descoperit" un eventual job asincron + storage (out of scope aici).

### Frontend — pasul final în wizard (`DocMergeJobPage` din 002 / consolidat în 004)
- Buton „Generează N documente" (N = rows.length după mapare).
- Indicator de progres (chiar și doar „Se generează…"; progres real fin = nice-to-have).
- La răspuns: descarcă ZIP-ul (`downloadBlob` din `src/lib/certificateZip.ts` — refolosit) cu nume
  `documente-<template>-<data>.zip`.
- Mesaj de succes: „N documente generate."
- Tokens Vector 365, dark mode, a11y. Zero hex în `.tsx`.

### API client — extinde `src/lib/api/docmerge.ts`
- `generateBatch(payload): Promise<Blob>` (fetch cu `responseType` blob; tratează atât zip cât și pdf).

## User stories
- Ca **Admin**, vreau ca dintr-un template + un Excel de 50 de rânduri să primesc un ZIP cu 50 de
  PDF-uri completate, pentru că altfel le-aș face manual ore în șir.
- Ca **Manager**, vreau ca numele fișierelor să fie lizibile (numele persoanei), pentru că le trimit
  individual și nu vreau `doc1.pdf, doc2.pdf`.
- Ca **Admin**, vreau ca un singur rând să-mi dea direct un PDF (nu un ZIP cu un fișier), pentru
  cazul „generez un singur document".

## Acceptance criteria
- AC1: `generateBatch` cu 3 rânduri → 3 PDF-uri în rezultat, fiecare cu valorile rândului substituite.
- AC2: `POST /api/docmerge/generate` cu `delivery:"zip"` → `application/zip`, ZIP cu N intrări `.pdf`.
- AC3: `delivery:"single"` + un rând → `application/pdf` direct (nu ZIP).
- AC4: Numele fișierelor sunt sigure (fără caractere invalide) și folosesc `fileNameColumn` când e dat.
- AC5: Un singur browser Playwright reutilizat pe tot batch-ul (nu unul per rând) — verificat în cod/test.
- AC6: `rows` gol / `mapping` gol / template străin → 400/403, nu crash.
- AC7: Build+typecheck+lint curate; zero `any`; `jszip`/`exceljs`/`playwright` doar prin reuse; ruta montată (§3.5.1).

## Tests (Given/When/Then)
- **T-DOCMERGE-003-1** [blocant] Given bodyHtml `"{{nume}} datorează {{suma}}"`, mapping, 2 rânduri, When `generateBatch`, Then 2 PDF-buffere nevide; (test pe HTML intermediar) substituția corectă per rând.
- **T-DOCMERGE-003-2** [blocant] Given valoare cu `<script>` într-un rând, When render, Then e escapată (anti-injection) în HTML-ul generat.
- **T-DOCMERGE-003-3** [blocant] Given `buildPdfZip` cu 3 fișiere, When zip, Then arhiva conține exact 3 intrări cu numele așteptate.
- **T-DOCMERGE-003-4** [blocant] Given server pornit + user autentificat, When `POST /api/docmerge/generate` (zip, 2 rânduri), Then 200 + `content-type: application/zip` (live API smoke).
- **T-DOCMERGE-003-5** [blocant] Given un singur rând + `delivery:"single"`, When generate, Then `application/pdf`.
- **T-DOCMERGE-003-6** [normal] Given `rows: []`, When generate, Then 400 cu mesaj.
- **T-DOCMERGE-003-7** [blocant] Given `npm run build`, Then zero erori TS + `check-route-mounts` verde.

## DoD
Build+typecheck+lint curate, live API smoke verde, adversarial review (mutație/financiar — diff cu
generare în masă), reviewer APPROVED după review→improve loop, persona reports salvate,
commit pe `feat/DOCMERGE-faza-1-document-merge`.
