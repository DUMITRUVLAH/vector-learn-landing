---
id: EXPORT-002
title: "Export declarații fiscale + reuse FISC + UI Export Center /app/fin/export"
milestone: FIN
phase: "21"
status: pending
depends_on: [EXPORT-001, FISC-002]
spec: backlog/specs/EXPORT-002.md
branch: feat/FIN-export
---

## Goal

Extinde modulul de export (EXPORT-001) cu exportul declarațiilor fiscale generate de FISC
și construiește UI-ul "Export Center" la ruta `/app/fin/export` unde utilizatorul poate
descărca toate tipurile de export dintr-un singur loc.

Refolosește:
- `finTaxRoutes` / `fin_tax_declarations` (FISC-002) — declarații deja generate
- `finExportRoutes` (EXPORT-001) — endpoint-uri jurnal/balanță/SAF-T
- `ExportPage.tsx` existent (REP-304) este o pagină separată pentru analytics; aceasta e
  pagina FIN dedicată, distinctă, la `/app/fin/export`.

---

## User stories

- Ca **contabil**, vreau să descarc toate declarațiile fiscale ale perioadei (TVA12, D301,
  D394) cu un singur click, pentru că le depun împreună la SFS/ANAF.
- Ca **director financiar**, vreau un "Export Center" cu toate tipurile de export
  disponibile pe o singură pagină, pentru că nu știu unde să caut fiecare raport.
- Ca **administrator**, vreau să văd istoricul exporturilor recente (tip, dată, utilizator),
  pentru că trebuie să pot audita ce s-a descărcat și când.
- Ca **contabil**, vreau să pot alege intervalul de date și formatul (CSV/XML) înainte de
  export, pentru că cerințele diferă de la o instituție la alta.

---

## Acceptance criteria

- [ ] AC1: Endpoint nou `GET /api/fin/export/declarations/:declarationId` care returnează
  conținutul declarației fiscale (CSV sau XML după `?format=csv|xml`).
  Refolosește `declarationGenerator` din FISC-002 (`server/lib/fin/declarationGenerator.ts`
  de pe branch-ul feat/FIN-fisc) — dacă librăria nu există pe branch curent, returnează
  un CSV generic cu datele declarației din `fin_tax_declarations`.
  Soft reference pattern: niciodată 500 din cauza unui import lipsă.

- [ ] AC2: Endpoint `GET /api/fin/export/declarations` — lista declarațiilor disponibile
  pentru export (id, type, period, status, createdAt). Filtre: `year`, `type`.

- [ ] AC3: **Pagina UI** `src/pages/app/FinExportPage.tsx` la ruta `/app/fin/export`
  (distinctă de `ExportPage.tsx` care este la `/app/analytics/export`):

  **Secțiunea "Export contabil":**
  - Card "Jurnal contabil" → form dată-de la/până + buton Download CSV.
  - Card "Balanță de verificare" → form dată la + buton Download CSV.
  - Card "SAF-T RO" → selectori an + perioadă + buton Download XML.
  - Card "Facturi SFS Moldova" → form dată-de la/până + buton Download CSV.

  **Secțiunea "Declarații fiscale":**
  - Tabel declarații (tip | perioadă | status | acțiuni).
  - Buton "Download" per rând → descarcă via `/api/fin/export/declarations/:id?format=csv`.
  - Filtre: an fiscal, tip declarație.

  **Secțiunea "Istoric exporturi"** (simplu, in-memory per sesiune):
  - Lista ultimelor 10 exporturi ale sesiunii curente (tip, timestamp, status).

- [ ] AC4: Design-system Vector 365: tokeni semantici, dark mode, WCAG AA. Zero hex.

- [ ] AC5: API client `src/lib/api/finExport.ts` extins cu funcții pentru declarații
  (tipizate, returnează Blob pentru download).

- [ ] AC6: Ruta `/app/fin/export` înregistrată în `src/App.tsx` (lazy import).

- [ ] AC7: Tenant isolation + `requireAuth` pe toate endpoint-urile noi. Zero raw `.execute().rows`.

- [ ] AC8: Butonul de download arată spinner în timpul descărcării și toast success/error
  după finalizare.

---

## Files to create / modify

**Create:**
- `src/pages/app/FinExportPage.tsx` — UI Export Center FIN
- `src/__tests__/fin/export-002.test.tsx` — teste UI

**Modify:**
- `server/routes/finExport.ts` — adăugare endpoints `/declarations` și `/declarations/:id`
- `src/lib/api/finExport.ts` — funcții declarations download
- `server/app.ts` — dacă ruta nu era montată, verifică
- `src/App.tsx` — ruta `/app/fin/export` → `<FinExportPage />`

---

## Tests

- **T-EXPORT-002-1** `[blocant]` Given render FinExportPage, Then nu crează erori (smoke render).
- **T-EXPORT-002-2** `[blocant]` Given GET /api/fin/export/declarations cu tenant autentificat, Then 200 + JSON array (poate fi gol).
- **T-EXPORT-002-3** `[blocant]` Given declarație existentă, When GET /declarations/:id?format=csv, Then 200 + Content-Disposition attachment.
- **T-EXPORT-002-4** `[blocant]` Given live API smoke: POST /api/auth/login + GET /api/fin/export/declarations, Then 200.
- **T-EXPORT-002-5** [normal] Given click "Download CSV" pe jurnal, Then spinner apare în timpul fetch și toast success după.
- **T-EXPORT-002-6** [normal] Given declarație tenant B, When accesat de tenant A, Then 403 sau array gol (tenant isolation).

---

## Definition of Done

- [ ] AC1–AC8 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Ruta `/app/fin/export` înregistrată în App.tsx
- [ ] Build + typecheck + lint verzi
- [ ] Static guards verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
