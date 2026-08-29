---
title: Ghilimelele românești într-un șir JS rup fișierul — și orbesc poarta
category: build-errors
symptoms:
  - „Unterminated string constant" / „Unexpected token" într-un fișier care arată corect
  - vitest raportează „N tests skipped" în loc de eșec clar
  - check-undefined-refs spune ✅, dar aplicația crapă la rulare cu ReferenceError
---

## Ce s-a întâmplat

Un mesaj scris pentru om conținea ghilimele românești în interiorul unui șir delimitat cu `"`:

```ts
message: "Actul nu are PDF. Apasă „Descarcă PDF" o dată, apoi trimite.",
//                                             ^ aici se închide șirul
```

`”` (ghilimeaua de închidere românească) e un caracter diferit de `"`, dar cea de deschidere `„`
nu e — în textul lipit din chat apărea un `"` obișnuit, care a închis șirul. Fișierul a devenit
nevalid sintactic.

**Partea periculoasă nu e eroarea, ci ce ascunde ea.** `scripts/check-undefined-refs.mjs` filtra
DOAR `TS2304/TS2552`. Când `tsc` nu poate parsa un fișier, nu mai raportează deloc erori de tip
pentru el — deci poarta a spus „✅ fără referințe nedefinite" pentru un fișier care nici măcar nu se
compila, iar un import lipsă (`parVendors`) a trecut nedetectat până a dat 500 în teste.

La fel, `vitest` a raportat „4 tests skipped" în loc de un eșec: fișierul de test nu s-a putut
încărca, iar la o citire rapidă „skipped" pare inofensiv.

## Reparat

`check-undefined-refs` gatează acum și pe codurile de sintaxă (TS1002/1005/1128/1160/1381…), cu un
mesaj care numește cauza frecventă. Un fișier care nu se parsează oricum nu se poate construi, deci
gatearea nu blochează nimic legitim — în schimb repară orbirea.

## Regula

1. **În șirurile din cod nu se pun ghilimele tipografice.** Pentru text către utilizator:
   `«…»`, apostrof simplu, sau reformulare („Descarcă PDF-ul o dată" în loc de citarea butonului).
2. **„Skipped" într-un raport de teste nu e o știre bună** — verifică de ce; de obicei fișierul nu
   s-a încărcat.
3. **O poartă care poate deveni oarbă nu e o poartă.** Când filtrezi un subset de erori, adaugă și
   condițiile în care restul filtrului nu mai are ce vedea.
