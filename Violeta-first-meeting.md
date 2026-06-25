# Violeta — First Meeting · Backlog de features PAR

> **Context:** notițe + backlog desfășurat din prima ședință cu Violeta. Totul este despre modulul
> **PAR** (Payment Action Request — cererea de plată / acțiune de plată din ONG-uri).
> Documentul are două roluri: (1) traduce fiecare cerință a Violetei într-un item de backlog scris
> pe larg, cu criterii de acceptare; (2) arată **ce există deja** în produs vs. **ce e nou**, ca să nu
> reconstruim ce e gata și să estimăm corect efortul.
>
> Data: 2026-06-25 · Modul: PAR (`/business/par/*` și `/app/par/*`) · Prefix backlog: **VM1-xx**
> (Violeta Meeting 1).

---

## 0. Unde suntem azi cu PAR (pe scurt, înainte de features)

PAR-ul nu pornește de la zero — e un modul matur. Înainte de a citi cerințele, e important de știut
ce e **deja construit**, pentru că ~6 din cele 13 cerințe ale Violetei sunt deja parțial sau total
acoperite și trebuie doar finisate / scoase la suprafață în UI.

**Există deja:**
- Formularul PAR cu 16 secțiuni (header, articole/linii, plătitor, lanț de aprobare, plată/finanțe).
- **Roluri**: `requestor`, `approver`, `finance`, `par_admin` (tabel `parMembers`), cu plafon de
  aprobare per persoană (`approvalLimitCents`) și o **matrice DOA** (Delegation of Authority) care
  rutează aprobarea pe trepte, în funcție de sumă / departament / „charge to".
- **Multi-valută**: câmpul `currency` (MDL/EUR/USD/RON) + cursul (`exchangeRate`) și totalul în MDL
  (`totalMdlCents`) înghețate la submit.
- **Atașamente multiple** per PAR (contract, act de primire, ofertă, factură etc.), max ~10 MB/fișier.
- **Email + notificări în-app** la submit / aprobare / respingere / plată, prin infrastructura de
  mesagerie existentă.
- **Aprobare în masă** (`bulk-approve`) — endpoint care aprobă până la 25 de PAR-uri dintr-un apel.
- **Registru de prestatori** (`parVendors`) cu IBAN + IDNP + bancă, reutilizabil între PAR-uri.
- **Export PDF** al formularului PAR (client-side, păstrează diacriticele).
- **Statusuri** care funcționează deja ca „foldere logice": `draft → pending_approval → approved →
  in_finance → paid` (+ `changes_requested`, `rejected`, `cancelled`), grupate pe dashboard.
- **Extracție AI pentru facturi** în modulul vecin (FinDesk / `captureExtractor`) — exact tehnologia
  pe care Violeta o vrea aplicată la PAR.

**Nu există încă (net-nou):**
- Conceptul de **eveniment** legat de PAR (dropdown de evenimente).
- **Import din Excel** (orice fel).
- **Auto-salvarea** prestatorului în registru când se face prima plată.
- **Folderele per proiect** (azi gruparea e pe status, plat, nu pe proiect).
- **Merge real** PAR + atașamente într-un singur PDF + **ordin de plată** adăugat de contabil.
- **Maparea AI** a documentelor încărcate în câmpurile PAR (deși motorul AI există la facturi).

Mai jos, fiecare cerință devine un item de backlog desfășurat.

---

## VM1-01 — Funcțiile PAR pe roluri, atribuite pe persoane

**Ce a cerut Violeta:** „să facem funcțiile de PAR să fie rolul la persoane" — fiecare persoană să
aibă un rol clar, iar ce poate face în PAR să depindă de rolul ei.

**Stare actuală:** Sistemul de roluri **există deja** la nivel de date și logică:
- Tabel `parMembers (tenantId, userId, role, approvalLimitCents)`, roluri: `requestor`, `approver`,
  `finance`, `par_admin`.
- Middleware `requirePARRole(...)` păzește fiecare endpoint.
- Matricea DOA (`parDoaMatrix`) decide *cine* aprobă *ce sumă*, fie pe persoană explicită
  (`approverUserId`), fie pe rol (`approverParRole`).
- Vizibilitate deja diferențiată: requestor-ul vede doar cererile lui, approver-ul vede ce poate
  aproba, finance vede coada de plată, par_admin vede tot.

**Ce construim (gap-ul real):** o **pagină „Oameni & Roluri"** prietenoasă în admin (`ParAdmin`),
unde par_admin:
1. Vede toți membrii organizației cu rolul/rolurile lor PAR într-un tabel.
2. Atribuie/retrage un rol cu un singur click (o persoană poate avea mai multe roluri simultan —
   ex. și `requestor`, și `approver`).
3. Setează **plafonul de aprobare** per persoană (în valuta de bază) — ex. „Maria aprobă până la
   50 000 MDL, peste asta urcă la director".
4. Vede, pentru fiecare persoană, **pe ce trepte din matricea DOA** apare (ca să nu rămână o treaptă
   fără aprobator).
5. (Opțional) **deleagă temporar** rolul de aprobator altcuiva pe o perioadă (tabelul
   `parDelegations` există deja — îl scoatem în UI).

**Criterii de acceptare:**
- Par_admin poate adăuga și șterge roluri pentru orice membru, fără SQL.
- O persoană fără niciun rol PAR nu vede modulul (sau îl vede read-only, decidem la VM1 §Întrebări).
- Schimbarea unui plafon de aprobare se reflectă imediat în rutarea DOA pentru PAR-urile noi.
- Acțiunile sunt logate în `parAudit` (cine a dat/luat ce rol, când).
- Tot fluxul respectă tenant-ul (un par_admin nu vede oamenii altei organizații).

**Reuse / dependențe:** `parMembers`, `parDoaMatrix`, `parDelegations`, `requirePARRole`. Efort mic-mediu
(mare parte e UI peste API existent).

---

## VM1-02 — Import din Excel ⚠️ (de clarificat: importăm CE, exact?)

**Ce a cerut Violeta:** „să putem face import la Excel, dar la ce anume?" — întrebarea e pusă explicit
chiar de ea. Înainte de build trebuie decis **ce date** se importă, pentru că UX-ul și validarea diferă
radical. Mai jos cele 4 interpretări plauzibile, cu recomandare.

**Opțiuni (ce poate însemna „import Excel"):**

| Variantă | Ce importă | Valoare | Complexitate |
|---|---|---|---|
| **A. Registru de prestatori** | Listă de furnizori/prestatori (nume, IDNP, IBAN, bancă) → populează `parVendors` | Mare — scapă de tastarea manuală a zecilor de furnizori | Mică |
| **B. Date de configurare** | Proiecte, departamente, coduri de buget, (evenimente — vezi VM1-04) | Medie — setup rapid la onboarding | Mică |
| **C. Liniile unui PAR** | Articolele (descriere, cantitate, unitate, preț) dintr-un xlsx → secțiunea 10 a unei cereri | Mare pentru PAR-uri cu zeci de poziții (achiziții mari) | Medie |
| **D. PAR-uri în masă** | Un rând Excel = un PAR întreg (creare bulk de cereri) | Nișă, riscant (validare grea, plătitor, aprobări) | Mare |

**Recomandare:** livrăm **A + C** întâi (cea mai mare valoare / efort mic-mediu), apoi **B** la
onboarding. **D** doar dacă Violeta confirmă un caz real (ex. migrare dintr-un sistem vechi).

**Ce construim (pentru A + C):**
- Buton „Import din Excel" cu un **template descărcabil** (.xlsx cu coloanele exacte și un rând exemplu).
- Upload → **parsare** (reutilizăm `exceljs`, deja în proiect — **obligatoriu `import()` dinamic**, nu
  top-level, ca să nu pice tot API-ul în prod — vezi lecția PAR-port/exceljs).
- **Ecran de previzualizare + mapare**: utilizatorul vede rândurile parsate, mapează coloanele dacă
  nu se potrivesc cu template-ul, vede erorile de validare (IBAN invalid, IDNP ≠ 13 cifre, preț
  ne-numeric) marcate pe rând.
- Import doar rândurile valide; raport „X importate, Y sărite + motivul".
- Dedup la prestatori (după IDNP/IBAN) — nu dublăm un furnizor existent.

**Criterii de acceptare:**
- Template-ul descărcat, completat și re-încărcat se importă fără pierderi.
- Un fișier cu rânduri invalide nu blochează rândurile valide; userul vede clar ce a fost sărit.
- Parsarea Excel se face prin `import()` dinamic (zero impact la bundle-ul de API).
- Importul respectă tenant-ul și e logat.

**Reuse / dependențe:** `exceljs` (dinamic), `parVendors`, validatorii IBAN/IDNP (`server/lib/par/validators.ts`),
`parLineItems`. **Decizie necesară de la Violeta: confirmăm A+C ca scope inițial?**

---

## VM1-03 — PAR-uri în valute diferite (multi-currency)

**Ce a cerut Violeta:** „să punem PAR-urile în diferite valute".

**Stare actuală:** Baza **există deja**: `parRequests.currency` (MDL/EUR/USD/RON), `exchangeRate`
(numeric 14,6) și `totalMdlCents` înghețate la submit; `parSettings.defaultCurrency`. Logica de
conversie la submit e implementată (VF-203).

**Ce construim (gap-ul real — vizibilitate + cursul):**
1. **Selector de valută vizibil** în formularul de creare PAR (azi e mai mult „în spate"), cu valuta
   implicită a organizației pre-selectată.
2. Afișarea valutei peste tot: în liste/dashboard, în inbox-ul de aprobare, pe PDF, în email
   (suma vine cu simbolul/codul corect, nu presupus MDL).
3. **Cursul de schimb**: azi e un câmp; decidem sursa —
   - (a) **manual** — requestor-ul/finance introduce cursul, sau
   - (b) **automat** — preluăm cursul BNM (Banca Națională a Moldovei) la data submit-ului.
   Recomandare: (b) cu fallback la (a) dacă API-ul BNM nu răspunde; cursul rămâne înghețat după submit.
4. **Totaluri agregate**: pe rapoarte și pe folderele per proiect, sumele în valute diferite se
   convertesc în valuta de bază (MDL) pentru un total comparabil, dar se păstrează și valuta originală.

**Criterii de acceptare:**
- Pot crea un PAR în EUR; lista, PDF-ul și email-ul arată „€" și suma corectă, plus echivalentul MDL.
- Cursul folosit e cel de la data submit-ului și nu se mai schimbă retroactiv.
- Rapoartele pe proiect însumează corect PAR-uri în valute mixte (în MDL), fără să „piardă" valuta originală.

**Reuse / dependențe:** `currency`, `exchangeRate`, `totalMdlCents`, `parSettings.defaultCurrency`.
Net-nou: integrarea cursului BNM (mic serviciu + cache zilnic). Efort mic-mediu.

---

## VM1-04 — Dropdown de evenimente (la ce eveniment se referă PAR-ul)

**Ce a cerut Violeta:** „să apară și dropdown cu evenimente ca să știm la ce eveniment se referă".

**Stare actuală:** Concept **net-nou**. Azi PAR-ul se leagă de **proiect**, **departament** și **cod
de buget** — dar nu de un *eveniment* concret (ex. „Conferința X 12 iunie", „Tabăra de vară",
„Distribuția de ajutoare martie"). În ONG-uri, raportarea către donatori se face des **pe eveniment**,
deci e o cerință reală.

**Ce construim:**
1. Tabel nou `parEvents (id, tenantId, projectId?, name, startsAt?, endsAt?, active, ...)` — model
   identic ca `parProjects` (deci reuse de pattern). Eveniment **opțional legat de un proiect**.
2. În formularul PAR: un **dropdown „Eveniment"**, ideal **filtrat după proiectul selectat** (alegi
   întâi proiectul, apoi vezi doar evenimentele lui). Câmp **opțional** (nu orice PAR ține de un eveniment).
3. Câmp `eventId` pe `parRequests` (FK nullable).
4. Admin (`ParAdmin`): CRUD pe evenimente (la fel ca proiecte/departamente), inclusiv interval de date.
5. **Filtru + grupare pe eveniment** în dashboard și rapoarte („toate plățile evenimentului X").
6. Afișarea evenimentului pe PDF și în email-ul de aprobare (vezi VM1-08).

**Criterii de acceptare:**
- Pot crea evenimente în admin și le pot lega (opțional) de un proiect.
- Dropdown-ul din PAR arată evenimentele relevante; selecția se salvează și apare pe detaliu/PDF/email.
- Pot filtra lista de PAR-uri după eveniment și pot vedea totalul cheltuit pe un eveniment.
- Adăugarea tabelului respectă disciplina de migrări (migrare commit-uită + `index.ts` actualizat — §3.5.1).

**Reuse / dependențe:** pattern `parProjects`. Net-nou: tabel + 1 coloană FK + UI. Efort mic-mediu.

---

## VM1-05 — Auto-salvarea prestatorului (IBAN etc.) la prima plată

**Ce a cerut Violeta:** „odată ce va fi plată pentru un anumit prestator, dacă a fost adăugat IBAN și
alte chestii, să se autosalveze" — adică să nu re-introducem datele aceluiași furnizor data viitoare.

**Stare actuală:** Există registrul `parVendors` (nume, IDNP, IBAN, bancă) **și** posibilitatea de a
introduce un plătitor **inline** (snapshot pe PAR: `payeeName/payeeIdnp/payeeIban/payeeBank`). Ce
lipsește: **podul automat** între plătitorul inline și registru. Azi, dacă scrii un furnizor inline,
data viitoare îl scrii din nou.

**Ce construim:**
1. Când un PAR cu **plătitor inline** (fără `vendorId`) ajunge la **plată** (sau, mai devreme, la
   aprobare — decidem), verificăm dacă există deja un vendor cu același IBAN/IDNP în tenant:
   - **nu există** → **creăm automat** o intrare `parVendors` din snapshot și legăm PAR-ul de ea;
   - **există** → **actualizăm** câmpurile lipsă (ex. completăm banca/IBAN dacă registrul nu le avea)
     și legăm PAR-ul de vendor-ul existent.
2. La PAR-urile viitoare, prestatorul apare în **dropdown-ul de plătitori** cu IBAN-ul pre-completat
   — un singur click, fără re-tastare.
3. Un mic indicator „salvat în registru ✓" în UI ca userul să știe că s-a memorat.
4. Respectăm GDPR: IDNP/IBAN sunt date sensibile — auto-salvarea rămâne în tenant, nu se expune cross-tenant.

**Decizie:** auto-salvăm **la plată** (cum a zis Violeta, „odată ce va fi plată") sau mai devreme, la
**submit/aprobare**? Recomandare: la **prima plată confirmată** (atunci IBAN-ul e cel real, verificat),
cu opțiunea ca finance să bifeze „nu salva acest furnizor" pentru plăți unice.

**Criterii de acceptare:**
- După prima plată către un furnizor nou inline, acesta apare automat în registru cu IBAN-ul corect.
- La al doilea PAR, îl pot selecta din dropdown și IBAN-ul se completează singur.
- Nu se creează duplicate (dedup după IBAN/IDNP).
- Acțiunea e logată (`parAudit`: „vendor auto-created from PAR #...").

**Reuse / dependențe:** `parVendors`, snapshot-ul de plătitor de pe `parRequests`, `parPayments`,
validatorii IBAN/IDNP. Efort mic.

---

## VM1-06 — Mai multe fișiere la încărcare (contract, act), maxim 10

**Ce a cerut Violeta:** „la PAR să poți adăuga mai multe fișiere când încarci contract, act, maxim 10".

**Stare actuală:** Atașamentele **multiple există deja** (`parAttachments`, cu `kind`:
act_of_receipt / contract / quotation / invoice / par_pdf / other), max ~10 MB/fișier, tipuri permise
pdf/png/jpg/docx/xlsx. Ce lipsește: **limita de 10 fișiere** și un **UX de încărcare multiplă** (azi
probabil se încarcă unul câte unul).

**Ce construim:**
1. **Multi-select / drag & drop**: utilizatorul selectează mai multe fișiere deodată; fiecare cu
   `kind`-ul lui (contract / act / ofertă / factură / altele).
2. **Limită dură de 10 atașamente / PAR**, enforced **și pe server**, nu doar în UI. La al 11-lea →
   mesaj clar „maxim 10 fișiere per cerere".
3. Bară de progres + posibilitatea de a **șterge** un fișier înainte de submit.
4. Validare de tip și mărime pe fiecare fișier (refolosim `ALLOWED_MIME_TYPES` + limita de 10 MB).
5. Lista de atașamente pe detaliu arată numele, tipul, cine a încărcat și când.

**Criterii de acceptare:**
- Pot încărca până la 10 fișiere; al 11-lea e refuzat clar (și pe server).
- Pot încărca mai multe deodată (multi-select sau drag-drop), nu obligatoriu unul câte unul.
- Fiecare fișier are un tip (contract/act/etc.) și poate fi șters înainte de finalizare.
- Fișierele apar grupate pe tip în detaliul PAR și intră în merge-ul de la VM1-12.

**Reuse / dependențe:** `parAttachments`, `server/routes/parAttachments.ts`. Efort mic (în mare e UI +
o limită pe server).

---

## VM1-07 — Email către aprobator când cineva face un request

**Ce a cerut Violeta:** „la fel să se ducă email când cineva face request la PAR să se ducă la cel care
aprobă".

**Stare actuală:** **Există deja** — la submit, `notify.ts` trimite email + notificare în-app către
**primul aprobator** din lanțul DOA; la fiecare treaptă aprobată, urmează aprobatorul următor; la
aprobarea finală merge la finance. Funcțiile: `notifySubmitted`, `notifyStepAdvanced`,
`notifyFullyApprovedToFinance` etc.

**Ce mai trebuie (hardening, nu de la zero):**
1. **Verificare în prod** că email-ul chiar pleacă (infrastructura de mesagerie e best-effort,
   fire-and-forget — un eșec tăcut nu trebuie să treacă neobservat). Adăugăm un log/audit „email
   trimis către X" și un fallback vizibil dacă providerul cade.
2. **Rutare corectă când treapta e pe rol** (nu pe persoană explicită): dacă treapta e „orice
   approver", trimitem la **toți** aprobatorii eligibili (sau celui desemnat prin delegare), nu doar
   la unul presupus.
3. Conținutul bogat al email-ului → tratat separat la **VM1-08**.

**Criterii de acceptare:**
- La fiecare submit, aprobatorul corect (persoană sau rol) primește email **și** notificare în-app.
- Eșecul de trimitere e logat și vizibil pentru par_admin (nu dispare în tăcere).
- Delegările active (VF-302) redirecționează email-ul către delegat.

**Reuse / dependențe:** `server/services/par/notify.ts`, MessagingService, `parDelegations`. Efort mic.

---

## VM1-08 — Email cu link direct + detaliile plății

**Ce a cerut Violeta:** „pe email să fie link direct dar și pe email să vină detaliile despre plăți".

**Stare actuală:** Email-urile pleacă, dar **conținutul e minimal**. Lipsește un **template bogat** cu
deep-link și sumarul plății.

**Ce construim — un template de email de aprobare care conține:**
1. **Link direct (deep-link)** către PAR-ul exact, care duce aprobatorul fix pe pagina de decizie
   (`#/business/par/...` sau `#/app/par/...`) — **rută reală, niciodată ancoră moartă** (§3.5.1).
   Dacă userul nu e logat, linkul îl trece prin login și apoi la PAR.
2. **Detaliile plății în corpul email-ului**, ca aprobatorul să decidă fără să intre neapărat:
   - Nr. PAR + cine a cerut + data;
   - **Suma + valuta** (și echivalent MDL);
   - **Plătitorul** (nume + IBAN + bancă);
   - **Scopul** (end-use) și **proiectul/evenimentul** (VM1-04);
   - Numărul de articole / un mini-rezumat al liniilor;
   - Numărul de atașamente (contract/act prezent?).
3. Butoane clare: „Vezi cererea" (+ eventual, mai târziu, „Aprobă rapid" cu confirmare în pagină).
4. Branding minim al organizației (logo din `parSettings.orgLogoUrl`, nume legal).
5. Același sumar reutilizat în email-urile către requestor (aprobat/respins) și către finance.

**Criterii de acceptare:**
- Email-ul conține un link care deschide direct PAR-ul corect (după login dacă e nevoie).
- Aprobatorul vede suma, valuta, plătitorul, IBAN-ul, scopul și proiectul/evenimentul direct în email.
- Linkul nu e o ancoră moartă; funcționează din clientul de email (Gmail/Outlook) pe mobil și desktop.
- Datele sensibile (IBAN/IDNP) apar doar către roluri îndreptățite (decidem cât expunem în email — vezi Întrebări).

**Reuse / dependențe:** `notify.ts`, `parSettings`, deep-link prin `parNav`. Efort mic-mediu.
**Notă de securitate:** atenție la cât IBAN/IDNP punem în clar în email (canal mai puțin sigur) —
posibil doar ultimele cifre + „vezi în aplicație".

---

## VM1-09 — Aprobarea mai multor PAR-uri concomitent

**Ce a cerut Violeta:** „când aprobi să poți aproba mai multe PAR-uri concomitent".

**Stare actuală:** **Există deja pe server** — endpoint `POST /api/par/bulk-approve` care aprobă până
la 25 de PAR-uri într-un apel, rulând logica de aprobare independent pe fiecare. Ce lipsește:
**UI-ul de selecție multiplă** în inbox-ul aprobatorului.

**Ce construim:**
1. În **ParInbox**: checkbox pe fiecare PAR + „selectează tot".
2. Buton „Aprobă selecția (N)" → confirmare cu sumarul a ce se aprobă (nr. PAR-uri + suma totală).
3. Apel `bulk-approve`; **raport per item**: „X aprobate, Y sărite + motiv" (ex. o cerere nu mai era
   pe treapta ta, sau între timp a fost respinsă).
4. Tratarea corectă a trepelor: bulk-approve aprobă **doar treapta curentă a userului**; PAR-urile cu
   mai multe trepte avansează la următorul aprobator (cu email — VM1-07).
5. Opțional: comentariu comun aplicat tuturor (sau gol).

**Criterii de acceptare:**
- Pot selecta mai multe PAR-uri din inbox și le aprob dintr-o singură acțiune.
- Văd un raport clar cu ce a trecut și ce nu (și de ce).
- Fiecare aprobare e logată individual și declanșează notificările corecte.
- Selecția respectă permisiunile (nu pot aproba ce nu e pe treapta mea).

**Reuse / dependențe:** endpoint `bulk-approve` (există), `ParInbox`. Efort mic (în mare UI).

---

## VM1-10 — „Foldere" de status: aprobat → plătit

**Ce a cerut Violeta:** „după [aprobare] toate PAR-urile se duc într-un folder de aprobat, iar când
este bifat «plătit» acesta se duce în folder PAR-uri plătite".

**Stare actuală:** Logica de status **există deja** (`approved` / `in_finance` / `paid`), iar dashboard-ul
grupează deja PAR-urile pe secțiuni. Ce cere Violeta e o **metaforă de „foldere"** explicită, mai
clară decât filtrele de azi.

**Ce construim:**
1. O navigație tip **„foldere"** în secțiunea PAR:
   - **De aprobat** (`pending_approval`) — ce așteaptă decizie;
   - **Aprobate** (`approved` / `in_finance`) — aprobate, încă neplătite;
   - **Plătite** (`paid`) — finalizate;
   - (+ „Ciorne", „Respinse/Anulate" ca foldere secundare).
2. **Bifa „Plătit"** (în coada de finanțe, `ParFinanceQueue`) mută automat PAR-ul din folderul
   „Aprobate" în „Plătite" — adică setează `status = paid` + înregistrează plata (`parPayments`).
3. Contoare pe fiecare folder (ex. „Aprobate · 7", „Plătite · 23").
4. Tranziția e logată și declanșează notificarea „plătit" către requestor.

**Criterii de acceptare:**
- Văd clar 3 foldere: De aprobat / Aprobate / Plătite, cu contoare corecte.
- Bifarea „Plătit" mută PAR-ul în folderul Plătite și nu mai apare în Aprobate.
- Folderele respectă rolul (finance vede coada de plată; requestor vede ale lui etc.).

**Reuse / dependențe:** statusurile existente, `ParDashboard`, `ParFinanceQueue`, `parPayments`.
Efort mic-mediu (UX peste date existente). **Se combină strâns cu VM1-11.**

---

## VM1-11 — Folderele organizate per proiect

**Ce a cerut Violeta:** „dar folderele să fie per proiect organizate".

**Stare actuală:** Azi gruparea e **plată, pe status**. PAR-ul are deja `projectId` (și va avea
`eventId` — VM1-04), deci datele permit gruparea pe proiect; lipsește **vederea ierarhică**.

**Ce construim:**
1. O **vedere ierarhică**: **Proiect → (De aprobat / Aprobate / Plătite)**. Adică alegi proiectul și
   vezi folderele de status doar pentru el. Sau invers (Status → Proiect), decidem din UX.
2. Pe fiecare proiect: **totaluri** (cât e aprobat, cât e plătit, cât e în așteptare) — în valuta de
   bază, cu PAR-uri în valute mixte convertite (VM1-03).
3. Filtru rapid „doar proiectul X" + breadcrumb.
4. Integrare cu **evenimentele** (VM1-04): sub un proiect pot exista evenimente, deci ierarhia poate
   merge **Proiect → Eveniment → status**.

**Criterii de acceptare:**
- Pot naviga „pe proiect" și văd folderele De aprobat/Aprobate/Plătite doar pentru acel proiect.
- Văd totalul cheltuit/aprobat/în-așteptare per proiect (și per eveniment).
- Un PAR fără proiect apare într-un folder „Fără proiect" (nu dispare).

**Reuse / dependențe:** `parProjects`, `projectId`, `parEvents` (VM1-04), rapoartele existente
(`ParReports`). Efort mediu (e mai mult muncă de UX/agregare).

---

## VM1-12 — Merge într-un singur document: PAR + atașamente (+ ordin de plată de la contabil)

**Ce a cerut Violeta:** „la urmă fac merge într-un singur document PAR + documentele anexate, iar
contabilul poate adăuga și ordinul de plată după".

**Stare actuală:** Există export **PDF al formularului PAR** (`parPdf.ts`), dar **NU** există un
**merge** al PAR-ului cu atașamentele (contract, act, oferte, factură) într-un singur fișier, și **NU**
există conceptul de **ordin de plată**. Acesta e cel mai consistent item **net-nou**.

**Ce construim:**
1. **Generare server-side a unui PDF combinat** („dosarul PAR"):
   - pagina 1+: **formularul PAR** (cele 16 secțiuni, cu semnături);
   - apoi **fiecare atașament** adăugat ca pagini:
     - PDF-uri → concatenate;
     - imagini (png/jpg) → fiecare devine o pagină;
     - docx/xlsx → fie convertite în PDF (mai complex), fie listate ca „anexă X (vezi fișierul atașat)"
       cu o pagină-separator (decidem la Întrebări — conversia Office e costisitoare).
   - **bibliotecă:** `pdf-lib` pentru merge (sau `playwright` pentru render, deja folosit în alte
     module). **Obligatoriu `import()` dinamic** pentru orice pachet greu — altfel risc de outage la
     tot API-ul (lecția exceljs/PAR-port).
2. **Pagini-separator** între secțiuni („— Contract —", „— Act de primire —") ca dosarul să fie ușor
   de răsfoit.
3. **Ordinul de plată**: contabilul (rol `finance`) poate, **după** aprobare, să **încarce/atașeze
   ordinul de plată** (`kind: payment_order` — tip nou de atașament) și să-l includă în dosarul
   combinat. Re-generarea dosarului îl include automat.
4. Buton „Descarcă dosarul complet (PDF)" pe detaliul PAR + în coada de finanțe.
5. **Ordine deterministă** a documentelor în dosar (PAR → contract → act → oferte → factură → ordin
   de plată), ca să arate la fel de fiecare dată.

**Criterii de acceptare:**
- Dintr-un PAR aprobat pot descărca un **singur PDF** ce conține formularul + toate atașamentele.
- Contabilul poate adăuga ordinul de plată după aprobare, iar acesta apare în dosarul re-generat.
- Generarea folosește `import()` dinamic (zero impact pe boot-ul API-ului).
- Dosarul are ordine consistentă și pagini-separator clare.
- Funcționează cu diacriticele românești corecte (ca în `parPdf.ts` azi).

**Reuse / dependențe:** `parPdf.ts` (formularul), `parAttachments`, `pdf-lib`/`playwright` (dinamic),
tip nou de atașament `payment_order`. **Efort mare** — cel mai consistent item. Decizii necesare la
docx/xlsx (vezi Întrebări).

---

## VM1-13 — Maparea AI a documentelor (ca la facturi)

**Ce a cerut Violeta:** „ar fi fine ca un AI să le facă mapping cum e la invoice-uri".

**Stare actuală:** Motorul AI **există deja** în modulul vecin (FinDesk / `captureExtractor` +
`fin_captures`): la facturi, AI-ul extrage `vendor_name`, `amount_cents`, `iban`, `expense_date`,
`vat`, `purpose`, `category`, plus `document_class` (invoice/receipt/not_invoice) și un `confidence`
per câmp (sub 0.7 → `low_confidence`, omul verifică). **Exact ce vrea Violeta**, doar că aplicat la PAR.

**Ce construim:**
1. La crearea unui PAR, când utilizatorul **încarcă un document** (contract / factură / ofertă), un
   buton **„Completează automat din document"** trimite fișierul la AI (reutilizăm `captureExtractor`).
2. AI-ul **pre-completează câmpurile PAR**:
   - plătitor: `payeeName`, `payeeIdnp`, `payeeIban`, `payeeBank`;
   - sumă + valută (→ `currency`, total linii);
   - scop / end-use;
   - eventual data și un draft de linii (descriere/cantitate/preț) dacă documentul le conține.
3. Pattern **„AI propune, omul confirmă"** (regula FIN-CORE): fiecare câmp completat de AI e marcat cu
   nivelul de încredere; sub prag → evidențiat ca „verifică". Nimic nu se salvează fără confirmarea
   userului.
4. **Clasificarea documentului** (reuse `document_class`): dacă userul încarcă ceva ce nu e document
   financiar (poză random, meniu), AI-ul semnalează „nu pare un document relevant" în loc să inventeze
   câmpuri.
5. Mod **mock** fără cheie API (ca la facturi) pentru dev/test.

**Criterii de acceptare:**
- Pot încărca un contract/factură și AI-ul pre-completează plătitorul, IBAN-ul, suma și scopul.
- Fiecare câmp auto-completat arată încrederea; userul confirmă/corectează înainte de salvare.
- Documentele irelevante sunt semnalate, nu mapate forțat.
- Reutilizează `captureExtractor` (nu construim un al doilea motor AI).
- Se leagă natural de VM1-05 (plătitorul extras de AI → auto-salvat în registru) și VM1-06 (multi-upload).

**Reuse / dependențe:** `server/lib/ai/captureExtractor.ts`, `fin_captures`, pattern `ExtractedFields` /
`document_class` / `confidence`. Efort mediu (adaptare prompt + mapare pe câmpurile PAR).

---

## Rezumat: efort și ce e nou vs. existent

| Item | Cerință | Stare azi | Efort | Tip |
|---|---|---|---|---|
| VM1-01 | Roluri pe persoane | Mare parte există (roluri+DOA) | Mic-mediu | UI peste API |
| VM1-02 | Import Excel | Nu există | Mic-mediu | ⚠️ De clarificat scope |
| VM1-03 | Multi-valută | Baza există (VF-203) | Mic-mediu | Finisare + curs BNM |
| VM1-04 | Dropdown evenimente | Nu există | Mic-mediu | Net-nou (tabel) |
| VM1-05 | Auto-salvare prestator | Parțial (registru există) | Mic | Pod automat |
| VM1-06 | Multi-upload max 10 | Multiple există | Mic | Limită + UX |
| VM1-07 | Email la aprobator | Există | Mic | Hardening |
| VM1-08 | Email cu link + detalii | Email minimal azi | Mic-mediu | Template bogat |
| VM1-09 | Aprobare în masă | Server există (bulk) | Mic | UI selecție |
| VM1-10 | Foldere aprobat→plătit | Statusuri există | Mic-mediu | UX foldere |
| VM1-11 | Foldere per proiect | Date există | Mediu | Vedere ierarhică |
| VM1-12 | Merge PDF + ordin plată | Doar PDF-ul formularului | **Mare** | Net-nou |
| VM1-13 | Mapare AI | Motor există (facturi) | Mediu | Reuse captureExtractor |

**Ordine recomandată de livrare** (valoare/efort + dependențe):
1. **Quick wins** (mult există, efort mic): VM1-06, VM1-09, VM1-07 → VM1-08, VM1-05.
2. **Vizibilitate & organizare**: VM1-03 (finisare valută), VM1-04 (evenimente), VM1-10 + VM1-11 (foldere).
3. **Roluri**: VM1-01 (UI oameni & roluri).
4. **AI**: VM1-13 (reuse motor facturi).
5. **Net-nou greu**: VM1-02 (după clarificare scope), VM1-12 (dosarul combinat + ordin de plată).

---

## Întrebări deschise / decizii pentru Violeta

1. **VM1-02 (Import Excel):** importăm **prestatori + linii de PAR** ca scope inițial (recomandarea
   noastră), sau ai în minte alt tip de date (proiecte/coduri buget, sau PAR-uri întregi în masă)?
2. **VM1-03 (curs valutar):** cursul îl introduce omul manual, sau îl preluăm **automat de la BNM** la
   data submit-ului? (recomandăm automat cu fallback manual)
3. **VM1-04 (evenimente):** evenimentele țin **de un proiect** (Proiect → Eveniment), sau sunt o listă
   independentă la nivel de organizație?
4. **VM1-05 (auto-salvare prestator):** salvăm furnizorul **la prima plată** (cum ai zis), sau mai
   devreme, la **aprobare/submit**?
5. **VM1-08 (email):** cât din IBAN/IDNP punem **în clar în email** (canal mai puțin sigur) vs. „doar
   ultimele cifre, vezi în aplicație"?
6. **VM1-12 (dosar combinat):** atașamentele **docx/xlsx** le **convertim în PDF** în dosar (mai
   costisitor) sau le lăsăm ca anexe separate cu o pagină-separator? Și: ordinul de plată e mereu
   adăugat de contabil **manual**, sau vrei și un **șablon generat** de ordin de plată?
7. **Acces general:** o persoană **fără niciun rol PAR** ar trebui să nu vadă deloc modulul, sau să-l
   vadă **read-only**?

---

*Document de lucru — prima ședință cu Violeta. Următorul pas: confirmarea deciziilor de mai sus, apoi
transformarea fiecărui VM1-xx într-un spec formal în `backlog/specs/` și intrarea în pipeline-ul de
autopilot (build → review → test → PR), o fază = un PR.*
