# Andreea Mitran — recenzie „Conturi de plată" (CONTPLATA-faza-1)

## Verdict: PASS (cu observații)

Cele 5 plângeri inițiale sunt rezolvate cu adevărat, nu doar cosmetic:
1. Numărul e automat (CP-2026-0051 etc.), cu opțiune manuală → 409 dacă e deja luat.
2. Previzualizarea merge (am văzut-o randată în editor, live).
3. Fișa clientului se completează dintr-o căutare peste clienți CRM + registrul de stat, cu contacte.
4. Poziții din catalogul CRM (cu stoc), plus serviciile refolosite din conturi anterioare; șabloane ca la PAR.
5. Ieșirea e PDF real (pdfmake, text vectorial, diacritice corecte), cu logo, rechizite complete, sumă în litere, 3 machete (modern/clasic/compact) și culoare de accent.

## Top 5 fricțiuni (ordonate)

1. **[major] Lista principală nu spune nimic despre bani reali** — cardul de sus arată doar „De încasat", dar am un cont de 0,00 MDL în listă (poziție fără preț completat) alături de conturi de 4.500 MDL. Ca director, dacă am 80 de conturi, vreau imediat: câte sunt restante peste termen (roșu), nu doar un total generic. Nu văd o coloană/filtru „întârziate".
2. **[major] „Emite și descarcă PDF" e un singur buton, fără pas de confirmare a numărului** — dacă apăs din greșeală, consum numărul din secvență (nu se poate anula ușor, un cont "Anulat" tot ocupă un număr). Pentru cineva time-poor care dă click rapid, asta creează dezordine în serie pe care contabilul o vede.
3. **[minor] Setările (logo, culoare, machetă) sunt separate de fluxul de emitere** — bine că există, dar aș vrea ca la primul cont emis, dacă rechizitele lipsesc (IBAN/Bancă — chiar am văzut avertismentul portocaliu), să fiu dusă direct acolo, nu doar avertizată pe pagina de setări.
4. **[minor] Nu văd unde se leagă un cont emis de o încasare reală** — owner-ul a exclus explicit asta din faza 1 (transformarea în plată confirmată din extras bancar), dar ca director asta e exact întrebarea mea după ce văd "9.000 MDL de încasat": cine mi-a plătit deja? Notă pentru faza următoare, nu blocant acum.
5. **[minor] Mențiunile pe cont / notele implicite** nu sunt pre-completate automat din setări în ecranul văzut (câmpul "Mențiuni pe cont" era gol) deși specul zice "texte implicite" configurabile — nu am putut verifica din capturi dacă chiar se aplică la un cont nou.

## Ce mi-a plăcut (LIKES)
- PDF-ul arată profesionist, ca un document pe care îl pot trimite unui client fără să mă rușinez — cele 3 machete sunt clar diferite, nu variații cosmetice.
- Căutarea unică de client (CRM + registrul de stat) e exact fluxul pe care îl foloseam manual în Excel — asta chiar economisește timp.
- Avertismentul de stoc ("În stoc sunt doar X — ceri Y") e util și nu blochează emiterea, ceea ce e corect pentru un centru care vinde și cursuri (fără stoc) și materiale (cu stoc).

## Ce nu mi-a plăcut (DISLIKES)
- Lipsa unei vederi de tip "cash-flow" (restante/scadente) pe lista principală.
- Riscul de a consuma numere din serie din greșeală, fără un pas de confirmare.

## Notă finală
Pentru banii pe care i-am cerut să fie rezolvați (numerotare, preview, date client, catalog, PDF personalizabil) — sunt rezolvați cu adevărat, cu dovadă în cod și în capturi, nu doar promisiune. Aș semna să trecem la faza următoare (legarea de încasare), dar aș cere înainte un filtru "restante" pe listă.
