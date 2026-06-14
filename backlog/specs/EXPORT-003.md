---
id: EXPORT-003
title: Export Center UI — pagina /app/fin/export cu toate formatele + filtru dată
milestone: FIN
phase: "21"
status: pending
depends_on: [EXPORT-002, CORE-004]
branch: feat/FIN-export
spec_version: 1
---

## Goal

O pagină UI la `/app/fin/export` care oferă un panou centralizat de export contabil. Contabilul
alege formatul, setează intervalul de date, apasă un buton și descarcă fișierul. Consumă
`GET /api/fin/export/formats` (EXPORT-002) și API client `finExport.ts`.

## User stories

- Ca contabil, vreau o pagină dedicată exportului, pentru că acum trebuie să știu exact URL-urile
  API și parametrii — e imposibil de folosit.
- Ca Andreea (director), vreau să văd toate formatele disponibile dintr-un loc, pentru că altfel
  trimit contabilul la IT de fiecare dată.
- Ca utilizator cu rol contabil/admin, vreau să filtrez exportul pe perioadă, pentru că rapoartele
  lunare/trimestriale au perioade fixe.

## Acceptance criteria

1. Pagina `/app/fin/export` randată fără crash în light + dark mode.
2. Lista formatelor vine din `GET /api/fin/export/formats`; fallback hardcodat dacă endpoint absent.
3. Fiecare format are: icon, titlu, descriere scurtă, buton "Descarcă".
4. Filtre comune (date picker `from`/`to`) aplicate la toate formatele bazate pe interval.
5. Formatul SAF-T RO și SAF-T full au selector suplimentar pentru `year` + `period` (dropdown lună/trimestru).
6. La click "Descarcă" → loading spinner pe buton → descărcare blob → spinner dispare; erori afișate inline.
7. Pagina e montată în rutele app React (App.tsx sau echivalent) la `/app/fin/export`.
8. Design system tokens exclusiv (fără hex hardcodat). Touch targets ≥ 44px. `aria-label` pe fiecare buton descărcare.
9. Teste vitest: T-EXPORT-003-1..3.

## Files

### New
- `src/pages/app/fin/ExportCenter.tsx` — pagina principală
- `src/components/fin/ExportFormatCard.tsx` — card per format (icon, titlu, descriere, buton)
- `src/__tests__/fin/export-003.test.tsx` — teste render + interacțiune

### Modified
- `src/App.tsx` (sau router echivalent) — adaugă ruta `/app/fin/export`
- `src/pages/app/fin/index.ts` (dacă există) — reexport ExportCenter

## Tests

- **T-EXPORT-003-1** [blocant] Given componenta ExportCenter, When render fără props, Then randează fără crash + conține cel puțin un buton cu aria-label "Descarcă".
- **T-EXPORT-003-2** [blocant] Given fetch-ul formatsApi returnează lista cu 2 formate, When randează ExportCenter, Then 2 carduri vizibile cu titlurile corecte.
- **T-EXPORT-003-3** [normal] Given click pe butonul "Descarcă" pentru formatul journal-csv, When utilizatorul apasă, Then funcția download corespunzătoare e apelată cu parametrii from/to corecți.
- **T-EXPORT-003-4** [normal] Given dark mode (class="dark" pe html), When ExportCenter render, Then niciun element nu folosește culoare hardcodată (snapshot fără inline style cu hex).

## DoD

- [ ] Pagina ExportCenter randează toate formatele din API sau fallback
- [ ] Filtre de dată funcționale pentru toate formatele
- [ ] Selector year/period pentru SAF-T
- [ ] Loading + erori inline
- [ ] Ruta montată în App.tsx
- [ ] Teste vitest trec (T1-T4)
- [ ] Design tokens exclusiv, dark mode ok, WCAG AA
- [ ] Build + typecheck + lint fără erori noi
