---
title: Un concept — o denumire, o singură sursă de etichete
problem_type: ux / i18n
module: PAR (ParAdmin, ParDetail, importul Excel)
tags: [wording, romana, etichete, consecventa, admin]
symptoms: "același rol apare «Aprobator» într-un card și «Approver» în altul, pe același ecran"
severity: low
date: 2026-08-28
---

## Simptom

În „Administrare PAR", pe același ecran:

- rolurile aveau **trei** liste de etichete (`ROLE_OPTIONS`, `ROLE_LABELS`, `INVITE_ROLE_LABELS`),
  două în engleză → invitația spunea „Aprobator", tabelul de membri „Approver";
- „Plătitori" numea **două lucruri diferite**: organizația care ACHITĂ (`par_payers`) și registrul
  de beneficiari (`par_vendors`, titlu „Furnizori / Plătitori") — exact inversul;
- scopul cererii era „Executare plată" când o completai și „Execute payment" când o citeai
  (`ParDetail`), pentru că fiecare ecran își ținea propriul dicționar.

## Cauza reală

Etichetele au fost scrise acolo unde era nevoie de ele, nu într-un singur loc. Fiecare ecran nou
adăuga încă un dicționar; nimic nu semnala divergența, pentru că totul compila și testele nu se
uită la cuvinte.

## Regula

> O noțiune are o singură denumire în produs și o singură constantă care o produce. Dacă scrii un
> `Record<..., string>` cu etichete, întâi caută dacă nu există deja unul.

Corolar de vocabular pentru PAR (ușor de încurcat, ambele apar în aceeași cerere):
**plătitor = organizația noastră care plătește** (`par_payers`); **beneficiar/furnizor = cine
primește banii** (`par_vendors`). Nu folosi „plătitor" pentru al doilea.

## Capcana înrudită: configurare care nu se poate potrivi niciodată

Constructorul de reguli DOA oferea condiția „Charge To = Operations / Other", dar formularul de
cerere trimite ÎNTOTDEAUNA `charge_to: "program"` (câmpul nici nu e expus). O regulă pe altă
valoare nu s-ar fi aplicat nicicând, fără niciun mesaj. Acum selectul o spune pe loc.

> Când un filtru de configurare citește un câmp pe care produsul nu îl variază, ori scoate
> filtrul, ori spune-i utilizatorului că nu se va aplica. Tăcerea e cea mai scumpă variantă.

## Verificare rapidă la următoarea schimbare de UI

`grep -rn "Record<.*string> = {" src/pages/<modul>` — dacă apar două dicționare pentru aceeași
noțiune, e deja un bug de consecvență, chiar dacă nimeni nu l-a raportat încă.
