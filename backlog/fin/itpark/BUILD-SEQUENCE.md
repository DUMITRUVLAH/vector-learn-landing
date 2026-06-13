# ITPARK — BUILD-SEQUENCE (driver pentru autopilot)

> Construiește **item cu item, testează item cu item** (TEST-SCENARIOS.md), dar **livrează o fază
> întreagă într-un singur PR** (§0.2). Nu trece la următorul item cu testele celui curent roșii —
> repară, nu sări.

## Secvența (în ordine, commit per item, PR per fază)

```
FAZA A  feat/ITPARK-faza-A-fundatie
  ITPARK-001  schema itpark.ts + migrare 0116 + index export   [migrare]
  ITPARK-002  nomenclator CAEM + seed listă oficială
  ITPARK-003  roluri + settings (prag 70%, toleranță)
  → gate fază: db:reset+seed OK, schema-drift verde, check-refs verde → PR

FAZA B  feat/ITPARK-faza-B-dosar
  ITPARK-101  Engagement CRUD (API + UI + listă)               [rută nouă → mount + test]
  ITPARK-102  wizard 3 pași + autocomplete IDNO
  → gate fază: live API smoke (login + /api/itpark/engagements 200) → PR

FAZA C  feat/ITPARK-faza-C-venit
  ITPARK-201  revenue lines CRUD + tabel editabil
  ITPARK-202  import lipire/CSV/din invoices
  ITPARK-203  auto-sugestie CAEM (determinist)
  → gate fază: import 96 linii test (Vector Academy) fără pierdere → PR

FAZA D  feat/ITPARK-faza-D-calcul
  ITPARK-301  motor total/cod + pondere + eligibil vs total
  ITPARK-302  Anexa 4 lunară + prag 70% + toleranță
  → gate fază: cifrele Vector Academy se reproduc (1.971.197,19 / 88,48%) → PR

FAZA E  feat/ITPARK-faza-E-anexe
  ITPARK-401  Anexa 2 live
  ITPARK-402  Anexa 3 live
  ITPARK-403  Anexa 4 live + gate consistență cross-anexă
  → gate fază: totaluri identice între cele 3 anexe → PR

FAZA F  feat/ITPARK-faza-F-scrisori
  ITPARK-501  5 scrisori de confirmare pre-completate
  ITPARK-502  declarație pe proprie răspundere
  → gate fază: scrisorile au datele rezidentului injectate corect → PR

FAZA G  feat/ITPARK-faza-G-export
  ITPARK-601  export PDF întreg pachet semnabil (diacritice)
  ITPARK-602  status „Ready" + checklist + audit + notificare
  → gate fază: PDF cu toate piesele, fără mojibake la ăâîșț → PR

FAZA H  feat/ITPARK-faza-H-ai-polish
  ITPARK-701  sugestie CAEM AI + OCR factură (accelerator)
  ITPARK-702  dashboard conformitate MITP
  → gate fază: AI doar propune; cifrele rămân deterministe → PR
```

## Reguli de migrare pentru această secvență
- Doar **ITPARK-001** adaugă migrare (`<N>_itpark_core.sql`, unde `N` = max idx pe `origin/main` + 1
  în momentul build-ului; azi probabil `0116` dacă EFMD e merged, sau `0115` dacă nu e). Restul
  item-urilor refolosesc schema. Dacă D/E cer coloane noi, generează migrarea în continuare (`N+1…`)
  pe branch-ul fazei respective, prefix > max pe `origin/main` în momentul build-ului.
- `--> statement-breakpoint` între statement-uri (§3.5.1).
- Orice fișier `server/db/schema/X.ts` nou → `export * from "./X"` în `index.ts` ACELAȘI commit.

## Date de test (fixture de aur)
Folosește **dosarul Vector Academy 2025** din PDF-urile furnizate ca fixture de validare end-to-end:
- 96 linii Anexa 3, total eligibile **1.971.197,19 MDL**, total vânzări **2.227.917,19 MDL**,
  pondere **88,48%**; pe coduri: `62.02` = 98.000,00 (4,40%), `85.59` = 1.873.197,19 (84,08%).
- Anexa 4: 12 luni, ian–nov pondere cumulativă 100%, decembrie 88,48%.
Dacă motorul reproduce EXACT aceste cifre din liniile importate → calculul e corect.
