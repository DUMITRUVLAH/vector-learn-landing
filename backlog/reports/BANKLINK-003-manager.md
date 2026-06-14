# BANKLINK-003 — Persona Manager Review

**Persona:** Andreea Mitran, director academiie, 6 locații, 1.400 studenți
**Feature:** Auto-match tranzacții bancare → reconciliere plăți/facturi
**Verdict:** BUY

## Ce îmi place

- Butonul "Auto-match" — un singur click și sistemul potrivește automat 80%+ din tranzacții cu facturile existente
- Coada de reconciliere cu scoruri procentuale — știu imediat cât de sigură e sugestia (100% = certitudine)
- Ignoră rapid comisioanele bancare fără să le validez manual
- Motor determinist (fără AI) — pot explica contabilei cum s-a potrivit o plată (audit trail clar)
- Candidații sugerate cu suma și data — confirm în 2 secunde, nu caut prin 200 facturi

## Fricțiune

- Voiam să văd în coada și tranzacțiile de debit (cheltuieli) pentru a le lega de facturi de furnizor. Momentan motorul ignoră debitele. (Feature pentru BANKLINK-004 eventual)
- Dacă lipsesc facturi din sistem (plăți directe fără factură emisă), nu găsesc candidați — normal, dar confuz pentru contabilă nouă

## Impact financiar

O lună are ~200 tranzacții. Cu auto-match 85% → 30 de manual reviews vs 200 manual azi.
Timp economisit: ~6h/lună × 12 = ~72h/an = 3 zile de lucru.

## Decizie

BUY — reconcilierea automată era missing feature #1 față de soluțiile enterprise. Acum o avem.
