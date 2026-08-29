# DOCGEN — Ce se întâmplă când apeși, ce valoare aduce, ce testăm

> Companion la [`DOCGEN-BACKLOG.md`](./DOCGEN-BACKLOG.md). Pentru fiecare item: **valoarea**
> (rezultatul măsurabil, nu funcționalitatea), **fluxul** (click cu click, inclusiv ce face serverul)
> și **testele** în format `- **T-DG-xxx-N** [blocant|normal] Given …, When …, Then …`.
>
> `[blocant]` = item-ul nu se închide dacă pică (CLAUDE.md §0.2). Regula §3.5.1quater: testul
> **invocă acțiunea** (200 + forma răspunsului), nu verifică doar că butonul se randează.
> Fiecare item de backend are obligatoriu: migration gate, live-API smoke, izolare de tenant.

---

## Faza 1 — Fundația: registrul de acte

### DG-101 — Schema documentelor + migrare + heal

**Valoarea:** actele încetează să fie fișiere pe desktopul cuiva. Din momentul acesta orice act are
un rând în bază, cu proiect, contraparte, sumă și stare — deci poate fi căutat, numărat și legat de
un PAR. Fără el, restul modulului n-are unde să scrie.

**Fluxul (nu are UI — e fundația):** `db:generate` produce `0151_docgen.sql` → `db:migrate` creează
tabelele local → la deploy, `vercel-migrate.mjs` rulează migrarea pe Supabase, iar `sync-schema.ts`
creează oricum tabelele lipsă (prod-ul nu aplică fiabil migrări) → `db.query.docDocuments` devine
disponibil pentru rute.

- **T-DG-101-1** [blocant] Given schema `docs.ts` cu cele 5 tabele + extensiile pe `docmerge_templates`, When `npm run db:generate`, Then nu rămâne nicio migrare necommitted, iar prefixul e `0151` (> max pe `origin/main` = `0150`).
- **T-DG-101-2** [blocant] Given migrarea committed, When `npm run db:reset && npm run db:seed`, Then trec fără eroare (fără 42601 „multiple commands" — `--> statement-breakpoint` între statements).
- **T-DG-101-3** [blocant] Given `server/db/schema/index.ts`, Then conține `export * from "./docs"` — altfel `db.query.docDocuments` e `undefined` la runtime și orice rută dă 500.
- **T-DG-101-4** [blocant] Given o bază fără tabelele noi (simulare prod înaintea migrării), When pornește serverul, Then `sync-schema` le creează din `ENSURE_STATEMENTS` și `GET /api/docs/documents` întoarce 200 cu listă goală, nu 500 „relation does not exist".
- **T-DG-101-5** [blocant] `schema-drift.test.ts` rămâne verde: fiecare coloană declarată în schemă e creată de migrare (și invers).
- **T-DG-101-6** [normal] Given două documente ale aceluiași tenant cu același `kind`+`year`, Then constrângerea de unicitate pe `(tenant_id, kind, year, doc_number)` interzice duplicatul.

### DG-102 — API documente: creare, editare, finalizare, anulare

**Valoarea:** un act finalizat devine o probă, nu o ciornă editabilă la nesfârșit. Contabila poate
răspunde „actul nr. ACT-2026-0007 din 12 martie, semnat, 24.500 MDL, proiectul X" fără să caute prin
email, iar nimeni nu poate schimba discret conținutul după semnare.

**Fluxul:** utilizatorul apasă **Act nou** → `POST /api/docs/documents` cu `templateId` + context →
serverul randează corpul din șablon (`renderWithContext`), salvează ca `ciornă`, întoarce id-ul →
utilizatorul completează și salvează (`PUT`, doar pe ciorne) → apasă **Finalizează** →
`POST /:id/finalize`: serverul verifică obligatoriile, rezervă numărul, îngheață snapshotul
rechizitelor, calculează `body_hash`, trece în `finalizat` → orice `PUT` ulterior primește **409** cu
„actul e finalizat; anulează-l și emite altul". **Anulează** cere motiv și păstrează actul vizibil,
tăiat, în registru.

- **T-DG-102-1** [blocant] Given un șablon și un context complet, When `POST /api/docs/documents`, Then 201 cu `{id, status:"draft", bodyHtml}` iar `bodyHtml` NU mai conține `{{`.
- **T-DG-102-2** [blocant] Given o ciornă, When `POST /:id/finalize`, Then 200, `status:"final"`, `docNumber` nenul, `bodyHash` de 64 hex.
- **T-DG-102-3** [blocant] Given un document finalizat, When `PUT /:id`, Then **409** (imutabilitate) și corpul rămâne neschimbat în bază.
- **T-DG-102-4** [blocant] Given un document al altui tenant, When `GET /:id`, Then 404 — niciodată 200.
- **T-DG-102-5** [blocant] Live-API smoke: login real → `POST` document → `finalize` → `GET` listă → toate 200, documentul apare în listă.
- **T-DG-102-6** [blocant] Ruta e montată în `app.ts` (`check-route-mounts.mjs` verde) — altfel pagina crapă pe `JSON.parse('<!doctype…')`.
- **T-DG-102-7** [blocant] Portabilitate DB: zero `db.execute(...).rows`; aceleași rezultate pe PGlite și Postgres.
- **T-DG-102-8** [normal] Given un document anulat, When `GET` listă cu filtrul „active", Then nu apare; cu filtrul „toate", apare cu motivul anulării.

### DG-103 — Pagina „Acte"

**Valoarea:** locul unic unde se face și se găsește un act. Întrebarea „ce acte am pe proiectul X"
capătă răspuns în 5 secunde, în loc de o căutare prin foldere.

**Fluxul:** meniu → **Acte** → lista (număr, dată, tip, contraparte, proiect, sumă, stare) cu filtre
și căutare → **Act nou** deschide alegerea șablonului → click pe un rând deschide actul → butoanele
PDF / Duplică / Anulează. Filtrele se reflectă în URL, deci link-ul poate fi trimis colegului.

- **T-DG-103-1** [blocant] Given ruta `/business/docs`, When se randează cu API mock, Then apare fără crash, iar rândurile afișează numărul și starea.
- **T-DG-103-2** [blocant] Given browser real logat (e2e), When se deschide `/business/docs`, Then URL-ul final e cel cerut (nu redirect la login) și nu apare text de eroare.
- **T-DG-103-3** [normal] Given filtrul „proiect = X", When se aplică, Then cererea către API conține `projectId` iar lista arată doar actele proiectului.
- **T-DG-103-4** [normal] Given lista goală, Then apare un gol explicit („niciun act încă") cu butonul de creare, nu un tabel gol fără context.
- **T-DG-103-5** [normal] A11y: fiecare buton cu iconiță are `aria-label`, țintele ≥44px, contrast OK în light și dark.

---

## Faza 2 — Editorul de șabloane

### DG-104 — Editor WYSIWYG

**Valoarea:** juristul organizației își scrie propriile formulări fără să ceară ajutor și fără să
vadă HTML. Dispare dependența „mai întâi trimit textul cuiva care știe".

**Fluxul:** **Șabloane → Șablon nou** → editor cu bară de instrumente (bold, titluri, liste, tabel,
aliniere, întrerupere de pagină) → lipești textul din Word și se curăță singur → **Salvează** →
serverul sanitizează, extrage câmpurile și creează versiunea 1.

- **T-DG-104-1** [blocant] Given text lipit din Word cu `style=`/`<o:p>`, When se lipește, Then rămâne structura (titluri, liste, tabel) și dispar stilurile inline toxice.
- **T-DG-104-2** [blocant] Given corp cu `<script>alert(1)</script>` și `<img onerror=…>`, When se salvează, Then serverul sanitizează; corpul stocat nu conține `script` sau `on*=` (test explicit de XSS).
- **T-DG-104-3** [blocant] Given ruta editorului, When build, Then TipTap e încărcat lazy — bundle-ul rutelor existente nu crește (bugetul de 100 KB rămâne respectat).
- **T-DG-104-4** [normal] Given editare + anulare (Ctrl+Z), Then conținutul revine; Given „vedere sursă", Then se poate corecta HTML direct.

### DG-105 — Inserare câmpuri cu „/"

**Valoarea:** cel care scrie șablonul nu învață nicio sintaxă. Dispar erorile de tipul `{{iban}}` vs
`{{contraparte.iban}}` care se descoperă abia pe PDF-ul semnat.

**Fluxul:** tastezi `/` → apare lista de câmpuri (căutabilă, grupată) → alegi „IBAN contraparte" →
în text apare un cip colorat `IBAN contraparte` → la salvare devine `{{contraparte.iban}}` →
panoul lateral arată toate câmpurile șablonului și pe cele nefolosite.

- **T-DG-105-1** [blocant] Given un cip inserat, When se salvează, Then corpul conține exact `{{contraparte.iban}}` și `renderWithContext` îl completează corect.
- **T-DG-105-2** [blocant] Given un cip șters cu Backspace, Then dispare întreg (nu rămâne `{{contraparte.` în text).
- **T-DG-105-3** [normal] Given `/` urmat de „iban", Then lista filtrează la câmpurile care conțin „iban", inclusiv cele ale organizației noastre.

### DG-106 — Biblioteca de șabloane standard

**Valoarea:** organizația pornește cu 11 acte gata scrise în română, nu cu o pagină goală. Primul act
util iese în ziua instalării, nu peste o lună.

**Fluxul:** **Șabloane** arată biblioteca (marcată „standard") → **Folosește** creează actul direct;
**Clonează** face o copie editabilă a organizației. Șabloanele de sistem nu se pot șterge sau strica.

- **T-DG-106-1** [blocant] Given seed-ul, Then există ≥11 șabloane `is_system=true`, inclusiv „Act de primire-predare", cu câmpurile ambelor părți și blocul de semnături.
- **T-DG-106-2** [blocant] Given un șablon de sistem, When `DELETE`/`PUT`, Then 403; When „Clonează", Then apare o copie editabilă a tenantului.
- **T-DG-106-3** [blocant] Given „Act de primire-predare" + un furnizor real, When se generează, Then PDF-ul conține IDNO, IBAN, banca ambelor părți și tabelul de poziții.
- **T-DG-106-4** [normal] Diacriticele românești apar corect în PDF (ș, ț, ă, î, â), nu ca pătrate.

### DG-107 — Versionare + previzualizare

**Valoarea:** modificarea unui șablon nu rescrie retroactiv actele deja semnate. Poți corecta o
formulare fără frica de „am stricat contractele de anul trecut".

**Fluxul:** fiecare salvare → versiune nouă; documentele existente rămân legate de versiunea lor →
**Previzualizează** randează cu date de test sau cu un furnizor real ales din listă → **Istoric**
arată versiunile și permite revenirea.

- **T-DG-107-1** [blocant] Given un document generat cu v1, When șablonul devine v2, Then documentul păstrează `template_version=1` și corpul lui nu se schimbă.
- **T-DG-107-2** [blocant] Given „Previzualizează cu furnizorul X", Then câmpurile `contraparte.*` sunt completate cu rechizitele reale ale lui X.
- **T-DG-107-3** [normal] Given revenirea la v1, Then se creează v3 identică cu v1 (nu se șterge istoricul).

---

## Faza 3 — Completarea cu date reale

### DG-108 — Catalogul de câmpuri + rezolverul

**Valoarea:** aceleași date, o singură sursă. Rechizitele se scriu o dată în registru și apar corect
în toate actele — inclusiv suma în litere, care azi se scrie de mână și se greșește.

**Fluxul (invizibil, dar cel mai important):** la randare, fiecare `{{grup.câmp}}` e rezolvat din
`par_payers`/`par_settings` (noi), `par_vendors`/`fin_parties` (contrapartea), `par_projects`,
`par_events`, totaluri (inclusiv `amountInWords`). Un câmp nerezolvat NU ajunge ca `{{…}}` în PDF —
apare în lista de „câmpuri lipsă" înainte de finalizare.

- **T-DG-108-1** [blocant] Given un furnizor cu toate rechizitele, When se randează, Then `{{contraparte.iban}}`, `.idno`, `.banca`, `.bic`, `.adresa`, `.administrator` sunt completate din `par_vendors`.
- **T-DG-108-2** [blocant] Given total 24500.00 MDL, Then `{{total.in_litere}}` = „douăzeci și patru de mii cinci sute lei 00 bani" (reuse `amountInWords`).
- **T-DG-108-3** [blocant] Given un câmp fără valoare, When se cere finalizarea, Then 400 cu lista câmpurilor lipsă; PDF-ul nu conține niciodată `{{`.
- **T-DG-108-4** [normal] Datele se formatează RO (`12.03.2026`), sumele cu separator de mii și 2 zecimale.

### DG-109 — Formularul generat din șablon

**Valoarea:** completarea unui act ia sub 2 minute și nu cere retastarea niciunui rechizit — JTBD-1
și JTBD-2 devin adevărate.

**Fluxul:** alegi șablonul → formularul se construiește singur din câmpurile lui → scrii 2 litere din
numele furnizorului → alegi din listă → **toate rechizitele se completează dintr-o dată** → alegi
proiectul (și evenimentul) → adaugi pozițiile în tabel (denumire, UM, cantitate, preț) → totalul și
suma în litere se calculează live → ciorna se salvează singură.

- **T-DG-109-1** [blocant] Given un șablon cu 12 câmpuri, When se deschide formularul, Then apar exact acele câmpuri, cu etichete în română și cele obligatorii marcate.
- **T-DG-109-2** [blocant] Given selectarea furnizorului X, Then câmpurile de rechizite se populează din API într-o singură cerere și rămân editabile (excepții punctuale).
- **T-DG-109-3** [blocant] Given 3 poziții, Then totalul e calculat **pe server** la salvare (nu se acceptă total trimis de client).
- **T-DG-109-4** [normal] Given închiderea paginii la jumătate, When se revine, Then ciorna e acolo (auto-save).

### DG-110 — Contraparte nouă fără să ieși din act

**Valoarea:** un furnizor nou nu mai oprește lucrul. Rechizitele lipite dintr-un email devin câmpuri
corecte, iar firma e verificată în registru înainte să semnezi cu ea.

**Fluxul:** în selectorul de contraparte → **Adaugă furnizor** → lipești blocul de rechizite din
email → `splitBankRequisites` îl desparte în denumire/IDNO/IBAN/bancă/BIC → introduci IDNO-ul →
verificare în registru → completează adresa, forma juridică, statutul; dacă firma e inactivă, apare
un avertisment (nu blocaj) → salvare în `par_vendors` → actul continuă cu furnizorul selectat.

- **T-DG-110-1** [blocant] Given un bloc de rechizite lipit, When se despică, Then IBAN-ul și codul fiscal ajung în câmpurile corecte (test cu 3 formate reale de email).
- **T-DG-110-2** [blocant] Given IDNO valid, When se verifică în registru, Then câmpurile se completează; Given registrul indisponibil, Then se poate salva manual (indisponibil ≠ inexistent).
- **T-DG-110-3** [blocant] Furnizorul creat apare imediat în `par_vendors` și e refolosibil în PAR (aceeași sursă, nu un registru paralel).
- **T-DG-110-4** [normal] Firmă cu statut inactiv → avertisment vizibil, salvarea rămâne posibilă.

### DG-111 — Validarea înainte de finalizare

**Valoarea:** actele greșite se opresc înainte de semnare, nu după. Un IBAN greșit prins aici costă
30 de secunde; prins după plată, costă un transfer returnat.

**Fluxul:** **Finalizează** → serverul validează (IBAN mod-97, IDNO 13 cifre pentru MD, sumă > 0, cel
puțin o poziție, rechizitele ambelor părți, câmpuri obligatorii) → dacă ceva lipsește, apare o listă
cu link direct la fiecare câmp → repari → finalizezi.

- **T-DG-111-1** [blocant] Given IBAN cu checksum greșit, When finalize, Then 400 cu mesaj despre IBAN, actul rămâne ciornă.
- **T-DG-111-2** [blocant] Given zero poziții, When finalize, Then 400; Given sumă 0, Then 400.
- **T-DG-111-3** [blocant] Given toate corecte, When finalize, Then 200 și starea devine `final`.
- **T-DG-111-4** [normal] Mesajele sunt în română, spun ce câmp și de ce, nu „validation error".

---

## Faza 4 — PDF, numerotare, semnături

### DG-112 — PDF-ul actului

**Valoarea:** documentul care ajunge la contraparte arată ca un act al organizației (antet, logo,
numerotare), nu ca o pagină web tipărită.

**Fluxul:** **Descarcă PDF** → serverul randează corpul cu Playwright → A4, antet cu logo, subsol cu
numărul actului și „pagina X din Y" → fișierul se stochează și se servește de acolo la descărcările
următoare (actul descărcat peste un an arată identic cu cel semnat).

- **T-DG-112-1** [blocant] Given un act finalizat, When `GET /:id/pdf`, Then 200 și primii octeți sunt `%PDF`.
- **T-DG-112-2** [blocant] Given chromium indisponibil, Then se întoarce HTML descărcabil cu mesaj explicit, nu 500.
- **T-DG-112-3** [blocant] Given două descărcări la distanță de timp, Then octeții sunt identici (PDF stocat, nu re-randat).
- **T-DG-112-4** [normal] Given 25 de poziții, Then tabelul se rupe pe pagini cu antetul repetat, iar blocul de semnături nu rămâne singur pe ultima pagină.

### DG-113 — Numerotarea

**Valoarea:** registrul de acte are numere unice, în ordine, fără să le țină cineva minte — condiție
de bază pentru orice control (auditor, donator, fisc).

**Fluxul:** **Finalizează** → serverul rezervă tranzacțional următorul număr pentru tipul și anul
respectiv → `ACT-2026-0007`. Ciornele nu consumă numere. Formatul și resetarea anuală se configurează
în setări.

- **T-DG-113-1** [blocant] Given două finalizări simultane, Then numerele sunt distincte și consecutive (test de concurență, fără duplicat).
- **T-DG-113-2** [blocant] Given o ciornă ștearsă, Then nu s-a consumat niciun număr (fără găuri).
- **T-DG-113-3** [blocant] Given anul nou și resetarea activă, Then numerotarea repornește de la 0001 cu anul corect.
- **T-DG-113-4** [normal] Given formatul schimbat în setări, Then actele noi îl respectă, cele vechi rămân cu numerele lor.

### DG-114 — Semnături + imutabilitate

**Valoarea:** actul devine probă: se știe cine l-a întocmit, când a fost finalizat și că textul nu s-a
schimbat de atunci. Corecțiile lasă urmă, în loc să rescrie istoria.

**Fluxul:** **Finalizează** → se calculează `body_hash` peste corp + părți + poziții și se afișează pe
document → orice editare ulterioară e refuzată (409) → **Anulează** cere motiv, actul rămâne în
registru tăiat, iar actul nou care îl înlocuiește îl referă.

- **T-DG-114-1** [blocant] Given un act finalizat, When se modifică direct în bază corpul, Then verificarea de integritate semnalează neconcordanța la afișare.
- **T-DG-114-2** [blocant] Given un act finalizat, When `PUT`/`DELETE`, Then 409/403; singura cale e anularea cu motiv.
- **T-DG-114-3** [blocant] Given anularea, Then `cancelled_at` + motivul sunt salvate și apar în jurnal.
- **T-DG-114-4** [normal] Blocul de semnături apare în PDF pentru ambele părți, cu funcția și numele, plus loc de ștampilă.

### DG-115 — Trimitere și export

**Valoarea:** actul ajunge la contraparte din aplicație, cu urmă în jurnal — nu dintr-un client de
email personal, unde nimeni nu mai știe ce s-a trimis și când.

**Fluxul:** **Trimite** → alegi destinatarul (emailul contactului din fișa furnizorului) → mesaj
predefinit + PDF atașat → `emailGuard` decide dacă chiar pleacă (blocat pe domenii demo, oprit în
non-producție) → jurnalul înregistrează trimiterea. **Exportă .docx** pentru contrapărțile care cer
editabil.

- **T-DG-115-1** [blocant] Given mediu non-producție fără `EMAIL_SEND_MODE=on`, When se trimite, Then NU pleacă niciun email real și răspunsul spune asta clar.
- **T-DG-115-2** [blocant] Given domeniu demo (`@atic.demo.io`), Then trimiterea e blocată oriunde, inclusiv în producție.
- **T-DG-115-3** [blocant] Given trimitere reușită, Then jurnalul conține „trimis către X la data Y".
- **T-DG-115-4** [normal] Given export `.docx`, Then fișierul se deschide în Word cu titluri, tabel și semnături păstrate.

---

## Faza 5 — Actele se nasc unele din altele și devin PAR-uri

### DG-116 — „Act nou pe baza acestuia"

**Valoarea:** actul derivat se face din 3 câmpuri, nu din 20. Referința legală („în baza contractului
nr. X din data Y") apare automat și corect — exact ce cere contabilitatea.

**Fluxul:** deschizi contractul → **Creează act pe baza acestuia** → alegi tipul (act de
primire-predare / act adițional / proces-verbal) → noul act vine cu părțile, proiectul, pozițiile,
valuta și referința completate → completezi ce e specific → finalizezi. Ambele acte se văd legate.

- **T-DG-116-1** [blocant] Given un contract finalizat, When se creează actul derivat, Then părțile, proiectul și pozițiile sunt copiate, iar corpul conține „în baza contractului nr. … din …".
- **T-DG-116-2** [blocant] Given actul derivat creat, Then legătura există în ambele sensuri (`doc_document_links`) și e vizibilă pe fiecare document.
- **T-DG-116-3** [blocant] Given un tip incompatibil (ex. act adițional la un act de primire-predare), Then nu e oferit în listă.
- **T-DG-116-4** [normal] Modificarea contractului sursă (anulare) semnalează pe actele derivate că baza lor a fost anulată.

### DG-117 — „Transformă în PAR"

**Valoarea:** actul semnat devine cerere de plată dintr-un click, cu documentul deja atașat. Se taie
a treia retastare a acelorași date și dispare naveta „finanțele cer documentele separat".

**Fluxul:** pe actul finalizat → **Transformă în PAR** → se creează un PAR ciornă cu beneficiarul și
toate rechizitele, proiectul/evenimentul, codul de buget, scopul din act, pozițiile ca linii, suma și
valuta → **PDF-ul actului se atașează automat** la PAR → ești dus în formularul PAR să verifici și să
trimiți spre aprobare. Pe act apare „PAR-2026-0043 · în aprobare".

- **T-DG-117-1** [blocant] Given un act finalizat cu 3 poziții, When `POST /:id/to-par`, Then 201 și PAR-ul are beneficiar + IDNO + IBAN, proiect, 3 linii, sumă și valută identice cu actul.
- **T-DG-117-2** [blocant] Then PDF-ul actului există în `par_attachments` pentru acel PAR (verificat prin API, nu vizual).
- **T-DG-117-3** [blocant] Given un act care are deja un PAR, When se apasă din nou, Then avertisment explicit și nu se creează al doilea PAR fără confirmare.
- **T-DG-117-4** [blocant] Given un act ciornă (nefinalizat), Then acțiunea e refuzată cu motiv.
- **T-DG-117-5** [blocant] Given utilizator fără drept pe proiectul actului, Then 403 — nu poate crea PAR din el.
- **T-DG-117-6** [normal] Pe pagina PAR apare, invers, linkul către actul-sursă.

### DG-118 — Din PAR / comandă / recepție → act

**Valoarea:** închide bucla „am plătit, unde e actul semnat?". Actul de primire-predare se generează
din ce s-a comandat și s-a primit efectiv, nu se recompune din memorie.

**Fluxul:** pe un PAR aprobat (sau pe recepție) → **Generează act de primire-predare** → actul vine cu
furnizorul, proiectul și pozițiile efectiv primite (cantități din recepție, nu din comandă) →
finalizezi și îl trimiți la semnat.

- **T-DG-118-1** [blocant] Given un PAR cu recepție parțială (3 din 5 bucăți), Then actul conține cantitățile primite, nu cele comandate.
- **T-DG-118-2** [blocant] Given un PAR fără recepție, Then actul se generează din liniile PAR-ului, marcat corespunzător.
- **T-DG-118-3** [normal] Legătura PAR ↔ act apare în ambele pagini.

### DG-119 — Traseul actului

**Valoarea:** o singură privire răspunde la „unde s-a oprit lucrul?" — contract semnat, act semnat,
PAR în aprobare, plata făcută, factura primită. Dispare turul de întrebări pe chat.

**Fluxul:** pe orice document (și pe PAR) → banda de traseu, cu fiecare verigă un link real și cu
starea ei; verigile lipsă apar ca pași sugerați („creează actul", „transformă în PAR").

- **T-DG-119-1** [blocant] Given lanțul contract → act → PAR → plată, Then toate cele 4 verigi apar cu stările corecte și linkuri care duc la paginile reale.
- **T-DG-119-2** [blocant] Given o verigă lipsă, Then apare ca pas sugerat, nu ca eroare.
- **T-DG-119-3** [normal] Aceeași componentă e folosită și în PAR (fără a doua implementare).

---

## Faza 6 — Dosare, registru, permisiuni

### DG-120 — Dosarul proiectului

**Valoarea:** răspunsul la întrebarea donatorului („ce ați contractat pe proiect și cât ați plătit")
se dă în aceeași ședință, cu ZIP-ul actelor atașat.

**Fluxul:** **Proiecte → X → Acte** → actele grupate pe contraparte și tip, cu total contractat vs.
total plătit (din PAR-urile legate) → **Descarcă tot** produce un ZIP cu PDF-urile.

- **T-DG-120-1** [blocant] Given 7 acte pe proiect cu 3 contrapărți, Then gruparea și totalurile sunt corecte, iar sumele în valute diferite nu se adună orb.
- **T-DG-120-2** [blocant] Given ZIP-ul, Then conține exact PDF-urile actelor filtrate, cu nume de fișier lizibile (`ACT-2026-0007_Furnizor.pdf`).
- **T-DG-120-3** [normal] „Contractat vs plătit" se calculează din PAR-urile legate, nu din câmpuri scrise manual.

### DG-121 — Dosarul contrapărții

**Valoarea:** înainte să semnezi al treilea contract cu cineva, vezi istoricul complet și **dacă
și-a schimbat rechizitele** — cazul clasic de plată trimisă pe IBAN vechi.

**Fluxul:** **Furnizori → X → Acte** → toate actele, pe proiecte, cu sume și stări → dacă rechizitele
curente diferă de cele înghețate în ultimul act semnat, apare un semnal explicit.

- **T-DG-121-1** [blocant] Given IBAN-ul schimbat în fișa furnizorului după ultimul act, Then apare avertismentul cu ambele valori și data schimbării.
- **T-DG-121-2** [blocant] Given acte pe 3 proiecte, Then apar toate, grupate, indiferent de tip.
- **T-DG-121-3** [normal] Din dosar se poate porni direct un act nou cu acea contraparte.

### DG-122 — Registrul actelor (export)

**Valoarea:** registrul cerut de auditor se scoate într-un minut, cu aceleași filtre ca pe ecran —
nu se compune manual în Excel.

**Fluxul:** filtrezi lista → **Exportă XLSX** (nr., dată, tip, contraparte, IDNO, proiect, sumă,
valută, stare, PAR legat, întocmit de) sau **Descarcă PDF-urile** ca ZIP.

- **T-DG-122-1** [blocant] Given filtrele aplicate, When export, Then fișierul conține exact rândurile filtrate, cu antet și sume numerice (nu text).
- **T-DG-122-2** [blocant] Export gol → fișier valid cu antet, nu eroare.
- **T-DG-122-3** [normal] Coloanele sunt în română și încap la tipărire A4 landscape.

### DG-123 — Permisiuni + jurnal

**Valoarea:** un act de pe un proiect la care nu lucrezi nu se vede — cerință de confidențialitate a
donatorilor. Iar orice atingere a unui act (creat, editat, finalizat, descărcat, trimis, anulat) are
autor și oră, în limbaj omenesc.

**Fluxul:** vizibilitatea se calculează din apartenența la proiect (`projectScope`/`visibility`);
butoanele de finalizare/anulare apar doar rolurilor cu drept; fila **Jurnal** de pe act arată
„Ana Munteanu a finalizat actul · 12.03.2026, 14:20".

- **T-DG-123-1** [blocant] Given un utilizator care nu e pe proiect, When cere actul direct pe API, Then 404/403 — nu 200 (testul se face pe API, nu doar pe UI).
- **T-DG-123-2** [blocant] Given fiecare acțiune (creare, editare, finalizare, anulare, descărcare, trimitere, transformare în PAR), Then există un rând de jurnal cu autor, oră și detalii.
- **T-DG-123-3** [blocant] Jurnalul e în română, fără JSON brut afișat utilizatorului.
- **T-DG-123-4** [normal] Un admin de tenant vede actele tuturor proiectelor.

### DG-124 — Generare în masă din tabel

**Valoarea:** 40 de acte identice (contracte de voluntariat, acte pentru participanți) se fac dintr-o
încărcare de Excel — și rămân în registru, nu doar într-un ZIP pe care îl pierzi.

**Fluxul:** **Acte → Generare în masă** → alegi șablonul → încarci Excel-ul → potrivirea coloanelor cu
câmpurile se propune automat → previzualizezi 3 rânduri → **Generează** → N acte numerotate, salvate
în registru + ZIP descărcabil.

- **T-DG-124-1** [blocant] Given un Excel cu 40 de rânduri, When se generează, Then apar 40 de documente în registru, cu numere distincte și consecutive.
- **T-DG-124-2** [blocant] Given un rând cu date invalide, Then acel rând e raportat explicit, restul se generează (nu pică tot lotul).
- **T-DG-124-3** [blocant] Then se folosește `generateBatch`/`zipPdfs` existente — un singur browser pentru tot lotul, nu N.
- **T-DG-124-4** [normal] Wizardul DOCMERGE existent folosește aceeași bibliotecă de șabloane (fără al doilea sistem).

---

## Poarta comună (rulează la fiecare item, nu doar la final)

```
npm run e2e            # după fiecare item — gărzi statice + API real pe zona atinsă
npm run e2e:browser    # înainte de commit — browser real pe rutele atinse
npm run e2e:all        # înainte de push în main
```

Plus, pentru orice item de backend: `check-undefined-refs`, `check-route-mounts`,
`check-migration-breakpoints`, `schema-drift` — verzi (CLAUDE.md §0.2bis).
