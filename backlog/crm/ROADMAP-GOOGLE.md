# CRM — foaia de parcurs „CRM adevărat, cu fața Google" (2026-09-25)

> Cererea ownerului: „testează modulul CRM și roadmap-ul; dezvoltă-l ca un CRM bun, nu doar ce
> e acum — nu e prietenos, nu are tot ce trebuie, rapoartele sunt proaste, designul arată a AI
> slop. Vrem ceva ca Google, ca interfața Google Drive."

## 1. Ce a arătat testarea (2026-09-25, local, date realiste)

Baza de test: workspace-ul demo ATIC, populat cu `scripts/seed-crm-demo.mjs` +
`scripts/seed-crm-callcenter.mjs` (184 de contacte în 4 pâlnii, 294 de intrări în cronologie,
12 firme, 10 produse, 29 de taskuri, 14 acte). Toate cele 16 pagini CRM s-au încărcat fără
erori JS și fără răspunsuri API ≥ 400. Problemele sunt de produs și de design, nu de crash:

| # | Ce | Unde | Stare |
|---|----|------|-------|
| 1 | „Conversia între etape" lega etapele a 4 pâlnii diferite (23 de treceri fără sens), „au avansat" 0 aproape peste tot | Rapoarte | **reparat — G02** |
| 2 | Raportul = 14 plăcuțe de activitate; lipseau rata de câștig, valoarea medie, câștigat vs pierdut în timp, sursele, afacerile care stagnează, comparația cu perioada trecută | Rapoarte | **livrat — G02** |
| 3 | „Contracte semnate 18 din 9 · 200%" — norma se citea ca un bug | Rapoarte | **reparat — G02** („89% din 9", bară) |
| 4 | Linia de valoare (curbă netezită) cobora sub zero; sume fără monedă; culori `--chart-*` inexistente → fallback hardcodat | Rapoarte | **reparat — G02** |
| 5 | Acasă = 12 carduri identice cu iconiță în pătrățel — copia meniului | Acasă | **înlocuit — G03** |
| 6 | Un lead nu avea adresă: fișa se deschidea peste tablă, linkul rămânea `/pipeline` | Pipeline | **reparat — G01** (`?lead=<id>`) |
| 7 | Click pe o firmă nu face nimic — nu există fișa firmei (afacerile, oamenii, istoricul ei) | Clienți | **G04** |
| 8 | Antetul Pipeline-ului: 3 rânduri de controale, 9 butoane; pe telefon rândul de acțiuni derulează lateral | Pipeline | **G05** |
| 9 | Fișa leadului: modal pe tot ecranul; antetul spune „firmă — produs", omul e îngropat în formular; etapa e un `<select>`, fără bara de progres | Fișa leadului | **G06** |
| 10 | Tabloul pâlniei: trapeze pastel, câte o culoare pe etapă | Pâlnie | **G07** |
| 11 | Meniul: Import și Repartizare sub „Analiză"; API refolosea iconița Automatizări | Meniu | **reparat — G01** |

Documentație rămasă în urmă (de corectat, nu blochează): `backlog/crm/README.md` „Status azi"
spune că totul e „pending"; `CRM-CORE.md:10` „doar MVP-009 livrat"; frontmatter-ul
`backlog/specs/CRM-*.md` spune `pending` pentru item-uri `done` în STATE; CRM-117…128 lipsesc
din STATE deși au fost livrate prin portare; matricea din `CONFORMITATE-ESP-CRM.md` are sinteza
53/16/7, numărătoarea reală e 57/12/7.

## 2. Direcția de design: GM3 (Google Workspace), nu „AI slop"

**Ce e „AI slop"** (convergent în 8 surse independente, 2025–2026): gradient violet→albastru,
text cu gradient, glassmorphism, iconițe în pătrățele/cercuri pastel pe fiecare card,
`rounded-2xl shadow-lg` pe orice, grilă de plăcuțe KPI în capul fiecărei pagini, „erou" în
interiorul aplicației, pastile colorate pentru date care nu sunt stări, totul centrat, grile de
carduri pentru date care vor rânduri, animații fade-up peste tot. Surse: dev.to „The Purple
Gradient Problem", Medium „AI Design Slop" (aug. 2026), github.com/funboy322/avoid-ai-design,
925studios „AI slop design tells", prg.sh, uxskill.laithjunaidy.com.

**Ce facem în loc — semnătura Google Drive / Gmail (GM3):**

- trei straturi: fundal de pagină nuanțat `#F8FAFD` → conținut pe suprafață albă rotunjită
  (16px) → rândul activ din meniu umplut cu `#C2E7FF`; fără umbre colorate;
- albastrul Google `#0B57D0` (nu violetul de bază M3 `#6750A4`); text `#1F1F1F` / `#444746`;
- fontul rămâne **Onest** (al întregului FinFlow, decizia ownerului 2026-09-25), cu greutate normală la titluri;
- forme pe rol: butoane pastilă 40px, cipuri de filtru 32px cu colț de 8px, carduri 12px,
  dialoguri 28px; rânduri de tabel 48px cu hover tonal;
- iconițe simple de 20px, fără fundal; căutare-pastilă mare în bara de sus; buton „Nou" ridicat
  în colțul meniului;
- grafice plate: puține culori, grilă fină, fără gradient, perioada precedentă punctată.

Implementare: `src/styles/gm3.css` — tokenii redefiniți sub clasa `.gm3`, aplicată de
`BusinessShell` **doar pe /business/crm/***. PAR (clientul plătitor) rămâne neatins.
Componentele ds își primesc forma prin `data-slot` (Button, Card, Table, Field, Dialog, Badge).

## 3. Livrat în această rundă (branch `feat/CRM-google-redesign`)

| ID | Ce |
|----|----|
| CRM-G01 | Tema GM3 scopată pe CRM; meniu Drive (iconițe simple, rând activ tonal, „Lead nou" sus, secțiuni reordonate); căutare-pastilă în bara de sus → Pipeline filtrat; conținut pe suprafață albă; `?lead=`, `?q=`, `?nou=1` pe Pipeline |
| CRM-G02 | Rapoarte refăcute: raport per pâlnie; plăcuțe-tab cu variație față de perioada precedentă + grafic al metricii alese; câștigate vs pierdute; pâlnia cu „trec mai departe" și zile în etapă; afaceri în stagnare cu link la fișă; surse; clasamentul echipei; activitate față de normă; export Excel/PDF actualizat |
| CRM-G03 | Acasă: „De făcut" (taskurile mele restante, leaduri nesunate, neglijate) + „Afaceri recente" (ultimele modificate), totul cu link la fișă |

## 4. Următorii pași (în ordinea valorii)

### CRM-G04 — Fișa firmei
Click pe o firmă din „Clienți" deschide `/business/crm/clienti/<id>`: antet (nume, cod fiscal,
industrie, regiune, contact), **afacerile firmei** (toate pâlniile; etapă, valoare, responsabil,
link `?lead=`), **oamenii** (contactele leadurilor ei), **cronologia** unită (apeluri, e-mailuri,
note, mutări de etapă ale tuturor leadurilor), totaluri (câștigat, deschis, pierdut).
- Blocant: firma altui workspace → 404; o firmă fără leaduri arată stare goală, nu eroare.
- Endpoint nou `GET /api/crm/companies/:id/overview` (montat, cu test de rută + e2e care îl apelează).

### CRM-G05 — Pipeline: un singur rând de lucru
Antet: titlu + comutator segmentat Kanban/Listă + „Adaugă lead" (unica acțiune primară);
Analiza pâlniei / Repartizare / Etape / Export / Vizualizări într-un meniu „⋯". Filtrele
(căutare, sursă, „doar ale mele", segmentare) pe un rând de cipuri GM3. Pe 390px: fără derulare
laterală a paginii.

### CRM-G06 — Fișa leadului ca panou Drive
Panou lateral de 480px (Drive „Detalii") pe desktop, ecran întreg pe telefon; antet cu **omul**
(nume, firmă, telefon, e-mail cu acțiuni directe), **bara de etape** clicabilă (chevroane,
Pipedrive) în locul `<select>`-ului; restul filelor neschimbate.

### CRM-G07 — Trecerea GM3 pe paginile rămase
Astăzi (listă, nu carduri în carduri), Produse, Documente, Automatizări, Cadențe, Import,
Repartizare, Tabloul pâlniei (bare plate monocrome în loc de trapeze pastel), Drepturi, Jurnal,
API. Criteriu: zero `PastelIcon`/`pastel-*`/`rounded-2xl`/`shadow-lg` în `src/pages/business/crm`
și `src/components/crm` (grep în test), emoji „⚠" din Produse înlocuit.

### CRM-G08 — Data estimată de închidere + prognoza pe luni
Coloană `expected_close_at` pe leads (migrare + heal în `sync-schema.ts` + declarată în schemă),
câmp în fișă, prognoză ponderată pe luni în Rapoarte („ce intră în octombrie").

### Rapoarte — continuări
- ROAS pe sursă/campanie (`ad_spend`) — specul CRM-112, nelivrat.
- Drill-down: click pe o bară/rând din raport → lista leadurilor din spatele cifrei.
- Filtrul de segment (industrie, regiune…) și pe raportul general, nu doar pe pâlnie.
- Agregare în SQL în loc de plafonul `MAX_ROWS = 5000` (peste 5.000 de leaduri raportul taie în tăcere).
- „Oferte trimise" se detectează după eticheta etapei („ofert"); un flag `is_offer` pe etapă ar fi corect.

### Cer decizia ownerului (nu le pornesc singur)
1. **Tema GM3 pe toată aplicația** (PAR, FinDesk)? Azi e doar în CRM. Mutarea e un bloc CSS.
2. **Titlul cartonașului**: azi e produsul („Training AI in-house"), firma dedesubt — ales
   intenționat într-o rundă anterioară. Pipedrive/HubSpot pun firma/omul în titlu. Schimbăm?
3. **Telefonie** (PBX/SIP, click-to-call real, înregistrare, transcriere — conformitate #20–26):
   cere alegerea unui furnizor.
4. **E-mail primit** (IMAP/Gmail sync, #30/#66) și **WhatsApp/Viber API** (#28/#29): conturi și
   costuri de furnizor.
5. **Moneda leadului** (azi MDL fix): contează pentru clienți cu vânzări în EUR?
