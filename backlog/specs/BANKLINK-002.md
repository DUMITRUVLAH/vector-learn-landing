---
id: BANKLINK-002
title: "BankLink — UI wizard import + gestionare conexiuni bancare"
milestone: FIN
phase: "18"
status: pending
depends_on: [BANKLINK-001]
spec: backlog/specs/BANKLINK-002.md
branch: feat/FIN-banklink
---

## Goal

Construiește interfața utilizator pentru modulul BankLink (GAP-ANALYSIS G2):

1. **Pagina Conexiuni** `/app/fin/banklink` — lista conexiunilor bancare cu status, ultimul import,
   buton Add + buton dezactivare.
2. **Dialog Add Conexiune** — formular creare conector nou (name, bank code, IBAN, currency,
   format: OFX/MT940).
3. **Wizard Import** `/app/fin/banklink/import` — drag&drop fișier OFX/MT940, previzualizare
   primele 5 tranzacții parsate, confirmare → import → rezultat (N importate, M duplicate, erori).
4. **Pagina Tranzacții** `/app/fin/banklink/transactions` — tabel paginat cu filtre (conexiune,
   status, dată from/to), badge status (unmatched/matched/ignored).
5. **API client** `src/lib/api/finBankLink.ts` — funcții typed pentru toate rutele din BANKLINK-001.

Design: Vector 365 tokens, light + dark, WCAG AA, fără hex hardcodate.

---

## User stories

- Ca **director financiar**, vreau să văd toate conexiunile bancare pe un ecran, pentru că am 6
  locații cu conturi diferite și trebuie să știu care a importat recent.
- Ca **contabil**, vreau să import fișierul OFX printr-un wizard vizual cu previzualizare, pentru
  că altfel nu știu dacă fișierul e corect înainte să confirm importul.
- Ca **director financiar**, vreau să filtrez tranzacțiile importate după status și dată, pentru că
  reconcilierea implică selectarea unui subset specific.
- Ca **contabil**, vreau să adaug o conexiune nouă în 30 de secunde, fără să contactez suportul.

---

## Acceptance criteria

- [ ] AC1: `src/lib/api/finBankLink.ts` — client API typed:
  - `listConnections()` → `{ connections: BankConnection[], total: number }`
  - `createConnection(body)` → `{ connection: BankConnection }`
  - `deleteConnection(id)` → `{ success: boolean }`
  - `listTransactions(params)` → `{ data: BankTransaction[], total: number, page: number }`
  - `importFile(body: { connectionId, format, content })` → `{ imported, duplicates, errors, total }`
  Tipuri exportate: `BankConnection`, `BankTransaction`, `ImportResult`.
  Zero `any`. Fetch cu `credentials: "include"`.

- [ ] AC2: `src/pages/fin/BankLinkPage.tsx` — pagina `/app/fin/banklink`:
  - Header cu titlu "Conexiuni bancare" + buton "Adaugă conexiune" (deschide dialog).
  - Tabel/cards cu conexiunile active: Nume, Bancă, IBAN (mascat: primele 4 + ultimele 4),
    Format, Ultima importare (relative date sau "Niciodată"), acțiune Dezactivare (confirm dialog).
  - Stare goală: "Nu ai conexiuni. Adaugă prima ta conexiune bancară."
  - Loading skeleton. Error state cu retry.
  - Navigare la `/app/fin/banklink/import` din fiecare conexiune ("Import").
  - Navigare la `/app/fin/banklink/transactions` pentru toate tranzacțiile.

- [ ] AC3: `src/components/fin/BankLinkAddDialog.tsx` — dialog creare conexiune:
  - Câmpuri: Nume (required), Cod bancă (MAIB/Moldindconbank/VicBank/Altă), IBAN (opțional,
    validare format), Monedă (MDL default), Format (OFX/MT940).
  - Submit → POST /api/fin/banklink/connections → refresh lista.
  - Validare client (Zod sau validare simplă): Nume obligatoriu, IBAN format dacă completat.
  - Loading state pe butonul Submit.

- [ ] AC4: `src/pages/fin/BankLinkImportPage.tsx` — `/app/fin/banklink/import`:
  - Selector conexiune (dropdown din lista activă).
  - Selector format (OFX / MT940) — auto-detectat din extensia fișierului dacă posibil.
  - Drop zone drag&drop sau click-to-select fișier `.ofx`/`.mt940`/`.txt`.
  - Previzualizare: primele 5 tranzacții parsate local (fără să trimiți la server) în tabel mic:
    Data, Sumă (MDL, colorat roșu/verde), Descriere, Ref.
  - Buton "Importă N tranzacții" (activ doar dacă preview > 0).
  - Rezultat: card cu imported/duplicates/errors, buton "Mergi la tranzacții".
  - Erori parsare: mesaj clar ("Fișierul nu a putut fi citit. Verifică formatul.").

- [ ] AC5: `src/pages/fin/BankLinkTransactionsPage.tsx` — `/app/fin/banklink/transactions`:
  - Filtre: dropdown Conexiune (toate/una), dropdown Status (toate/unmatched/matched/ignored),
    date-range from/to.
  - Tabel paginat (50/pagina): Dată, Suma (verde credit/roșu debit), Descriere, Contraparte,
    Referință, Status (badge colorat), Conexiune.
  - Paginare cu Prev/Next.
  - Export CSV (opțional, nice-to-have: simplu `a` download).
  - Stare goală: "Nu există tranzacții importate pentru filtrele selectate."

- [ ] AC6: Rute montate în `src/App.tsx` (sau router existent):
  `/app/fin/banklink` → `BankLinkPage`
  `/app/fin/banklink/import` → `BankLinkImportPage`
  `/app/fin/banklink/transactions` → `BankLinkTransactionsPage`
  Navigare din sidebar fin sau din FinDeskPage dacă există.

- [ ] AC7: Design Vector 365: `bg-card`, `text-foreground`, `border`, `text-muted-foreground`.
  Dark mode: nicio culoare hardcodată. Touch targets ≥ 44px. Labels pentru toate inputurile.
  Sumele negative cu `text-destructive`, pozitive cu `text-success` (sau `text-green-600 dark:text-green-400`).

---

## Files to create / modify

**Create:**
- `src/lib/api/finBankLink.ts`
- `src/pages/fin/BankLinkPage.tsx`
- `src/components/fin/BankLinkAddDialog.tsx`
- `src/pages/fin/BankLinkImportPage.tsx`
- `src/pages/fin/BankLinkTransactionsPage.tsx`
- `src/__tests__/fin/banklink-002.test.tsx`

**Modify:**
- `src/App.tsx` — adaugă rutele /app/fin/banklink*
- (opțional) sidebar sau FinDeskPage pentru link navigare

---

## Tests

- **T-BANKLINK-002-1** `[blocant]` Given BankLinkPage randat, When listConnections returnează [], Then se afișează mesajul stare goală "Nu ai conexiuni".
- **T-BANKLINK-002-2** `[blocant]` Given BankLinkPage randat cu 2 conexiuni, When userul dă click pe "Adaugă conexiune", Then BankLinkAddDialog se deschide.
- **T-BANKLINK-002-3** `[blocant]` Given BankLinkImportPage, When userul uploadează fișier OFX valid, Then previzualizarea arată ≥ 1 rând în tabelul preview.
- **T-BANKLINK-002-4** `[blocant]` Given BankLinkTransactionsPage randat cu tranzacții, When se randează, Then fiecare rând are badge status vizibil (unmatched/matched/ignored).
- **T-BANKLINK-002-5** `[blocant]` Given src/App.tsx, When se importă rutele banklink, Then /app/fin/banklink e definit și nu aruncă erori de build.
- **T-BANKLINK-002-6** [normal] BankLinkAddDialog validare: submit fără Nume returnează eroare vizibilă "Câmp obligatoriu".

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T5 [blocante] trec
- [ ] No hardcoded hex. Light + dark OK.
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
