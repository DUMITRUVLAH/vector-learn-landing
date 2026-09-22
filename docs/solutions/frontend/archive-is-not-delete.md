# „Fă curat în listă" nu înseamnă „șterge"

**Categorie:** frontend (produs) · **Data:** 2026-09-22 · **Cerut de:** o utilizatoare a aplicației

## Cererea
> „Nu puteam să finalizez această cerere, am renunțat la ea și am făcut alta de pe foaie curată. Ca
> urmare acest PAR nefinalizat a rămas ca «ciornă», care rămâne în toată lista cereri. Se poate de
> avut opțiunea de a face curat și elimina astea nefinalizate, care nu mai avem nevoie? Ele duc în
> eroare."

Tentația e să adaugi „Șterge". Într-o aplicație de cereri de plată, ștergerea e greșită: numărul
cererii e deja emis (PAR-2026-0007 nu se mai reemite), iar jurnalul unei cereri de bani nu se rupe.

## Soluția, și de ce arată așa
**Arhivare**: cererea iese din listele de lucru, intră într-o filă „Arhivate" și se poate readuce
oricând. Statusul NU se schimbă — o ciornă arhivată e tot o ciornă.

Trei decizii care nu se văd din cod la prima citire:

1. **Se arhivează doar ce stă pe loc** (ciornă, respinsă, anulată, plătită). O cerere aflată la
   aprobare sau la finanțe stă în lista ALTCUIVA: dacă autorul ar putea s-o ascundă, decizia
   celuilalt ar dispărea fără urmă. Răspunsul pe acele statusuri e 409 + ce are omul de făcut
   („retrage-o mai întâi").
2. **Arhiva ascunde doar cât timp cererea stă pe loc.** Dacă se mișcă pe altă cale (o plată anulată
   o întoarce la finanțe), reapare singură în lista de lucru. O cerere vie n-are voie să stea
   ascunsă într-o arhivă pe care n-o deschide nimeni.
3. **Trimiterea spre aprobare scoate cererea din arhivă.** Fără asta, o ciornă arhivată și apoi
   retrimisă ar fi rămas marcată arhivată tot drumul și ar fi dispărut tăcut fix când ajungea
   „plătită" — adică exact cererea la care ții s-ar fi ascuns la final. Există un test de regresie
   pentru fix cazul ăsta (`server/__tests__/par-archive.routes.test.ts`).

## Unde e starea
Coloană pe `par_requests` (`archived_at`, `archived_by_user_id`), nu eveniment de audit. Arhiva cozii
de finanțe (`server/lib/par/financeQueue.ts`) folosește evenimente — acolo e starea UNEI cozi, pe
câteva zeci de rânduri. Aici e starea cererii, pe lista principală: filtrarea și COUNT-ul trebuie să
stea în SQL, pe un index.

Contorul filei vine în ACELAȘI răspuns cu lista (`archived_total`), nu dintr-o a doua cerere — altfel
fiecare literă tastată în căutare ar fi adus încă o rundă la server.
