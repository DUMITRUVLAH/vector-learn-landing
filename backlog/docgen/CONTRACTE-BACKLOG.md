# CONTRACTE & DOCUMENTE — de la „modul de acte" la managementul contractelor

> **Sursa:** două runde de întrebări cu owner-ul (2026-08-31, răspunsuri pe voce). Continuă
> `DOCGEN-BACKLOG.md` (fazele DG-101…DG-124, livrate), dar schimbă direcția: actele nu mai sunt un
> modul lateral, ci **inima** dintre furnizor → contract → cerere de plată.
>
> O fază = un branch = un PR (§0.2). Livrare direct pe `main` după gate-uri (§0.2bis).

---

## 1. Ce a cerut owner-ul, în cuvintele lui

> „Chiar tool-ul ăsta trebuie să fie ca un contract management. […] Când merg la un prestator, vreau
> să văd toate contractele, toate documentele făcute cu el. […] Când facem o cerere de plată, trebuie
> să avem un contract. Dacă facem contractul aici, cu anexă, putem spune «transformă în PAR» și se ia
> tot: rechizitele, serviciul, proiectul. […] PDF-ul e groaznic, parcă e un fișier HTML — Word-ul e
> ok. […] Dacă nu e completat un câmp, să apară o întrebare, iar în document să nu rămână tag-ul."

## 2. Diagnostic — de ce se întâmplă cele trei lucruri reclamate

| Reclamația | Cauza mecanică | Fișier |
|---|---|---|
| „Se deschide sidebarul cu toate modulele și sare pagina" | Meniul se alege după prefixul rutei: PAR-ul are meniul lui doar pe `/business/par/*`, iar actele stau pe `/business/docs` → alt prefix, alt meniu | `src/components/business/BusinessShell.tsx` (`useParNav`) |
| „PDF-ul e ca un HTML" | Pe Vercel nu există chromium, deci PDF-ul se face în browser cu html2canvas: o **poză JPEG** tăiată la 297 mm, fără text selectabil | `src/lib/docs/documentPdfClient.ts` |
| „Rămân tag-urile în document" | Randarea lasă intenționat `{{tag}}` nerezolvat vizibil în ieșire | `server/lib/docmerge/placeholders.ts:41` |

## 3. Deciziile owner-ului (contractul acestui backlog — nu se re-discută)

1. **Actele intră în modulul PAR.** Rută canonică `/business/par/documente/*`; meniul PAR rămâne pe ecran.
2. **O singură intrare în meniu: „Documente".** Nu „Acte" + „Șabloane" separat — șabloanele sunt o filă în pagină.
3. **PDF-ul trebuie să arate ca Word-ul.** 2–4 secunde de generare sunt acceptabile; peste — nu.
4. **Câmp necompletat = linie `__________`,** niciodată `{{tag}}`.
5. **Pop-up de confirmare la export** cu lista a ce lipsește; „Generează oricum" rămâne disponibil.
6. **IBAN-ul intră în lista obligatorie,** dar lipsa lui întreabă, nu blochează.
7. **Import Word (.docx) → șablon editabil în aplicație.** Owner-ul a ales explicit editarea în aplicație (varianta a), nu păstrarea fișierului original intact.
8. **AI-ul detectează câmpurile la import** și le propune ca `{{...}}`; omul confirmă.
9. **Catalog de câmpuri extensibil:** platforma livrează un set, dar orice organizație își adaugă propriile câmpuri, pentru orice tip de document (nu doar pentru furnizori).
10. **Limbi: RO + EN** deocamdată (rusa nu e cerută).
11. **Contractul are valabilitate și tranșe;** sistemul dă memento la scadență.
12. **Fără blocaje pe bani:** „nu există contract pentru asta" și „depășește suma contractată" sunt **avertismente**.
13. **Oricine poate crea contracte și șabloane proprii.** Management (= administrator PAR sau finanțe) le vede pe toate; un șablon propriu poate fi partajat punctual cu alte persoane sau publicat pentru toată organizația.
14. **Vizibilitate implicită: ale mele.** Doi colegi pe același proiect, cu același furnizor, nu-și văd reciproc contractele. Managementul vede tot și poate ridica pragul de transparență dintr-o setare.
15. **O singură listă de documente,** cu etichete și filtre, care conține și fișiere încărcate manual: acorduri vechi, oferte primite pe email, certificate.
16. **Fișierul încărcat cere doar furnizorul;** proiectul și restul sunt opționale.
17. **AI-ul citește fișierul încărcat** (părți, sumă, dată, valabilitate) și completează fișa; omul poate corecta.
18. **După semnare, se încarcă scanul** și actul trece în starea „semnat"; memento dacă scanul lipsește. Semnătura electronică (MSign) rămâne pe mai târziu.
19. **Direcția „noi încasăm" (contracte în care suntem prestatorul) NU intră acum.**
20. **Alertele de expirare/consum de contract nu sunt prioritare** (întrebarea 12, runda 2: „irelevant").

## 4. Fazele

### Faza 1 — Locul unic și cele trei reclamații ✅ LIVRATĂ pe `main` (2026-08-31, verificată pe producție)

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-101` | Documentele intră în PAR, cu o singură intrare în meniu | Rute noi `/business/par/documente[/nou|/sabloane|/:id|/proiect/:id|/contraparte/:id]`; `/business/docs/*` redirecționează (linkurile vechi din email nu mor); meniul PAR rămâne montat la navigare (fără schimb de sidebar); șabloanele devin filă în pagină, nu rând în meniu; toate `navigate(...)` trec printr-un helper unic de căi. |
| `DC-102` | PDF ca un act, nu ca o poză | Generator vectorial din același model ca previzualizarea: text selectabil, diacritice, tabel care se rupe corect, antet cu organizația, subsol cu numărul actului + „pagina X din Y". Fără chromium pe calea de producție. Test: primii octeți `%PDF`, textul se extrage din PDF (nu e imagine), timp < 4s. |
| `DC-103` | Niciun `{{tag}}` în documentul livrat | Câmpurile nerezolvate devin linie de completat; pop-up înainte de export/finalizare cu lista exactă a lipsurilor (etichete în română, nu nume tehnice); IBAN-ul lipsă apare în listă; „Generează oricum" continuă exportul. |

### Faza 2 — Biblioteca: tot ce ține de un furnizor, într-un loc

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-104` | Încărcare de documente în registru | Fișier (PDF/Word/imagine) → intrare în aceeași listă, cu etichetă de tip; furnizor obligatoriu, proiect/sumă/perioadă opționale; stocare în Supabase Storage (bucket privat, URL semnat), nu base64 în DB. |
| `DC-105` | AI-ul completează fișa fișierului încărcat | Reutilizează extractorul de la cererile de plată: părți, sumă, dată, valabilitate; câmpurile rămân editabile, cu marcaj „completat de AI". |
| `DC-106` | Etichete și filtre | Set livrat: contract, act adițional, act de primire-predare, proces-verbal, ofertă, factură, certificat/licență, corespondență, altul; organizația își adaugă etichete proprii; filtre combinabile pe tip, furnizor, proiect, stare, perioadă, sursă (generat / încărcat). |
| `DC-107` | Ofertele-fișier se leagă de ofertele furnizorului | O ofertă încărcată devine și înregistrare de preț în fișa furnizorului (sumă, dată, obiect), ca să intre în comparația de prețuri. |

### Faza 3 — Șabloane: import din Word, câmpuri proprii

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-108` | Import `.docx` → șablon editabil | Titluri, liste, tabele, bold/italic/subliniat, aliniere; curățare de stiluri toxice; documentul importat se editează imediat în editorul din aplicație. |
| `DC-109` | AI-ul propune câmpurile | La import, AI-ul marchează denumirile părților, IDNO, IBAN, sume, date, obiectul contractului și propune `{{...}}`; omul acceptă/respinge fiecare propunere. |
| `DC-110` | Câmpuri proprii ale organizației | Catalog extensibil (nume, etichetă, tip, valoare implicită, sursă); câmpurile proprii apar în editor lângă cele de sistem și în formularul de completare. |
| `DC-111` | Export Word real (`.docx`) | Din același model ca PDF-ul, ca cele două fișiere să nu difere; înlocuiește HTML-ul servit ca `.doc`. |
| `DC-112` | Șabloane personale, partajate, publicate | Implicit personale (vizibile mie + management); partajare punctuală cu persoane; publicare pentru toată organizația (management). |

### Faza 4 — Contractul viu

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-113` | Valabilitate + tranșe de plată | Perioada contractului și graficul (avans/rest, procent sau sumă, scadență); restul de plată se calculează din PAR-urile legate. |
| `DC-114` | Memento la scadență și la lipsa scanului | Notificare către autor + finanțe când vine tranșa; memento „încarcă contractul semnat" dacă lipsește scanul. |
| `DC-115` | Avertismente la cererea de plată | La crearea PAR-ului: „nu există contract pentru acest furnizor/proiect" și „suma depășește ce a mai rămas pe contract" — avertisment vizibil, niciodată blocaj. |
| `DC-116` | Starea „semnat" | Încărcarea scanului semnat trece actul în „semnat"; scanul devine documentul oficial în dosar; jurnal complet. |

### Faza 5 — Cine ce vede

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-117` | Implicit: documentele mele | Autorul își vede documentele; management (administrator PAR / finanțe) vede tot; testul cheie: doi colegi pe același proiect, același furnizor, nu se văd reciproc. |
| `DC-118` | Partajare punctuală | Un document sau un șablon se împarte cu persoane numite; apare la ele cu marcaj „partajat de X". |
| `DC-119` | Comutator de transparență | Setare de organizație: „toată lumea vede tot" / „doar ale mele" / „pe proiect". |

### Faza 6 — Fișa furnizorului, completă

| ID | Titlu | Criterii cheie |
|----|-------|----------------|
| `DC-120` | Toate documentele în fișa furnizorului | O singură listă: acte generate + fișiere încărcate, cu etichetă de sursă; filtrele din registru funcționează și aici. |
| `DC-121` | Contractat vs. plătit, per furnizor și proiect | Total contractat, total plătit din PAR-uri executate, rest — pe valute separate, fără adunări false. |

## 4bis. Backlog descoperit în Faza 1 (nu s-a construit acum)

- **Formularul PAR se tipărește tot ca poză** (`src/lib/parPdf.ts` folosește html2canvas + jsPDF, ca
  actele înainte de DC-102). Aceeași reparație se poate refolosi: generatorul vectorial există deja.
  Bonus: html2canvas iese din pachetul frontend (592 KB necomprimat azi).
- **Exportul „pentru Word" e HTML servit ca `.doc`.** Arată bine, dar nu e `.docx` nativ — vezi DC-111.
- Editorul de șabloane încarcă TipTap (356 KB) pe ruta lui; de urmărit când se adaugă importul Word.

## 5. Ce NU se construiește (decis explicit)

- Contractele în care noi suntem prestatorul și așteptăm încasarea (direcția FinDesk).
- Alerte de expirare a contractului și de consum al plafonului.
- Semnătură electronică calificată (MSign/MConnect) și portal extern pentru contraparte.
- Negociere/redlining pe versiuni între părți.
- Șabloane bilingve în același document (RO și EN rămân șabloane separate).

## 6. Poarta de calitate (§3.5.1quater — se testează ACȚIUNEA)

Pentru fiecare item, testul care contează invocă acțiunea, nu verifică doar că butonul există:
- PDF-ul descărcat conține **text extractibil** (dovada că nu e o poză) și numărul actului;
- un act cu câmpuri lipsă exportat cu „Generează oricum" **nu conține `{{`** nicăieri;
- fișierul încărcat apare în listă și în fișa furnizorului, cu URL semnat care chiar deschide fișierul;
- documentul unui coleg **nu apare** în lista mea (403/404), dar apare la administratorul PAR;
- `npm run e2e` după fiecare item, `npm run e2e:browser` înainte de commit.
