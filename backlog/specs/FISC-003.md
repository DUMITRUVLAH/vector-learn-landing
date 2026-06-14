---
id: FISC-003
title: "Generare declarații MD TVA12 / RO D394 + D301 — export PDF + CSV"
milestone: FIN
phase: "10"
status: pending
depends_on: [FISC-002]
spec: backlog/specs/FISC-003.md
branch: feat/FIN-fisc
---

## Goal

Implementează generatorul de declarații fiscale structurate, bazat pe payload-ul calculat în
FISC-002. Suportă trei formate:

- **MD TVA12** — declarația lunară de TVA pentru Republica Moldova (SFS)
- **RO D394** — declarația informativă privind livrările/achizițiile din România (ANAF)
- **RO D301** — ramburs TVA România

Exportul este în format **PDF** (via jsPDF sau html-to-pdf pe server) și **CSV** pentru
depunere electronică. Nu se trimite automat la autorități — export pentru depunere manuală
de către contabil (nu avem acces API la SFS/ANAF).

Pagina UI `/app/fin/tax` afișează perioadele, statusul declarațiilor, și butonul de download.

---

## User stories

- Ca **contabil**, vreau să generez PDF-ul declarației TVA12 din sistem cu un singur click, pentru că completarea manuală a formularului durează 30+ minute și e supusă greșelilor de transcriere.
- Ca **contabil RO**, vreau să export D394 în format CSV compatibil ANAF, pentru că îl încarc direct în aplicația ANAF fără re-tastare.
- Ca **director**, vreau să văd în sistem statusul fiecărei declarații (draft/ready/filed) și data depunerii, pentru că am nevoie de dovada conformității fiscale.
- Ca **contabil**, vreau să marchez o declarație ca „depusă" cu data efectivă, pentru că sistemul trebuie să reflecte realitatea, nu doar generarea.

---

## Acceptance criteria

- [ ] `GET /api/fin/tax/declarations/:id/export?format=pdf` returnează PDF binar (`Content-Type: application/pdf`)
- [ ] `GET /api/fin/tax/declarations/:id/export?format=csv` returnează CSV UTF-8 cu BOM
- [ ] PDF TVA12-MD conține: antet „DECLARAȚIE TVA (Forma TVA12)", perioada, TVA colectat per cotă, TVA deductibil, TVA de plată, semnătură digitală contabil (text placeholder), număr declarație
- [ ] CSV D394-RO conține coloane ANAF: `CIF_FURNIZOR, DENUMIRE_FURNIZOR, NR_FACTURA, DATA_FACTURA, VALOARE_FARA_TVA, TVA_COLECTAT`; per factură din perioadă
- [ ] CSV D301-RO conține: `PERIOADA, BAZA_TVA, TVA_DATORAT, TVA_DEDUCTIBIL, DIFERENTA` (un singur rând sumar)
- [ ] `PATCH /api/fin/tax/declarations/:id/file` marchează declarația ca `status = 'filed'` cu `filed_at = now()`; câmpul `notes` opțional (număr înregistrare SFS/ANAF)
- [ ] `GET /api/fin/tax/periods` include `declarations[]` cu `{id, type, status, filed_at}` per perioadă
- [ ] Pagina `/app/fin/tax` afișează: lista perioadelor, per fiecare declarație: tip, status badge (draft/ready/filed), buton Download PDF, buton Download CSV, buton „Marchează depus"
- [ ] Badge statusuri cu design-system tokens: `bg-muted` = draft, `bg-amber-100 text-amber-800` = ready, `bg-green-100 text-green-800` = filed
- [ ] Dark mode funcțional (tokens, nu hex hardcodat)
- [ ] Dacă payload-ul declarației e gol (nu s-a calculat) → buton Download dezactivat + tooltip „Calculează mai întâi"
- [ ] Tenant isolation pe toate rutele

---

## Files to create / modify

**Create:**
- `server/lib/fin/declarationGenerator.ts` — generatoare PDF + CSV pentru TVA12, D394, D301
- `src/pages/fin/TaxPage.tsx` — pagina `/app/fin/tax` cu lista perioadelor + acțiuni declarații

**Modify:**
- `server/routes/finTax.ts` — adaugă rutele `/export` și `/file`
- `src/App.tsx` — adaugă ruta `/app/fin/tax`

---

## Tests

- **T-FISC-003-1** [blocant] Given declarație cu payload calculat, When `GET /api/fin/tax/declarations/:id/export?format=pdf`, Then `Content-Type: application/pdf`, răspuns 200, body non-gol
- **T-FISC-003-2** [blocant] Given declarație tip D394, When export CSV, Then CSV conține header `CIF_FURNIZOR` și cel puțin un rând
- **T-FISC-003-3** [blocant] Given `PATCH /api/fin/tax/declarations/:id/file`, When apelat, Then `status = 'filed'` și `filed_at != null`
- **T-FISC-003-4** [blocant] Given pagina `/app/fin/tax`, When render, Then nu crash, afișează lista perioadelor
- **T-FISC-003-5** [normal] Given declarație cu payload gol, When render buton Download, Then buton dezactivat cu tooltip
- **T-FISC-003-6** [normal] Given dark mode activat, When pagina `/app/fin/tax`, Then zero culori hardcodate hex în UI

---

## Definition of Done

- PDF + CSV generate corect pentru TVA12-MD, D394-RO, D301-RO
- Ruta PATCH /file funcțională
- Pagina `/app/fin/tax` afișează perioadele + acțiuni
- T-FISC-003-1..4 verde (blocante)
- Design-system tokens, light+dark, WCAG AA
