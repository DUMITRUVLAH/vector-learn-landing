# VM5 — Ședința de prezentare cu toți utilizatorii, septembrie 2026

> Sursă: notițele din ședința de prezentare a aplicației către toți utilizatorii (nu doar rolul
> finanțe, ca la [VM4](VM4-catalog.md)). 21 de cerințe, notate în ordinea în care au fost spuse.
>
> Fiecare item a fost verificat în cod pe `origin/main` înainte de a fi scris aici — „stare azi" nu
> e presupunere, e ce face aplicația acum. Checkout-ul principal (`~/vector-learn-landing`) e
> stătut și are commit-uri care NU sunt pe main; referințele de mai jos sunt toate la `origin/main`.
>
> **Semaforul de claritate** spune dacă pot construi fără să mai întreb pe cineva:
> - 🟢 **90–100%** — știu exact ce trebuie făcut, construiesc fără să te implic.
> - 🟡 **70–89%** — construiesc, dar pe o presupunere pe care o declar aici; o poți infirma dintr-o
>   propoziție.
> - 🔴 **sub 70%** — nu încep. Lipsește o decizie de business sau un răspuns de la Ana.

---

## Rezumat — 21 de cerințe în trei coșuri

| ID | Cerință | Stare azi | Claritate |
|----|---------|-----------|-----------|
| VM5-01 | Solicitantul primește statutul + motivul respingerii | există, dar emailul e în engleză | 🟢 95% |
| VM5-02 | Vezi cererile colegilor de echipă (transparență / concediu) | nu există | 🟡 75% |
| VM5-03 | Atașamentele se văd în aplicație, nu se descarcă | livrat pentru PDF + imagini | 🟢 90% |
| VM5-04 | AI verifică dacă documentul corespunde plății | livrat (6 verificări), lipsește plătitorul | 🟢 90% |
| VM5-05 | Pop-up de nepotrivire, văzut și de aprobator | doar un chip discret | 🟢 95% |
| VM5-06 | Date retroactive de emitere | badge „datată în urmă" livrat | 🟢 90% |
| VM5-07 | Se păstrează doar digital sau și fizic? | întrebare, nu feature | 🔴 Ana |
| VM5-08 | Pachetul pentru audit (cerere, PAR, factură — dată, sumă) | dosar + jurnal, dar separat | 🟢 90% |
| VM5-09 | Dosarul: istoric, acte, workflow per persoană | foldere + jurnal cu filtru pe om | 🟢 85% |
| VM5-10 | Aprobări în plus pe tipuri de achiziții + documente obligatorii | doar pe sumă/departament/proiect | 🔴 70% |
| VM5-11 | Emailurile să vină în batch-uri de aprobare | un email per eveniment | 🟡 85% |
| VM5-12 | Ce se întâmplă când unul respinge și altul aprobă | regula există, nu se vede | 🟢 95% |
| VM5-13 | Buton „respinge toate" | „aprobă toate" există, „respinge" nu | 🟢 100% |
| VM5-14 | „Dosar complet" citit în aplicație | se descarcă, nu se citește pe loc | 🟢 90% |
| VM5-15 | Bug Iulian: aprobările dispar din PAR-ul descărcat | reparat pe main, neverificat cu el | 🟢 90% |
| VM5-16 | Flux: respinsă → revizuită → aprobată | mecanica există, fluxul nu se vede | 🟢 90% |
| VM5-16b | Schimbarea manuală a statutului cererii | nu există | 🔴 60% |
| VM5-17 | PAR-ul printat cu ștampilă de timp | doar data, fără oră | 🟢 100% |
| VM5-18 | „Posibilitatea datei din urmă a PAR-ului" | — | 🔴 nu știu ce înseamnă |
| VM5-19 | Pragul pentru necesar de achiziții (contorizare pe categorii) | un singur prag global | 🔴 55% |
| VM5-20 | Evenimentul legat de conturile bugetare (planificat vs cheltuit) | evenimentul n-are buget | 🟢 85% |
| VM5-21 | Șabloane de documente | motorul există (DOCGEN), fișierele nu | 🟡 Ana |

**Pot începe acum, fără tine: VM5-01, 03, 04, 05, 06, 08, 09, 12, 13, 14, 15, 16, 17, 20** (14 din 21).
**Aștept o propoziție de la tine: VM5-02, 11, 16b, 18.**
**Aștept răspuns de la Ana: VM5-07, 10, 19, 21.**

---

## VM5-01 — Solicitantul primește statutul și motivul — 🟢 95%

**Cerința:** „persoana care a elaborat PAR să primească feedback cu statutul PAR-ului și motivul
(de exemplu dacă a fost respinsă din anumite motive)".

**Stare azi:** mecanica e completă. Respingerea NU poate fi dată fără motiv (`comment` obligatoriu,
`server/routes/parApprovals.ts:71`), iar solicitantul primește notificare în aplicație + email cu
motivul (`notifyRejected`, `server/services/par/notify.ts:410`); la fel pentru „modificări cerute"
și pentru aprobare/plată. Motivul rămâne pe pasul de aprobare și în jurnal.

**De ce se simte totuși că lipsește:** emailul e scris **în engleză** — „PAR-2026-0025 was rejected.
Reason: …" (`notify.ts:415`). Omul care primește un email în engleză despre un formular românesc
nu-l citește ca pe un feedback. În plus, în lista lui de cereri, un rând `respins` nu spune de ce:
trebuie să intri în cerere ca să afli.

**Ce construiesc:**
1. Toate cele 9 notificări PAR trec în română, cu același corp: nr. cererii, statutul nou, cine a
   decis, când, motivul integral și linkul direct.
2. Pe rândul respins / „modificări cerute" din lista mea de cereri apare motivul (primele ~120 de
   caractere, restul la hover), ca să știu ce am de făcut fără să deschid.
3. Un banner pe fișa cererii: „Respinsă de X pe 10.09.2026, 14:32 — motiv: …" cu butonul
   „Revizuiește" (care face deja `reopen`).

**AC:** (1) niciun text de notificare PAR nu mai e în engleză (test care trece peste toate funcțiile
`notify*` și cade la un cuvânt din lista neagră); (2) emailul de respingere conține nr., decident,
data-ora și motivul; (3) lista arată motivul pe rândurile respinse; (4) linkul din email duce în
cerere (rutare cu `#`, cum e deja în `parDeepLink`).

---

## VM5-02 — Cererile colegilor de echipă — 🟡 75%

**Cerința:** „Persoanele să poată vedea inclusiv lista de PAR-uri elaborate de co-echiperi — ex.
dacă pleacă în concediu etc. (transparența în workplace)".

**Stare azi:** regula de vizibilitate e strictă și e într-un singur loc
(`server/lib/par/visibility.ts`): îți vezi **doar cererile tale**, dacă nu ai rol de
aprobator/finanțe/par_admin. Un coleg de departament nu vede nimic. (Există separat delegarea —
`par_delegations` — dar aia mută dreptul de a *semna*, nu de a *vedea*.)

**De ce nu construiesc orb:** aici se schimbă o regulă de securitate care astăzi ține IBAN-uri,
IDNP-uri și documente bancare închise. Aria contează.

**Presupunerea pe care o implementez dacă nu spui altceva:**
- „Coechiper" = **același departament SAU același proiect**.
- Se văd **doar cererile trimise** (nu ciornele — o ciornă e a autorului, ca azi).
- **Read-only**: fără aprobare, fără editare, fără comentarii.
- **Fără date bancare**: IBAN / IDNP / atașamente de tip bancar rămân mascate, ca la regula
  actuală pentru cine nu e autor sau rol elevat.
- Un filtru nou în listă: „Toate ale mele / Ale echipei", plus coloana „Solicitant".

**AC:** (1) un requestor fără rol elevat vede cererile trimise ale colegilor din aria lui și
primește 404 pe restul; (2) ciornele altcuiva rămân invizibile; (3) dosarul și atașamentele
bancare rămân refuzate (403); (4) testele existente de vizibilitate rămân verzi.

**Întrebarea pentru tine, într-o propoziție:** aria e departamentul, proiectul, sau toată
organizația?

---

## VM5-03 — Atașamentele se văd în aplicație — 🟢 90%

**Cerința:** „dacă la PAR se anexează contract, factură etc. — ele trebuie descărcate pentru
vizualizare? R/a: pot fi pre-vizualizate în aplicație".

**Stare azi:** răspunsul e **da, deja**. `src/components/par/ParAttachmentViewer.tsx` deschide
documentul peste listă, în aplicație: PDF în `<iframe>`, imagine în `<img>`, servite din ruta de
preview autorizată pe server (nu `window.open`, care scotea aprobatorul din aplicație). Se închide
cu Escape, iar scurtăturile inboxului se dezactivează cât e deschis.

**Ce rămâne:** `.docx` și `.xlsx` tot se descarcă (`renderKind()` le trimite pe butonul de
descărcare) — browserul nu le poate randa singur. Facturile vin de regulă PDF, contractele uneori
Word.

**Ce construiesc (dacă e o durere reală, nu teoretică):** conversie server-side la deschidere —
`.docx`/`.xlsx` → PDF, cache pe atașament, apoi același vizualizator. Nu adaug un al doilea
vizualizator.

**AC:** (1) un `.docx` atașat se deschide în panou fără descărcare; (2) conversia se face o
singură dată per atașament; (3) un fișier care nu poate fi convertit arată butonul de descărcare
și un mesaj clar, nu o eroare.

---

## VM5-04 — AI verifică dacă documentul corespunde destinației plății — 🟢 90%

**Cerința:** „Poate fi integrat ca AI să verifice dacă ce e atașat corespunde cu destinația plății.
De exemplu a fost indicat un alt contract sau suma nu corespunde contractului, sau de exemplu
plătitorul e altul."

**Stare azi:** **există** și rulează la fiecare încărcare de atașament
(`analyzeAttachmentAgainstPar`, `server/routes/parAttachments.ts:229–300`). Documentul e citit,
părțile din el sunt potrivite cu beneficiarul cererii, iar rezultatul se salvează pe atașament
(`par_attachments.analysis`). Se verifică 6 lucruri: **suma, valuta, beneficiarul, IDNO/IDNP,
IBAN-ul, banca**. În fișa cererii apare „Concordant" sau „N diferențe", cu lista
așteptat-vs-găsit (`src/pages/par/ParDetail.tsx:1267–1290`).

**Ce lipsește, exact cazurile numite în ședință:**
1. **„plătitorul e altul"** — nu se verifică deloc. Documentul poate fi emis pe altă firmă decât
   plătitorul cererii (avem `par_payers` cu rechizitele fiecărei entități) și nimeni nu observă.
2. **Data documentului** — nu se compară cu perioada cererii.
3. **Analiza lipsește pe atașamentele vechi** (încărcate înainte de funcție) și nu se recalculează
   când cererea se editează (suma se schimbă, verdictul rămâne vechi).

**Ce construiesc:**
- Verificare nouă **„plătitor"**: entitatea din document vs `par_payers` a cererii.
- Verificare nouă **„data documentului"**: în afara intervalului cererii → avertisment.
- Re-analiză automată când se schimbă suma/valuta/beneficiarul cererii și analiză leneșă când
  aprobatorul deschide o cerere cu atașamente neanalizate.

**AC:** (1) o factură emisă pe altă entitate produce avertismentul „plătitor"; (2) editarea sumei
invalidează verdictul vechi; (3) un document nelizibil rămâne „neverificat", nu „nepotrivit" —
diferența contează, altfel oamenii ignoră avertismentele.

**Rămâne 🟡 70% doar sub-cazul „a fost indicat alt contract"** (factura citează contractul nr. X,
dar la cerere e atașat contractul nr. Y): am nevoie de o regulă de la Ana — unde e scris numărul
contractului în facturile voastre și dacă e obligatoriu.

---

## VM5-05 — Pop-up de nepotrivire, văzut și de aprobator — 🟢 95%

**Cerința:** „Să se adauge un pop-up unde nu corespunde și aprobatorul să poată vedea / înțelege
(cel care emite vede, dar să poată vedea și aprobatorul)."

**Stare azi:** verdictul e vizibil (VM5-04), dar ca un chip mic lângă numele fișierului, iar în
inbox — unde se aprobă în serie — **nu apare nimic** (`src/pages/par/ParInbox.tsx` nu citește
`analysis`). Se poate aproba o cerere cu 3 nepotriviri fără să le fi văzut.

**Ce construiesc:**
1. **Bandă de avertisment** în capul fișei cererii, roșu/portocaliu, vizibilă atât solicitantului
   cât și aprobatorului: „2 nepotriviri între documente și cerere".
2. **Dialog de confirmare la „Aprobă"** când există nepotriviri: tabel așteptat-vs-găsit pe fiecare
   câmp, plus două butoane — „Înapoi, verific" și „Aprob în cunoștință de cauză". A doua variantă
   scrie în jurnal `approved_with_warnings` cu lista câmpurilor.
3. **Semn în inbox** pe rândul cererii, ca să nu intre în selecția de aprobare în masă din greșeală
   (și un avertisment în dialogul de „aprobă toate" dacă vreo cerere selectată are nepotriviri).

**AC:** (1) aprobarea unei cereri cu nepotriviri cere două clickuri și rămâne în jurnal ca atare;
(2) banda apare și la solicitant, cu același text; (3) „Concordant" nu produce niciun dialog —
altfel oamenii învață să dea click orbește.

---

## VM5-06 — Datele retroactive de emitere — 🟢 90%

**Cerința:** „Cum este cu datele retroactive de emitere a documentelor?"

**Stare azi:** data cererii e un câmp liber (`date_of_request`) — deci retroactivitatea e
**posibilă azi**. Și e deja semnalizată: `ParBackdatedBadge` (+ `src/lib/par/backdated.ts`) pune
badge-ul „datată în urmă cu N zile" exact acolo unde se decide — inbox, coada de finanțe, fișă.
Data introducerii în sistem (`created_at` / `submitted_at`) e păstrată separat, deci nimic nu se
pierde.

**Ce lipsește:** (1) pe **PDF** apare o singură dată — cea declarată; auditul nu vede din hârtie că
documentul a fost înregistrat trei săptămâni mai târziu; (2) nu există nicio limită și nicio
raportare a cazurilor retroactive.

**Ce construiesc:** pe PDF și pe fișa dosarului, două rânduri în loc de unul — „Data cererii: X" și
„Înregistrată în sistem: Y" (afișate diferit doar când diferă); un filtru „doar cereri retroactive"
în rapoarte, pentru revizuirea de final de perioadă.

**AC:** (1) o cerere depusă în aceeași zi arată exact ca azi (fără rând în plus); (2) una datată în
urmă arată ambele date pe hârtie; (3) filtrul returnează doar cererile cu decalaj > 0.

**Decizia ta (o cifră):** limităm retroactivitatea? Ex. „max 30 de zile, peste — doar par_admin, cu
motiv". Fără cifră, rămâne liberă și doar semnalizată.

---

## VM5-07 — Se păstrează digital sau și fizic? — 🔴 întrebare pentru Ana / audit

**Cerința:** „pot fi stocate și păstrate, sau trebuie salvate și fizic? (de verificat cu
solicitările auditului, raportare financiară)".

**Nu e un feature** — e o întrebare de conformitate la care răspunde auditorul/contabilul, nu
aplicația. Ce pot pune pe masă ca argument tehnic, dacă întreabă ce garanții avem:

- fiecare cerere e **sigilată la depunere** cu `body_hash` (SHA-256 peste antet + poziții +
  beneficiar) — orice modificare ulterioară e detectabilă și rupe aprobările;
- **jurnal complet** (`par_audit`): cine, ce, când, cu diferențele înainte/după, exportabil XLSX/PDF;
- **fișa aprobărilor** cu ore exacte, generată la fiecare descărcare a dosarului;
- atașamentele se păstrează în baza de date odată cu cererea, nu în afara ei.

Formularea întrebării pentru Ana e în secțiunea „Întrebări" de la finalul documentului.

---

## VM5-08 — Ce vede auditul: cerere, PAR, factură, dată, sumă — 🟢 90%

**Cerința:** „Pentru audit e important să vadă cererea de plată, PAR, factura — data, suma etc."

**Stare azi:** piesele există, dar **separat**: dosarul unei cereri (`GET /api/par/:id/dosar`,
`server/routes/par.ts:1988`) leagă fișa aprobărilor + toate atașamentele în ordinea dosarului;
jurnalul se exportă XLSX/PDF; rapoartele filtrează pe perioadă/proiect/plătitor. Un auditor care
cere „tot ce ați plătit în trimestrul II" primește azi 40 de descărcări separate.

**Ce construiesc — „Pachet audit":** o singură acțiune pe interval de date (+ filtre proiect /
plătitor / status) care produce:
1. un **registru** (XLSX) cu un rând per cerere: nr., data cererii, data depunerii, suma, valuta,
   plătitorul, beneficiarul, IDNO, proiectul/evenimentul, codul bugetar, statutul, cine a aprobat
   și când (pe pași), nr. facturii, data și suma plății;
2. **dosarele PDF** ale cererilor din interval, numite `PAR-2026-0025.pdf`, într-un ZIP;
3. o **pagină de gardă** cu criteriile exportului și momentul generării (ca auditul să știe ce a
   primit).

**AC:** (1) numărul de rânduri din registru = numărul de dosare din ZIP; (2) sumele din registru
sunt cele plătite efectiv acolo unde plata s-a executat, nu cele estimate; (3) exportul respectă
aria utilizatorului (un par_admin restrâns pe un proiect nu extrage alt proiect).

---

## VM5-09 — Dosarul: istoric, acte, workflow per persoană — 🟢 85%

**Cerința:** „Să se adauge opțiunea ca informația să fie păstrată la dosar (istoricul, actele
dosarului, work-flow-ul per persoană și schimbări)."

**Stare azi:** două din trei există.
- **Actele dosarului:** `ParFolders.tsx` — navigare ca într-un drive: Proiecte → Evenimente →
  Statusuri → Cereri → Documentele cererii, cu poziția în URL (Back/refresh/link merg).
- **Istoricul cererii:** `ParTimeline` + `par_audit` cu `diff` înainte/după la editări.
- **Workflow-ul per persoană:** *parțial*. Jurnalul are deja filtru pe actor
  (`actor_user_id`, `server/routes/parAudit.ts:104`), dar e îngropat în tabul Audit din admin — deci
  practic nimeni în afară de administrator nu poate răspunde la „ce a făcut Iulian săptămâna asta".

**Ce construiesc:** ecran „Activitatea" — o persoană + un interval → tot ce a făcut în PAR
(a creat / a depus / a aprobat / a respins / a plătit), cu link în fiecare cerere și export. Vizibil
pentru par_admin oricând, iar pentru un utilizator obișnuit — propria activitate (util și la
predarea lucrului înainte de concediu, ca la VM5-02).

**AC:** (1) filtrul persoană + interval returnează aceleași rânduri ca jurnalul de admin;
(2) fiecare rând duce în cererea lui; (3) un utilizator obișnuit nu poate cere activitatea altcuiva
decât dacă VM5-02 e activat pentru aria lui.

---

## VM5-10 — Aprobări în plus pe tipuri de achiziții + documente obligatorii — 🔴 70%

**Cerința:** „De adăugat aprobarea pentru anumite achiziții (gen.: cine mai trebuie să aprobe în
caz de anumite tipuri de achiziții, sau ce alte documente trebuie atașate)."

**Stare azi:** matricea DOA (`par_doa_matrix`) rutează deja aprobarea pe **sumă** (interval
min/max), **departament**, **proiect**, **plătitor** și **„charge to"** (operations / program /
other), secvențial sau în paralel. Ce **nu** există: dimensiunea „tip de achiziție" și regula
„la tipul T sunt obligatorii documentele A, B, C" (azi există doar bifa `attachments_present` și
tipurile de atașament: contract, ofertă, factură, act de primire, listă participanți etc.).

**De ce mă opresc:** îmi lipsește **taxonomia**. „Tipuri de achiziții" poate însemna cinci lucruri
diferite (servicii / bunuri / lucrări / deplasări / IT / consultanță / chirii…), iar de ea depinde
și formularul, și regulile, și rapoartele. Nu o inventez eu — ar trebui refăcută peste o lună.

**Ce construiesc imediat ce am lista (o zi de lucru, două părți):**
1. Câmp „tip de achiziție" pe cerere (obligatoriu, listă administrabilă) + dimensiune nouă în
   regulile de aprobare — deci „la consultanță semnează în plus directorul executiv" devine o regulă,
   nu o convenție verbală.
2. Reguli de documente: „la tipul T sunt obligatorii [contract, 3 oferte, act de primire]",
   verificate **la depunere** — cererea nu pleacă fără ele, cu mesaj care spune exact ce lipsește.

**Ce am nevoie de la Ana:** lista tipurilor de achiziție + pentru fiecare: cine mai semnează și ce
documente sunt obligatorii. (Alternativa fără Ana: folosim codul bugetar ca proxy pentru tip — dar
e o cârjă, nu o soluție.)

---

## VM5-11 — Emailurile în batch-uri de aprobare — 🟡 85%

**Cerința:** „Emailurile să vină în batch-uri de aprobare."

**Stare azi:** un email per eveniment (`server/services/par/notify.ts`) — la 20 de cereri depuse
într-o dimineață, aprobatorul primește 20 de emailuri. Nu există niciun mecanism de grupare și
nicio setare de frecvență.

**Ce construiesc, cu presupunerea declarată:**
- **Digest** „Ai N cereri de aprobat", trimis la ore fixe — **09:00 și 16:00, ora Chișinăului** —
  cu tabel (nr., solicitant, sumă, proiect, de când așteaptă) și link direct pe fiecare rând, plus
  un link „Deschide inboxul".
- **Rămân instant**, indiferent de setare: respingerea, „modificări cerute", plata executată și
  anularea plății — sunt lucruri la care omul trebuie să reacționeze acum.
- **Comutator per utilizator**: instant / digest / ambele. Implicit pentru aprobatori: digest.
- Dacă în fereastră n-a apărut nimic, **nu se trimite** email gol.

**AC:** (1) două cereri depuse la 10:00 și 10:05 produc UN email la 16:00, nu două; (2) o respingere
la 10:07 produce email imediat; (3) o cerere deja decisă până la ora digestului nu mai apare în el;
(4) setarea e per utilizator și se respectă.

**Confirmă-mi doar orele** (09:00/16:00) — restul e decis.

---

## VM5-12 — Unul respinge, altul aprobă — 🟢 95%

**Cerința:** „Ce se întâmplă când unul respinge, iar altul aprobă."

**Răspunsul de azi, din cod:** **prima respingere oprește tot**. Respingerea e terminală
(`server/routes/parApprovals.ts:919–923`): cererea trece în `rejected` indiferent câți aprobatori
mai erau pe nivelul paralel și indiferent dacă alții aprobaseră deja. Autorul o poate recupera:
`reopen` (`server/routes/par.ts:1807`) o duce înapoi în ciornă, o revizuiește, o retrimite — și
lanțul de aprobare se reconstruiește de la zero, din matricea DOA curentă.

Deci regula e bună. **Problema e că nu se vede:** colegul care încă avea rândul „în așteptare" nu
află niciodată de ce a dispărut cererea din inboxul lui, iar cel care aprobase deja nu află că
decizia lui a fost anulată de altcineva.

**Ce construiesc:**
1. Rândurile rămase pe nivel se marchează explicit „nu mai e necesar — respinsă de X la ora Y", nu
   dispar tăcut.
2. Notificare către ceilalți aprobatori ai nivelului (și către cei care aprobaseră deja).
3. Un rând în istoric care spune povestea în limbaj omenesc: „Irina a aprobat la 14:02 · Iulian a
   respins la 14:20 → cererea s-a oprit".
4. O propoziție în ajutorul din aplicație, ca să nu se mai pună întrebarea la următoarea ședință.

**AC:** (1) după respingere, niciun alt aprobator nu mai poate decide (409); (2) inboxul celorlalți
arată motivul dispariției; (3) aprobările date înainte rămân în jurnal, nu se șterg.

---

## VM5-13 — „Aprobă toate" / „Respinge toate" — 🟢 100%

**Cerința:** „Trebuie buton aprobă toate sau respinse toate."

**Stare azi:** „aprobă toate" **există** — selecție cu checkbox în inbox, bară lipită jos, dialog cu
semnătură și comentariu, `POST /api/par/bulk-approve` (max 25 per apel,
`server/routes/parApprovals.ts:801`), fiecare cerere rulând exact aceeași logică ca aprobarea
individuală, cu rezultat per rând. „Respinge toate" **nu există** — nici endpoint, nici buton.

**Ce construiesc:** simetricul exact — `POST /api/par/bulk-reject`, cu **motiv obligatoriu** comun
pe lot (respingerea fără motiv nu e permisă nicăieri în sistem și nu va fi nici aici), buton
„Respinge selectate" în aceeași bară, dialog cu avertisment („respingerea oprește cererea; autorul
o poate revizui"), rezultat per cerere (reușit / eroare, cu motivul erorii).

**AC:** (1) fără motiv → 400, nimic nu se respinge; (2) o cerere din lot pe care nu am autoritate
eșuează singură, restul se procesează; (3) fiecare respingere din lot notifică autorul ei;
(4) jurnalul arată respingerile individual, nu ca o operație în masă anonimă.

---

## VM5-14 — „Descarcă dosar complet" — și citit în aplicație — 🟢 90%

**Cerința:** „«Descarcă dosar complet» — să poată fi vizualizat în aplicație."

**Stare azi:** descărcarea există (`GET /api/par/:id/dosar` — fișa aprobărilor ca primă pagină, apoi
atașamentele în ordinea dosarului), iar documentele individuale se pot deschide în vizualizator
(VM5-03). Ce nu există: „citește tot dosarul, în ordine, într-un singur ecran".

**Ce construiesc:** tab „Dosar" pe fișa cererii — fișa aprobărilor plus toate documentele randate în
ordinea dosarului, derulare continuă, cu un cuprins lateral (sari la „Contract", „Factură", „Ordin
de plată") și butonul de descărcare rămas unde e. Aceeași regulă de vizibilitate ca la descărcare —
nu deschid o portiță nouă spre IBAN-uri.

**AC:** (1) ordinea din ecran = ordinea din PDF-ul descărcat; (2) cine nu are drept de dosar
primește 403 și în tab; (3) un dosar cu 10 documente nu blochează pagina (randare pe măsură ce
derulezi).

---

## VM5-15 — Bug Iulian: aprobările dispar din PAR-ul descărcat — 🟢 90%

**Cerința:** „La descărcarea PAR prima dată e approve de la ambii, iar ulterior a dispărut (la
Iulian)."

**Stare azi:** pe `main` s-au reparat pe 10 septembrie exact trei defecte din zona asta
(`4fc9b63e`, `1506c873`): (1) numele semnatarului se rezolvă din tabela de utilizatori, nu din
eticheta funcției; (2) un slot rămas fără titular se etichetează „Aprobator", nu cu numele altcuiva;
(3) `pickDecidableStep` (`server/lib/par/decisionAuthority.ts:94`) preferă rândul **pinned pe mine**
— înainte, pe un nivel paralel, semnătura unui aprobator putea ateriza pe rândul colegului, iar
rândul lui rămânea „în așteptare", deci la a doua descărcare o casetă apărea goală. Asta explică
fix simptomul lui Iulian.

**Ce fac:** cer numărul cererii lui, reproduc descărcarea de două ori pe datele reale, confirm că
ambele casete se completează. Dacă mai apare, repar și adaug **testul de regresie** care lipsește:
descarcă de două ori aceeași cerere și compară casetele de semnătură.

**AC:** (1) două descărcări consecutive produc secțiunile 14–15 identice; (2) fiecare aprobator
apare pe rândul lui, cu funcția lui; (3) testul cade dacă cineva reintroduce alegerea „primul rând
returnat de bază".

**Îmi trebuie de la tine:** numărul PAR-ului lui Iulian.

---

## VM5-16 — Fluxul cererii: respinsă → revizuită → aprobată — 🟢 90%

**Cerința:** „Flow-ul per PAR ex.: respinsă, revizuite, aprobat și posibilitatea de schimbare a
statutului cererii."

**Stare azi:** mecanica există aproape integral — 9 statusuri (`ciornă → în aprobare → aprobată →
la finanțe → plătită`, plus `modificări cerute`, `respinsă`, `reaprobare necesară`, `anulată`),
`reopen` pentru o cerere respinsă, `withdraw` pentru retragerea din aprobare la corectură
(cu anularea explicită a aprobărilor deja date, pentru că au fost date pe alt conținut), iar
finanțele pot întoarce cererea (`finance-return`, VM4-02).

**Ce lipsește:** fluxul **nu se vede**. Chip-ul de status arată doar unde ești acum, nu pe unde ai
trecut, și nu se vede că o cerere e la a doua rundă.

**Ce construiesc:** bandă de flux pe fișa cererii — pașii cu starea și data fiecăruia
(depusă 02.09 → respinsă 03.09 → revizuită 04.09 → aprobată 05.09 → plătită 08.09), plus eticheta
„revizuită (v2)" pe cererile retrimise, vizibilă și în listă.

**AC:** (1) banda arată toate rundele, nu doar ultima; (2) revizuirile se numără corect;
(3) o cerere simplă (depusă → aprobată) arată o bandă simplă, fără zgomot.

---

## VM5-16b — Schimbarea manuală a statutului — 🔴 60%

Partea a doua a cerinței — „posibilitatea de schimbare a statutului cererii" — o separ intenționat.

Azi statusul se schimbă **numai** prin acțiuni cu autor și motiv (aprobă, respinge, retrage,
returnează, plătește, anulează plata). Un buton „pune tu statusul care vrei" e exact genul de
funcție care sparge auditul: din acel moment, nimeni nu mai poate demonstra că `plătit` înseamnă
că s-a plătit.

**Ce am nevoie ca să-l fac în siguranță:** (1) cine are dreptul (doar par_admin?); (2) din ce stare
în ce stare e permis (o listă scurtă, nu „oricare în oricare"); (3) motivul obligatoriu, da/nu.
Cu răspunsurile astea îl construiesc cu tot cu jurnal și marcaj vizibil „status schimbat manual de
X". Fără ele, nu-l fac.

---

## VM5-17 — PAR-ul printat cu ștampilă de timp — 🟢 100%

**Cerința:** „PAR-ul printat să aibă time stamp (când a fost depus, aprobat etc.)."

**Stare azi:** jumătate există, dar în alt document. **Fișa aprobărilor** din dosar are ore complete
(`server/lib/par/approvalSheet.ts`): „Generată la …", „Aprobat la …", „Plătit la …" și ora fiecărei
decizii. **Formularul PAR** (PDF-ul propriu-zis, `src/lib/parPdf.ts:127`) are doar data, fără oră,
și nu are deloc momentul depunerii.

**Ce construiesc:** pe formular — „Depusă la: 02.09.2026, 11:14" în antet, ora lângă data fiecărei
semnături, iar în subsol „Generat la … din sistemul PAR" (ca fișa aprobărilor). Formatul rămâne cel
românesc, ca peste tot.

**AC:** (1) o cerere nedepusă nu arată o oră inventată; (2) orele sunt în fusul Chișinăului;
(3) formatul e identic cu cel din fișa aprobărilor — un document, un stil.

---

## VM5-18 — „Posibilitatea datei din urmă a PAR-ului" — 🔴 nu știu ce înseamnă

Am notat cerința ca atare: „De inclus posibilitatea datei din urmă a PAR-ului". Am două citiri
plauzibile și fac lucruri complet diferite:

**(a) Data din trecut** — adică backdating, deci același lucru cu VM5-06 (și e deja posibil + marcat).

**(b) O dată-limită** — până când cererea mai e valabilă / până când trebuie plătită, cu avertisment
la depășire. (Există deja `date_needed` — „data la care sunt necesare bunurile/serviciile" — deci ar
fi o a doua dată, cu alt înțeles.)

O propoziție de la tine și o fac. Dacă e (a), item-ul dispare în VM5-06.

---

## VM5-19 — Pragul pentru necesar de achiziții (contorizare pe categorii) — 🔴 55%

**Cerința:** „De văzut când se trece pragul pentru necesar de achiziții și să știm că trebuie
achiziții — necesitatea de contorizare a cheltuielilor, plăților per categorii."

**Stare azi:** există **un singur prag**, global pe organizație
(`par_settings.micro_purchase_threshold_cents`, `server/db/schema/par.ts:436`) și el afectează doar
numărul de trepte de aprobare. Rapoartele însumează deja pe cod bugetar / proiect / eveniment /
plătitor / furnizor, cu `angajat` (committed) și `plătit` separat — deci **datele pentru contorizare
există**, ceea ce lipsește e regula.

**De ce nu încep:** trei necunoscute, fiecare schimbând implementarea:
1. **Pe ce se contorizează** — cod bugetar? tip de achiziție (vezi VM5-10)? furnizor? Legea
   achizițiilor numără de regulă pe **obiect similar și pe furnizor**, nu pe linie bugetară.
2. **Pe ce perioadă** — an calendaristic, an de proiect, 12 luni mobile?
3. **Ce cifre** — pragurile concrete (din regulamentul intern sau din lege).

**Ce construiesc imediat ce am cele trei răspunsuri (~1 zi):** contor pe categoria aleasă + două
avertismente — unul **la creare** („cu această cerere treci de pragul de X pe categoria Y → e nevoie
de procedură de achiziție, atașează 3 oferte") și unul **în raport** (linii colorate care se apropie
de prag), plus un raport „cheltuieli pe categorii vs praguri" pentru revizuirea periodică.

---

## VM5-20 — Evenimentul legat de conturile bugetare — 🟢 85%

**Cerința:** „Evenimentul să fie unit cu conturi bugetare (să fie creată logica) — să vadă linia:
cât era planificat și cât s-a cheltuit; la event nu s-a depășit totalul."

**Stare azi:** evenimentul există ca entitate (`par_events`, sub proiect), cererile se leagă de el,
iar raportul pe evenimente însumează angajat + plătit. **Dar evenimentul n-are buget**: în
`GET /api/par/reports/by-event` alocarea e literalmente zero
(`server/routes/parReports.ts:292` — `cast(0 as integer)`), deci coloana „disponibil" iese negativă
și raportul nu poate răspunde la „ne-am încadrat?". Codurile bugetare, în schimb, au alocare cu
monedă proprie (un grant în EUR rămâne în EUR, comparațiile se fac în lei la cursul BNM).

**Ce construiesc:** buget **pe linii** la nivel de eveniment — pentru fiecare eveniment, N rânduri
(cod bugetar × sumă alocată × monedă), administrate în ecranul de admin, cu totalul evenimentului
calculat din ele. Apoi:
- raportul pe evenimente arată **planificat / angajat / plătit / disponibil**, pe fiecare linie și
  pe total, ca raportul pe coduri bugetare;
- **avertisment la depunere** când cererea depășește linia sau totalul evenimentului (avertisment,
  nu blocaj — blocajul îl pui tu dacă vrei, e o setare);
- import din Excel al bugetului de eveniment (motorul de import de configurări există deja).

**AC:** (1) un eveniment fără buget se comportă ca azi, nu arată „disponibil negativ";
(2) alocarea în EUR se compară corect cu cheltuieli în MDL (curs BNM, ca la codurile bugetare);
(3) suma liniilor = totalul evenimentului, verificat la salvare.

**Decizia mică:** buget **pe linii** (recomand — „să vadă linia" asta cere) sau doar o sumă globală
pe eveniment? Dacă nu spui nimic, fac pe linii.

---

## VM5-21 — Șabloane de documente — 🟡 blocat pe fișierele de la Ana

**Cerința:** „Templaturi de documente sunt — Ana will provide to include."

**Stare azi:** **motorul e construit deja** — modulul DOCGEN (vezi
[`docgen/DOCGEN-BACKLOG.md`](../docgen/DOCGEN-BACKLOG.md), livrat integral): șabloane cu câmpuri
`{{...}}`, editor ca la Word pentru jurist (fără HTML), formular generat automat din șablon,
selector de contraparte care trage toate rechizitele, numerotare automată per tip și an, PDF cu
antet/subsol și diacritice, semnături, export `.docx`, „**Transformă în PAR**" (actul generat
devine cerere precompletată, cu PDF-ul atașat automat) și invers.

**Deci nu e dezvoltare, e conținut.** Când Ana trimite fișierele Word: le transform în șabloane
(marchez câmpurile variabile), le încarc pe organizație, verific numerotarea și un document de
probă din fiecare tip.

**Ce cer de la Ana:** fișierele `.docx` + pentru fiecare: cine îl semnează, cum se numerotează
(prefix + de la ce număr pornim în 2026) și dacă are anexe obligatorii.

---

## Întrebări de trimis Ana (formulate ca să poată răspunde scurt)

1. **Arhivare (VM5-07):** pentru audit și raportare financiară, e suficient ca cererea de plată,
   PAR-ul semnat electronic și documentele atașate să existe doar în aplicație (cu jurnal de
   modificări și sigiliu de integritate), sau trebuie păstrat și exemplarul fizic semnat? Dacă
   trebuie și fizic — pentru toate documentele sau doar pentru unele tipuri?
2. **Termen de păstrare:** câți ani trebuie păstrate documentele și există cerințe de format
   (PDF/A) pentru arhivă?
3. **Tipuri de achiziții (VM5-10):** care e lista tipurilor pe care le folosiți și, pentru fiecare —
   cine trebuie să semneze în plus și ce documente sunt obligatorii?
4. **Praguri de achiziții (VM5-19):** care sunt pragurile în cifre, pe ce se numără (obiect similar,
   furnizor, cod bugetar) și pe ce perioadă (an calendaristic / an de proiect)?
5. **Documentul care justifică plata (VM5-04):** în facturile voastre, unde apare numărul
   contractului și e obligatoriu? (Ne trebuie ca AI-ul să prindă cazul „s-a atașat alt contract".)
6. **Șabloane (VM5-21):** fișierele Word + pentru fiecare: semnatarii, regula de numerotare și
   anexele obligatorii.

## Întrebări pentru owner (fiecare, o propoziție)

1. **VM5-02:** „coechiper" = același departament, același proiect, sau toată organizația?
2. **VM5-06:** limităm retroactivitatea (ex. max 30 de zile, peste — doar par_admin cu motiv) sau
   rămâne liberă și doar semnalizată?
3. **VM5-11:** digest la 09:00 și 16:00 — bine?
4. **VM5-16b:** cine poate schimba manual statutul și între ce stări?
5. **VM5-18:** „data din urmă a PAR-ului" = dată din trecut (backdating) sau dată-limită de valabilitate?
6. **VM5-15:** numărul cererii lui Iulian, pentru reproducere.
7. **VM5-20:** buget de eveniment pe linii de cod bugetar (recomandat) sau o sumă globală?
