# „Mereu mă întreabă de la ultimul PAR când fac refresh"

**Categorie:** frontend / UX · **Data:** 2026-08-31 · **Raportat de:** owner (FinFlow prod)

## Simptom
Popup-ul „Cum a prestat <furnizor>?" apărea pe tabloul de bord PAR la **fiecare** reîncărcare de
pagină, cu aceeași cerere plătită. Închideai — revenea. Ar fi trebuit să întrebe o singură dată.

## Cauza reală
Două, iar repararea doar a primeia n-ar fi rezolvat nimic vizibil:

1. **Urma se scria pe o singură cale de ieșire.** `PendingRatingPrompt` chema `snooze(parId)` doar
   din `onDismiss`, adică din butonul „Mai târziu". Dialogul se mai putea închide însă cu X, cu Esc
   și cu clic pe fundal — toate trei trec prin `onClose`, care nu scria nimic. Deci gestul cel mai
   natural (X) lăsa starea neatinsă și următorul `useEffect` de la montare redeschidea același
   popup.
2. **Fără plafon pe zi, „o dată per cerere" tot înseamnă un popup la fiecare refresh.** Serverul
   întoarce cele mai recente 10 cereri plătite neevaluate. Un tenant cu zeci de plăți ar fi primit
   altă cerere la fiecare încărcare — pentru om, exact aceeași hărțuire.

## Regula (`src/lib/par/ratingPrompt.ts`)
O întrebare per cerere, o singură dată, **și cel mult una pe zi**. Urma se scrie **în momentul
deschiderii**, nu la închidere: altfel un refresh cu dialogul pe ecran șterge dovada că omul a fost
deja întrebat. Ce rămâne neevaluat nu se pierde — fișa furnizorului are „de evaluat" + „Evaluează".

## Lecția generalizabilă
**Orice fereastră care se autodeschide trebuie să-și noteze apariția când apare, nu când e închisă
„cum trebuie".** Un dialog are întotdeauna mai multe ieșiri decât butoanele lui (X, Esc, fundal,
tasta Back, un refresh la mijloc). Dacă starea „l-am văzut" atârnă de o singură ieșire, restul devin
o buclă. Și dacă lista de candidați are mai mult de un element, „o dată per element" nu e suficient
fără o pauză globală între apariții.

## Regresia care o prinde
- `src/lib/par/__tests__/ratingPrompt.test.ts` — regulile pure (refresh la 5 secunde, a doua cerere,
  ceas dat înapoi, plafonul de memorie, cheia veche de amânare).
- `src/__tests__/par/pending-rating-prompt.test.tsx` — gestul real: închidere cu **X**, remontare
  („refresh"), dialogul NU mai apare. Ambele pică pe codul dinainte (verificat), trec pe cel de acum.
