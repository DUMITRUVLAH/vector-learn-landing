# DOCGEN — Modulul de acte (generare documente → PDF → PAR)

> **Status:** backlog scris 2026-08-29, **niciun item început**. Sursă: cererea owner-ului
> („act primire-predare din șablon → PDF → pe baza lui alte acte → PAR-uri; editor tip Word;
> lista de furnizori cu toate rechizitele; vedere per proiect / per client").
>
> O fază = un branch = un PR (§0.2). Livrare direct pe `main` după gate-uri (§0.2bis).

---

## 1. Problema, în cuvintele owner-ului

> „Îmi trebuie modul de generare de documente, în care să generăm acte primire-predare / contracte,
> ulterior pe baza lor să putem transforma în PAR-uri. […] să avem șabloanele noastre de documente,
> să putem adăuga diferite contracte și să avem un editor de Word direct aici. […] să tragă lista de
> furnizori direct, toate rechizitele pe care le are. Deci gândește că ar fi un loc unde mai ușor de
> făcut diferite documente standard. […] Ulterior trebuie să vedem per fiecare proiect, pentru
> fiecare client."

Astăzi actele se fac în Word, pe un fișier copiat de la actul precedent: rechizitele furnizorului se
retastează (sau se copiază greșit), numerotarea se ține minte, PDF-ul ajunge pe email și nicăieri
altundeva, iar când se face PAR-ul pentru plată aceleași date se introduc a treia oară. Nimeni nu
poate răspunde repede la „ce acte avem semnate cu furnizorul X pe proiectul Y și cât din ele e plătit".

---

## 2. Jobs to be done

| # | Job | Cum se măsoară că e făcut |
|---|-----|---------------------------|
| **JTBD-1** | Când am nevoie de un act de primire-predare, vreau să aleg șablonul, să completez doar ce e specific și să iasă PDF-ul, ca să nu mai copiez fișiere Word. | De la „act nou" la PDF descărcat: **sub 2 minute**, fără să deschid Word. |
| **JTBD-2** | Când completez un act, vreau ca datele contrapărții (denumire, IDNO, IBAN, bancă, BIC, adresă juridică, administrator, nr. TVA) să vină singure din registru, ca să nu greșesc rechizitele bancare. | Zero câmpuri de rechizite tastate manual pentru un furnizor existent. |
| **JTBD-3** | Când organizația are formulările ei juridice, vreau să-mi pot scrie și edita șabloanele direct în aplicație, ca la Word, ca să nu depind de nimeni. | Un jurist fără cunoștințe tehnice creează un șablon nou și inserează câmpuri fără să vadă HTML. |
| **JTBD-4** | Când există deja un contract, vreau ca actul de primire-predare (sau actul adițional, procesul-verbal) să se nască din el, cu părțile, pozițiile și referința „în baza contractului nr. X din data Y". | Actul derivat se creează cu **≤ 3 câmpuri** de completat manual. |
| **JTBD-5** | Când actul e semnat și trebuie plătit, vreau să apăs un buton și să am PAR-ul precompletat, cu actul atașat, ca finanțele să nu ceară documentele separat. | PAR creat din act cu beneficiar + rechizite + proiect + poziții + sumă completate; PDF-ul actului deja în atașamente. |
| **JTBD-6** | Când cineva întreabă „ce avem cu clientul X pe proiectul Y", vreau un dosar cu toate actele, sumele și starea lor. | Dosar per proiect și per contraparte, cu descărcare ZIP și export XLSX. |
| **JTBD-7** | Când semnez un act, vreau siguranța că nu se mai poate modifica pe furiș și că știu cine l-a făcut și când. | Document finalizat = imutabil (hash de corp), jurnal complet, anulare cu motiv în loc de ștergere. |
| **JTBD-8** | Când am 40 de acte identice (ex. contracte de voluntariat pentru un eveniment), vreau să le generez dintr-un tabel, dintr-o singură apăsare. | Refolosește wizardul DOCMERGE existent, cu aceleași șabloane. |

**Non-obiective (explicit în afara scopului v1):** semnătură electronică calificată (MSign/MConnect),
negociere/redlining pe versiuni între părți, portal extern unde contrapartea semnează, OCR de acte
scanate ca sursă de șablon (avem deja `parAiPrefill` pentru direcția inversă).

---

## 3. Ce refolosim (NU se reconstruiește nimic din ce urmează)

| Nevoie | Ce există deja | Fișier |
|--------|----------------|--------|
| Șabloane cu `{{câmpuri}}` + detectare automată + randare cu context | DOCMERGE-001 | `server/db/schema/docmergeTemplates.ts`, `server/lib/docmerge/placeholders.ts` |
| HTML → PDF (Playwright, lazy import, fallback când lipsește chromium) | DOCMERGE-003 | `server/lib/docmerge/htmlToPdf.ts` (`htmlToPdfBuffer`, `BatchPdfRenderer`) |
| Generare în masă din Excel + ZIP | DOCMERGE-002/003/004 | `server/lib/docmerge/{excelImport,generateBatch,zipPdfs}.ts`, `/business/docmerge` |
| **Furnizori cu toate rechizitele** (IDNO/IDNP, IBAN, bancă, BIC/SWIFT, cod TVA, cont, adresă juridică, administrator, contact) | PAR | `par_vendors` (`server/db/schema/par.ts:346`) |
| Lipirea unui bloc de rechizite copiat dintr-un email → câmpuri separate | PAR | `server/lib/par/bankRequisites.ts` (`splitBankRequisites`) |
| Verificare firmă în registru (status, adresă, formă juridică) | contafirm.md | `server/lib/companyRegistry.ts`, `company_clients` |
| Proiecte, evenimente, plătitori (organizația „noastră") | PAR | `par_projects`, `par_events`, `par_payers`, `par_settings` |
| Suma în litere (RO) | PAR | `server/lib/par/amountInWords.ts` |
| Atașamente la PAR (inclusiv kind=contract) | PAR | `par_attachments`, `server/routes/parAttachments.ts` |
| Numerotare secvențială per tenant/an | PAR | `server/lib/par/requestNo.ts` (model de urmat) |
| Imutabilitate prin hash de corp | PAR-107 | `par_requests.body_hash` (model de urmat) |
| Vizibilitate pe proiect / rol | PAR | `server/lib/par/{projectScope,visibility,roles}.ts` |
| Trimitere email cu gardă (demo/prod) | FinFlow | `server/lib/emailGuard.ts` |
| Export XLSX | PAR | `server/lib/par/excelExport.ts` |

**Decizie anti-duplicare (importantă):** șabloanele DOCGEN și cele DOCMERGE sunt **același tabel**
(`docmerge_templates`, extins cu `kind`, `category`, `is_system`, `fields_json`, `version`). Un singur
loc unde trăiesc șabloanele organizației, două moduri de a le folosi: unul-la-unul (DOCGEN) și în masă
(wizardul DOCMERGE). Altfel `integration-architect` ar semnala corect `COMPETING_SYSTEM`.
`par_templates` rămâne separat — acela e snapshot de PAR (antet + poziții), nu document.

---

## 4. Conceptele modulului

- **Șablon** — corpul actului, cu câmpuri `{{...}}` și o schemă de câmpuri declarată (tip, etichetă,
  obligatoriu, sursă). Versionat; un document finalizat păstrează versiunea cu care a fost generat.
- **Document** — un act concret: șablonul + contextul completat + corpul randat + PDF-ul. Stări:
  `ciornă → finalizat → semnat → anulat`.
- **Părțile** — „noi" (plătitorul/organizația, din `par_payers`/`par_settings`) și „contrapartea"
  (din `par_vendors`, `fin_parties` sau `company_clients`), cu **snapshot** al rechizitelor la
  momentul finalizării (dacă furnizorul își schimbă IBAN-ul mâine, actul de anul trecut rămâne cum a
  fost semnat).
- **Legături** — document → document (contract → act de primire-predare), document → PAR,
  document → factură. De aici iese „traseul actului".
- **Dosar** — vederea per proiect și per contraparte peste toate documentele.

### Model de date propus (tabele noi)

```
doc_documents          id, tenant_id, template_id, template_version, kind, doc_number, doc_date,
                       title, status, project_id, event_id, payer_id,
                       counterparty_kind ('vendor'|'fin_party'|'inline'), counterparty_id,
                       counterparty_snapshot (json: nume, IDNO, IBAN, bancă, BIC, adresă, administrator),
                       context (json), body_html, total_cents, currency, body_hash,
                       pdf_url, created_by, finalized_at, cancelled_at, cancel_reason, timestamps
doc_document_lines     id, tenant_id, document_id, position, description, unit, qty, unit_price_cents,
                       total_cents, vat_percent            -- pozițiile actului (obiectul predării)
doc_document_links     id, tenant_id, from_document_id, to_kind ('document'|'par'|'invoice'),
                       to_document_id | to_par_id | to_invoice_id, relation, created_by, created_at
doc_number_sequences   id, tenant_id, kind, year, prefix, format, last_number   -- numerotare per tip/an
doc_audit              id, tenant_id, document_id, actor_user_id, action, details (json), created_at
```

Coloane adăugate la `docmerge_templates`: `kind` (act_primire_predare | contract_servicii | …),
`category`, `is_system` (șabloanele livrate cu produsul, needitabile — se clonează), `fields_json`,
`version`, `archived_at`.

⚠️ Fiecare tabel nou din lista de sus are nevoie de `CREATE TABLE … IF NOT EXISTS` în
`server/db/sync-schema.ts` (`ENSURE_STATEMENTS`) în ACELAȘI commit — prod-ul nu aplică fiabil
migrări (§3.5.1ter, memoria [[prod-migration-tracking-desynced]]).

---

## 5. Fazele și item-urile

### Faza 1 — Fundația: registru de acte (JTBD-1, JTBD-7)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-101` | Schema documentelor + migrare + heal | Tabelele de mai sus + extensia `docmerge_templates`; migrare cu prefix > max pe `origin/main`, `--> statement-breakpoint` între statements; `export *` în `schema/index.ts`; heal în `sync-schema.ts`; `db:reset` + `db:seed` verzi. |
| `DG-102` | API documente (CRUD + finalizare + anulare) | `GET/POST /api/docs/documents`, `GET/PUT/DELETE /:id`, `POST /:id/finalize`, `POST /:id/cancel`. Filtre: tip, proiect, contraparte, stare, perioadă, căutare text. Tenant-scope pe fiecare interogare; rutele montate în `app.ts` în același commit. Finalizarea calculează `body_hash` și interzice orice editare ulterioară (409). |
| `DG-103` | Pagina „Acte" în shell-ul business | `/business/docs` — listă cu filtre, stare colorată, sumă, contraparte, proiect, acțiuni (deschide, PDF, duplică, anulează). Navigație în `ParShell`/`BusinessShell`, tokeni Vector 365, dark mode, ≥44px țintele. |

### Faza 2 — Editorul de șabloane, ca la Word (JTBD-3)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-104` | Editor WYSIWYG | TipTap 2 (ProseMirror), **lazy-loaded** doar pe ruta editorului, ca să nu spargă bugetul de 100 KB/rută. Bold/italic/subliniat, titluri, liste, aliniere, tabel, linie de separare, întrerupere de pagină, anulare/refacere, lipire din Word curățată (fără `style=` toxic), vedere „sursă HTML" pentru cazuri limită. Sanitizare la salvare (fără `<script>`, fără `on*=`). |
| `DG-105` | Inserare câmpuri fără să știi sintaxa | Tastezi `/` în editor → autocomplete cu catalogul de câmpuri (§DG-108); câmpul apare ca „cip" vizual, se salvează ca `{{contraparte.iban}}` (compatibil cu randarea DOCMERGE). Panou lateral cu toate câmpurile disponibile, grupate. Ștergerea unui cip nu lasă text rupt. |
| `DG-106` | Biblioteca de șabloane standard (seed) | Livrate cu produsul, `is_system=true`, clonabile: **act de primire-predare** (bunuri și servicii), contract de prestări servicii, contract de vânzare-cumpărare, act de îndeplinire a lucrărilor, proces-verbal de recepție, act adițional, act de compensare, cerere de ofertă, invitație de participare, procură, ordin/dispoziție. Formulare în română, cu blocul de rechizite al ambelor părți și blocul de semnături. |
| `DG-107` | Versionare + previzualizare | Fiecare salvare = versiune nouă; documentele existente rămân legate de versiunea lor. Previzualizare cu date de test (`sampleContext`) și cu un furnizor real ales din listă. Diferențe între versiuni, revenire la o versiune anterioară. |

### Faza 3 — Completarea, cu date reale (JTBD-2)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-108` | Catalogul de câmpuri + rezolverul de date | Grupuri: `noi.*` (denumire, IDNO, IBAN, bancă, BIC, adresă, administrator, TVA — din `par_payers`/`par_settings`), `contraparte.*` (toate rechizitele din `par_vendors`/`fin_parties`), `proiect.*`, `eveniment.*`, `document.*` (număr, dată, loc), `total.*` (sumă, valută, **sumă în litere** via `amountInWords`), `utilizator.*`. Funcții de format: dată RO, monedă, sumă în litere. Un câmp nerezolvat NU se randează ca `{{…}}` în PDF — apare vizibil ca lipsă în validare, înainte de finalizare. |
| `DG-109` | Formularul de completare, generat din șablon | Câmpurile șablonului → formular automat. Selector de contraparte cu autocomplete (caută după nume/IDNO) care **trage toate rechizitele dintr-o dată**; selector proiect + eveniment; tabel de poziții (denumire, UM, cantitate, preț, sumă) cu totaluri și TVA opțional; câmpuri libere. Auto-save de ciornă. |
| `DG-110` | Contraparte nouă, fără să ieși din act | Creare rapidă în `par_vendors` din formular; **lipire bloc de rechizite** dintr-un email → despicare automată în câmpuri (`splitBankRequisites`); verificare în registrul de firme după IDNO → completare denumire/adresă/status/formă juridică; avertisment (nu blocaj) dacă firma e inactivă în registru. |
| `DG-111` | Validare înainte de finalizare | Lista concretă a ce lipsește (câmp cu câmp, cu link la câmpul respectiv), verificare IBAN (`src/lib/par/iban.ts`), IDNO 13 cifre pentru MD, sumă > 0, cel puțin o poziție, ambele părți cu rechizite complete. |

### Faza 4 — PDF, numerotare, semnături (JTBD-1, JTBD-7)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-112` | PDF-ul actului | Refolosește `htmlToPdfBuffer`; A4, antet cu logoul organizației, subsol cu „pagina X din Y" și numărul actului, marje corecte, diacritice RO redate corect, tabelul de poziții care se rupe frumos între pagini. Fallback HTML descărcabil când chromium lipsește (nu eroare). |
| `DG-113` | Numerotare automată per tip și an | `doc_number_sequences`: prefix și format configurabile (`ACT-{AN}-{NNNN}`), resetare anuală opțională, număr **rezervat la finalizare** (nu la ciornă), unic per tenant+tip+an, fără găuri la erori concurente. |
| `DG-114` | Bloc de semnături + imutabilitate | Blocul celor două părți (denumire, funcție, nume, loc de semnătură și ștampilă); opțional semnătură încărcată ca imagine. La finalizare: `body_hash` (SHA-256 pe corp + părți + poziții), afișat pe document; orice tentativă de editare → 409 cu mesaj clar; corectarea se face prin anulare cu motiv + act nou care referă actul anulat. |
| `DG-115` | Trimitere și export | Descărcare PDF, trimitere pe email către contraparte prin `emailGuard` (blocat pe domenii demo, oprit în non-producție fără `EMAIL_SEND_MODE=on`), export `.docx` opțional pentru cazurile în care contrapartea cere editabil. |

### Faza 5 — Actele se nasc unele din altele, apoi devin PAR (JTBD-4, JTBD-5)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-116` | „Act nou pe baza acestuia" | Din contract → act de primire-predare / act adițional / proces-verbal: moștenește părțile, proiectul, pozițiile, valuta; adaugă automat referința „în baza contractului nr. X din data Y"; creează legătura în ambele sensuri. Reguli per tip de act: ce se poate naște din ce. |
| `DG-117` | **„Transformă în PAR"** | Buton pe documentul finalizat → PAR ciornă precompletat: beneficiar + toate rechizitele, proiect/eveniment, cod de buget (dacă e pe proiect), scopul din act, pozițiile → `par_line_items`, sumă și valută; **PDF-ul actului atașat automat** (`par_attachments`, kind potrivit); legătură document ↔ PAR vizibilă din ambele părți. Nu se creează al doilea PAR din același act fără avertisment explicit. |
| `DG-118` | Invers: PAR / comandă → act | Din PAR aprobat sau din comandă/recepție (`par_purchase_orders`, `par_receipts`) → generează actul de primire-predare precompletat cu pozițiile efectiv primite. Închide bucla „am plătit, unde e actul semnat". |
| `DG-119` | Traseul actului | Pe fiecare document: lanțul contract → act → PAR → plată → factură, cu stările și sumele, fiecare verigă un link real. Aceeași componentă refolosită în PAR (nu două vederi diferite). |

### Faza 6 — Dosare per proiect și per client (JTBD-6, JTBD-7, JTBD-8)

| ID | Titlu | Scop / criterii cheie |
|----|-------|----------------------|
| `DG-120` | Dosarul proiectului | Toate actele proiectului, grupate pe contraparte și tip, cu sume, stări și PAR-urile legate; total contractat vs. total plătit; descărcare ZIP a tuturor PDF-urilor. |
| `DG-121` | Dosarul contrapărții | Toate actele cu un client/furnizor, pe proiecte, cu istoric și rechizitele curente; semnalează dacă rechizitele s-au schimbat față de ultimul act semnat. |
| `DG-122` | Registrul actelor (export) | XLSX: nr., dată, tip, contraparte, IDNO, proiect, sumă, valută, stare, PAR legat, cine a întocmit; aceleași filtre ca lista. ZIP cu PDF-urile selecției. |
| `DG-123` | Permisiuni + jurnal | Vizibilitate pe proiect (`projectScope`/`visibility`): cine nu e pe proiect nu vede actele lui; doar rolurile cu drept finalizează sau anulează. Jurnal complet (creat, editat, finalizat, anulat, descărcat, trimis pe email, transformat în PAR) în limbaj omenesc, ca jurnalul PAR. |
| `DG-124` | Generare în masă din tabel | Din același șablon: încarci un Excel cu N rânduri → N acte numerotate, salvate în registru (nu doar ZIP orb), refolosind `generateBatch` + `zipPdfs`. Legătura cu wizardul DOCMERGE existent, fără al doilea sistem de șabloane. |

---

## 6. Decizii luate (fără să întreb, per §0)

1. **Un singur depozit de șabloane** — `docmerge_templates` extins, nu un tabel nou. Evită două
   biblioteci de șabloane care divergează.
2. **Editor: TipTap 2, lazy-loaded.** `document.execCommand` e depreciat și se comportă diferit între
   browsere; un editor scris de la zero pe `contenteditable` ar fi cel mai scump item din tot modulul.
   Dependență nouă → justificată în corpul PR-ului (§3.7).
3. **Câmpurile rămân `{{...}}`** în stocare, oricât de „vizual" arată în editor — compatibilitate
   directă cu `renderWithContext` și cu generarea în masă.
4. **Snapshot de rechizite la finalizare.** Un act semnat nu se schimbă când se editează fișa
   furnizorului. Registrul rămâne sursa pentru actele viitoare.
5. **Finalizat = imutabil.** Nu există „editez actul semnat". Există anulare cu motiv + act nou.
   Aceeași disciplină ca la PAR (`body_hash`).
6. **„Client" = contraparte,** rezolvată din `par_vendors` întâi (acolo sunt rechizitele complete),
   apoi `fin_parties` și `company_clients`. Un singur selector, trei surse în spate.
7. **PDF-ul se stochează, nu se re-randează la fiecare descărcare** — altfel actul descărcat azi ar
   putea arăta altfel decât cel semnat, dacă șablonul s-a schimbat între timp.
8. **v1 fără semnătură electronică calificată.** Blocul de semnături e pentru semnare pe hârtie/scan;
   MSign e un item separat, când owner-ul îl cere.

## 7. Riscuri și cum le tratăm

| Risc | Tratament |
|------|-----------|
| Chromium lipsă pe serverless → PDF null | Fallback HTML + mesaj clar; deja implementat în `htmlToPdf.ts`, se testează explicit. |
| Tabele noi + prod care nu aplică migrări → 500 pe toată pagina | `ENSURE_STATEMENTS` în `sync-schema.ts` în același commit; interogările degradează grațios la „registru gol". |
| HTML din editor = vector XSS (corpul se randează în aplicație și în PDF) | Sanitizare la salvare ȘI la randare; test cu payload `<script>`/`onerror=` în corpul șablonului. |
| Lipire din Word aduce stiluri care sparg PDF-ul | Curățare la lipire (păstrăm doar structura), test cu un contract real copiat din Word. |
| Numerotare cu găuri sau duplicate la concurență | Rezervare tranzacțională la finalizare + test cu două finalizări simultane. |
| Modulul devine încă o insulă | DG-117/118/119 sunt obligatorii, nu „nice to have": fără ele actele nu ating PAR-ul și nu s-a rezolvat JTBD-5. |

## 8. Poarta de calitate per item (§3.5.1quater — testăm ACȚIUNEA)

Pentru fiecare item, testul care contează invocă acțiunea, nu verifică doar că butonul există:
- `POST /api/docs/documents` cu context real → 200 + document cu număr și corp randat;
- `POST /:id/finalize` → 200, apoi `PUT /:id` → **409** (imutabilitate);
- `GET /:id/pdf` → 200 cu `%PDF` în primii octeți (sau fallback HTML documentat);
- `POST /:id/to-par` → 200 + PAR cu beneficiar, poziții, sumă **și** atașamentul prezent;
- un act al unui proiect din care utilizatorul nu face parte → **404/403**, niciodată 200.
`npm run e2e` după fiecare item, `npm run e2e:browser` înainte de commit (§3.5.1quinquies).

## 9. Backlog descoperit (nu se construiește acum)

- Semnătură electronică MSign/MConnect și verificarea semnăturii pe PDF-uri primite.
- Portal extern pentru contraparte (vede actul, semnează, încarcă scanul semnat).
- Redlining/negociere pe versiuni între părți.
- Șabloane cu logică condițională („dacă e persoană fizică, arată blocul X").
- Memento-uri pe termene contractuale (expirare, prelungire automată).
