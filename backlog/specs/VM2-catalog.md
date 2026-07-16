# VM2 — 20 funcționalități noi PAR (post-Violeta-1)

> Sursă: cererea owner-ului din 2026-07-03 — „adaugă 20 de funcționalități noi care să fie utile
> sau să ușureze mult munca oamenilor" în modulul PAR. Fiecare item e scris pe modelul VM1:
> valoare, reuse, criterii de acceptare. Ordinea de livrare recomandată e la final.
> Prefix: **VM2-xx**. O fază = un branch = un PR (§0.2).

---

## Faza A — Quick wins pentru requestor (efort mic, valoare zilnică)

### VM2-01 — ~~Duplică PAR~~ — **DROP: deja livrat (VF-103)**
**[Backlog-critic 2026-07-03] Acest item e deja construit end-to-end, nu se mai construiește.**
`POST /api/par/:id/duplicate` (VF-103, `server/routes/par.ts`) copiază exact ce cere spec-ul:
header + linii (payee/valută/proiect/eveniment/buget/end-use), NU copiază atașamente/aprobări,
generează `requestNo` nou, scrie `parAudit` (`event: "duplicated_from"`), respectă vizibilitatea
payee pe GDPR. Butonul „Duplică" există deja pe `ParDetail.tsx` (`aria-label="Duplică această
cerere într-o ciornă nouă"`) apelând `duplicatePar()` din `src/lib/api/par.ts`. Toate cele 4 AC
originale sunt deja satisfăcute de codul existent. **Acțiune:** marchează `done` (nu `pending`) în
STATE.json/BACKLOG.md fără a mai trece prin build — sau elimină din listă. Nu re-construi.

### VM2-02 — Timeline vizual pe detaliul PAR
**[Backlog-critic] Backend deja complet — item devine STRICT frontend.** `GET /api/par/:id/timeline`
(`server/routes/parTimeline.ts`) e deja implementat și mounted, întoarce exact
`{timeline:[{event, detail, actor_name, created_at}], total}` cronologic, cu vizibilitate pe rol
deja aplicată server-side (requestor vede doar al său; approver/finance/par_admin văd tot),
tenant-safe. **NU adăuga niciun endpoint nou** — folosește DOAR `GET /api/par/:id/timeline`.
**Problema:** requestorul nu vede „unde e blocată cererea mea" — datele există (audit), dar nu
sunt randate ca timeline pe UI. **Ce construim (DOAR frontend):** pe `ParDetail.tsx`, un timeline
vertical (creat → trimis → pas 1 aprobat de X → … → plătit) consumând `GET /api/par/:id/timeline`.
**AC:** (1) fiecare tranziție de status apare cu dată+actor din răspunsul API existent (fără
transformări server noi); (2) pasul curent de aprobare e evidențiat „în așteptare la Y de N zile"
(calcul client-side din `created_at` al ultimului eveniment vs pasul curent din `par.approvals`);
(3) vizibil pentru requestor/approver/finance/admin — gate-ul e deja server-side, UI doar afișează
ce vine (404 din API pentru non-autorizați se tratează ca „nu ai acces"); (4) zero endpoint nou.

### VM2-03 — Căutare globală PAR + filtre combinate
**[Backlog-critic] ~90% deja livrat (VF-105) — scope real e mult mai mic decât descris.**
`GET /api/par` (`server/routes/par.ts`) deja acceptă `q` (căutare pe `requestNo`+`payeeName`+
`endUse`+descriere linie), `status`, `purpose`, `project_id`, `event_id`, `date_from`/`date_to`,
`min_total`/`max_total` — combinabile (AND), tenant+rol-scoped. `ParDashboard.tsx` deja are
căutare+filtre+chips+persistare (`localStorage` cheia `vf.dashboard.filters`) + URL-state parțial
(`project_id`, `status` din query string). **Singurul gap real:** (a) NU există filtru de
**valută** pe `GET /api/par` (query param `currency`); (b) `ParFolders.tsx` nu are bara de căutare
(doar Dashboard o are azi); (c) nu există index dedicat `(tenant_id, status)` — de verificat cu
`EXPLAIN` dacă e nevoie la volumul actual înainte de a-l adăuga. **Ce construim (scop redus):**
(1) adaugă param `currency` la `GET /api/par` + filtru UI; (2) portează bara de căutare+filtre
existentă din Dashboard pe `ParFolders.tsx` (reuse componenta, nu re-implementa); (3) verifică/
adaugă indexul dacă lipsește. **NU reconstrui** căutarea/filtrele de bază — ele există.
**AC:** (1) căutarea după payee parțial returnează PAR-urile corecte (deja adevărat, regression-test
only); (2) filtrele se combină, INCLUSIV valută (nou); (3) rezultatele respectă vizibilitatea pe
rol (deja adevărat); (4) `ParFolders.tsx` are aceeași bară de căutare ca Dashboard; (5) răspuns
< 500ms la 1000 PAR-uri — verifică cu `EXPLAIN ANALYZE`, adaugă index doar dacă lipsește.

### VM2-04 — Export Excel al oricărei liste
**[Backlog-critic] Parțial deja livrat — problema descrisă ("azi doar audit are CSV") e falsă.**
`ParReports.tsx` are DEJA butoane „Export Excel" (`.xlsx`, via `getParReportExportXlsxUrl`) ȘI
„Export CSV" (`getParReportExportUrl`) care respectă filtrele active din Rapoarte, folosind
`exceljs` cu import dinamic (regula PAR-port respectată). **Gap real:** Dashboard (`ParDashboard.tsx`)
și Foldere (`ParFolders.tsx`) NU au acest buton — doar Rapoarte îl are. **Ce construim (scop
redus):** adaugă buton „Export Excel" pe Dashboard și Foldere care REFOLOSEȘTE endpoint-ul/
logica de export xlsx din Rapoarte (parametrizată cu filtrele curente ale paginii respective —
nu duplica generarea de workbook), coloane: nr, dată, payee, sumă+valută, echivalent MDL, proiect,
eveniment, buget, status, plătit la. **Reuse:** endpoint-ul `getParReportExportXlsxUrl` (extinde-l
să accepte filtrele Dashboard/Foldere, nu construi un al doilea generator xlsx). **AC:** (1)
exportul respectă filtrele active pe pagina din care e apăsat butonul; (2) sumele în valută + MDL;
(3) diacritice corecte; (4) import dinamic — zero impact pe boot (deja adevărat pentru Rapoarte,
verifică la fel pentru noile puncte de intrare); (5) NU există un al doilea modul de generare xlsx
— un singur generator, parametrizat.

---

## Faza B — Aprobare fără frecare (aprobatorul e gâtul de sticlă)

### VM2-05 — Reminder automat + escaladare la aprobare întârziată
**[Backlog-critic] Corectare reuse: nu există tabel "email-log".** Emailurile se trimit prin
`messagingService.sendMessage()` (`server/services/messaging/MessagingService.ts`) care scrie în
tabelul `messages` — ăsta e „log"-ul de folosit pentru „un singur reminder/zi" (interoghează
`messages` pt. ultimul send de tip reminder pe acel pas, nu un tabel nou). **Problema:** cereri
blocate zile întregi pentru că aprobatorul a uitat. **Ce construim:** job zilnic (cron GH Actions
există ca pattern, vezi `.github/workflows/autobill-cron.yml`) care re-trimite email aprobatorului
pentru pașii în așteptare > N zile (config în parSettings, default 2) și după 2×N escaladează la
par_admin. **Reuse:** `server/services/par/notify.ts` (funcțiile `notify*` existente ca model),
`parSettings`, tabelul `messages` (NU un „email-log" nou). **AC:** (1) un pas în așteptare de N+
zile → un singur reminder/zi, nu spam (verificat prin query pe `messages`, nu prin tabel nou);
(2) după 2×N, par_admin primește sumar; (3) remindere identificabile în `messages` (subject/kind
distinct, ex. prefix „[Reminder]"); (4) opt-out per tenant (câmp nou în `parSettings`); (5) jobul
rulează idempotent (re-rulare aceeași zi nu dublează remindere).

### VM2-06 — Digest zilnic pentru aprobatori
**Problema:** 10 submits = 10 emailuri. **Ce construim:** opțiune per user „digest zilnic" —
un singur email dimineața cu toate cererile care îl așteaptă (sumă, payee, proiect, link).
**Reuse:** `server/services/par/notify.ts` (funcțiile `notifySubmitted`/`notifyStepAdvanced`
existente ca model de conținut) + template-ul VM1-08; trimiterea rămâne prin `messagingService`
(tabelul `messages`, NU un „email-log" separat). **AC:** (1) cu digest ON, submit-urile nu mai
trimit email individual (in-app rămâne, `sendInApp` neschimbat); (2) digestul vine la ora config
(default 08:30 Chișinău); (3) zero cereri → zero email; (4) preferința „digest zilnic" e un câmp
nou per user (nu per tenant) — persistă undeva ce nu există încă în schema PAR (adaugă coloană,
NU reosolosi `parSettings` care e per-tenant).

### VM2-07 — Aprobare direct din email (link semnat) — **SECURITY-SENSITIVE, gate extins**
**Problema:** aprobatorul pe telefon vrea 1 click. **Ce construim:** în emailul de aprobare,
buton „Aprobă" cu token semnat (HMAC, expiră 72h, single-use, legat de pas+user) care deschide o
pagină minimă de confirmare (sumar + buton final) fără login complet. **Reuse:** pattern-ul
invite-token (`generateInviteToken`/`hashInviteToken`, sha256 în DB, `server/routes/parInvites.ts`)
— folosește ACELEAȘI primitive, nu reinventa hashing-ul de token. **Securitate (obligatoriu, nu
opțional):** (a) tokenul e legat criptografic de `{parId, step, approverUserId}` — un token pentru
alt pas/user trebuie să eșueze explicit; (b) single-use: DB marchează tokenul consumat ATOMIC la
prima folosire (tranzacție/`UPDATE ... WHERE used_at IS NULL RETURNING`), nu doar verificare-apoi-
scriere (race condition = dublă aprobare); (c) expiră 72h, verificat server-side la fiecare hit,
nu doar la generare; (d) reject-ul prin acest link cere DE ASEMENEA comentariu obligatoriu (ca în
fluxul normal de reject) — nu un shortcut fără motiv; (e) se loghează IP + user-agent în `parAudit`
pe evenimentul de aprobare-din-email, ca să fie distins de aprobarea din UI; (f) NU acceptă query
params suplimentari care ar putea schimba pasul/suma aprobată — tokenul e sursa unică de adevăr,
orice altă dată vine din DB, nu din URL. **Ordine de livrare:** rămâne ultimul din Faza D (owner
a decis deja asta) — se face după ce restul fluxului de aprobare e stabil. **AC:** (1) click →
confirmare → pasul aprobat + audit (cu IP+UA); (2) token expirat/refolosit → mesaj clar + link
spre login (fără a dezvălui dacă parId există, generic „link invalid sau expirat"); (3) reject
tot prin pagina de confirmare, cu comentariu obligatoriu; (4) folosire dublă concurentă a
aceluiași token (2 request-uri simultane) → doar UNUL reușește (test dedicat pentru race);
(5) niciun query param din URL nu poate suprascrie step/sumă/user — totul vine din tokenul
rezolvat server-side.

### VM2-08 — Vedere mobilă a inbox-ului de aprobare
**[Backlog-critic] Confirmat gap real** — `ParInbox.tsx` e azi un tabel plain cu
`overflow-x-auto` (scroll orizontal pe mobil), fără layout card-based; item-ul e valid, nu
duplicat. **Problema:** aprobarea se întâmplă pe telefon; tabelul actual e greu pe mobil. **Ce
construim:** layout card-based pe <768px pentru ParInbox (sumă mare, payee, proiect, 2 butoane
mari Aprobă/Respinge, swipe opțional) — desktop rămâne tabelul existent neschimbat. **Reuse:**
ParInbox existent (`sortFilterInbox`, `getParInbox`, `approvePar`/`rejectPar`/`requestParChanges`,
modalul de decizie `DecisionModalProps`) — DOAR layout-ul e nou, logica de date/acțiuni rămâne
aceeași. **AC:** (1) pe 375px totul lizibil fără scroll orizontal; (2) touch targets ≥44px; (3)
bulk-select rămâne funcțional pe mobil (dacă swipe se implementează, bulk-select prin swipe intră
în conflict — decide default: pe mobil bulk-select via checkbox pe card, swipe e opțional/nice-to-
have, nu obligatoriu pentru AC); (4) reject/request-changes deschid ACELAȘI modal ca pe desktop
(nu un al doilea flux mobil).

---

## Faza C — Finance care nu mai tastează de două ori

### VM2-09 — Ordin de plată generat automat (PDF)
**Problema:** VM1-12 primește ordinul UPLOADAT manual; contabilul îl scrie de mână în alt tool.
**Ce construim:** buton „Generează ordin de plată" în ParFinanceQueue → PDF pre-completat
(plătitor = org din parSettings, beneficiar = payee+IBAN+bancă, suma+valuta, destinația = end-use,
nr. ordin secvențial per tenant) → se atașează automat ca `payment_order` și intră în dosar.
**Reuse:** parPdf pattern + parAttachments + secvența requestNo. **AC:** (1) PDF-ul conține toate
câmpurile obligatorii ale unui ordin de plată moldovenesc; (2) numerotare secvențială fără găuri
per tenant; (3) apare în dosarul combinat automat; (4) editabil (regenerare) cât timp nu e plătit.

### VM2-10 — Fișier de plăți pentru bancă (bulk payment export)
**Problema:** 20 de plăți aprobate = 20 de operații manuale în internet banking. **Ce construim:**
în ParFinanceQueue, selectezi N PAR-uri aprobate → „Export fișier bancă" (CSV/format MAIB
compatibil cu importul lor de plăți în lot: IBAN, beneficiar, IDNO, sumă, destinație). **Reuse:**
selecția multiplă există (VM1-09 pattern), statement-parser MAIB există ca referință de format.
**AC:** (1) fișierul trece validatorul de import MAIB (structură coloane); (2) doar PAR-uri
approved/in_finance în valuta selectată; (3) exportul loghează care PAR-uri au intrat în fișier.

### VM2-11 — Marchează plătit din extrasul bancar (reconciliere)
**Problema:** după plată, finance bifează manual fiecare PAR. **Ce construim:** upload extras
(parserul MAIB PDF există — PR #245!) → match automat pe IBAN+sumă(+dată) cu PAR-urile
in_finance → propune lista „acestea par plătite" → confirmi → toate trec pe paid cu
referința tranzacției. **Reuse:** `statement parser` + `matchInvoiceToLines` pattern
(invoiceLineMatch.ts). **AC:** (1) match exact IBAN+sumă → propus automat; (2) nimic nu se
marchează fără confirmarea omului; (3) referința (data/nr tranzacție) se salvează pe parPayments.

### VM2-12 — ~~Buget vs cheltuit, vizibil la creare~~ — **DROP: deja livrat aproape integral**
**[Backlog-critic 2026-07-03] Acest item e deja construit — nu există `getBudgetCodeBalance` ca
funcție (numele e greșit în spec), dar funcționalitatea EXISTĂ complet:**
`GET /api/par/budget-codes/:id/balance` întoarce `{allocatedCents, committedCents, spentCents,
availableCents}` și `GET /api/par/budget-codes/usage` întoarce toate codurile într-un call cu
`usedPct` inclus (mai complet decât cere spec-ul). **`ParCreateForm.tsx` deja afișează** la
selectarea codului bugetar: „Disponibil: X din Y" (linia cu `budgetBalance.availableCents`/
`allocatedCents`), culoare roșie (`text-destructive`) când soldul e ≤0, și un warning separat
„Depășește bugetul disponibil pentru acest cod" când totalul PAR-ului curent ar depăși soldul
(necesar `budgetBalance!.availableCents`). **Plafonul deja există:** `parBudgetCodes.allocatedCents`
(coloană `allocated_cents`, comentariu în schema: „total budget allocated to this code, default 0
= uncapped") — acesta ESTE plafonul, editabil de `par_admin` prin `POST`/`PATCH
/api/par/budget-codes` (câmp `allocatedCents` deja acceptat de `codeSchema`). **Confirmat 100%:** `ParAdmin.tsx` (tabelul de coduri bugetare) are deja input-ul dedicat
`id="bc-alloc"` cu label „Alocare (MDL, 0 = fără plafon)", editabil, plus afișaj „Fără plafon" /
suma alocată în listă. **Acțiune:** marchează item-ul `done` în STATE.json/BACKLOG.md fără build —
tot ce cere spec-ul (sold vizibil la creare + warning + plafon editabil de par_admin) există deja
în producție. Nu re-face bara de sold, nu re-face endpoint-ul de balance, nu re-face input-ul de
alocare.

### VM2-13 — Raport pentru donator (PDF/Excel per proiect sau eveniment)
**Problema:** raportarea către donatori = ore de copy-paste. **Ce construim:** din ParReports,
„Raport donator" pentru un proiect/eveniment + interval → document cu: sumar (total aprobat/
plătit pe valute + MDL), tabel plăți (dată, payee, scop, sumă), opțional anexă cu dosarele PDF
(link-uri). **Reuse:** rapoartele existente + exceljs/parPdf. **AC:** (1) totalurile bat cu
folderele per proiect; (2) valute originale + MDL; (3) header cu logo/nume org din parSettings.

---

## Faza D — Control, transparență, siguranță

### VM2-14 — Out-of-office în 2 clickuri (self-service delegare)
**Problema:** delegarea (VF-302) e doar în ParAdmin — aprobatorul plecat în concediu depinde de
admin. **Ce construim:** pe profilul propriu (sau în inbox), „Plec în concediu: deleagă lui X
între D1-D2" → creează parDelegation pentru propria persoană. **Reuse:** parDelegations complet.
**AC:** (1) un approver își setează singur delegarea (doar de la sine către altcineva);
(2) emailurile se dublează către delegat (există din PR #255); (3) admin vede toate delegările.

### VM2-15 — Notificări in-app cu clopoțel + necitite
**Problema:** inAppNotifications se scriu dar nu există un loc vizibil în shell-ul business.
**Ce construim:** clopoțel în BusinessShell header cu badge necitite, dropdown ultimele 15
(text + link la PAR), mark-as-read. **Reuse:** tabelul inAppNotifications (kind="par").
**AC:** (1) badge-ul arată nr. necitite corect per user; (2) click pe notificare → PAR-ul +
marcat citit; (3) „marchează tot citit"; (4) polling ușor (30s) sau refetch la navigare.

### VM2-16 — Anulare cu motiv + re-deschidere ciornă
**Problema:** un PAR trimis greșit rămâne blocat în lanț; requestorul sună adminul. **Ce
construim:** requestorul poate „Retrage" propria cerere cât timp niciun pas nu e aprobat →
înapoi în draft (cu motiv, logat); după primul approve doar par_admin poate anula. **Reuse:**
status machine existentă (`cancelled`, `changes_requested`). **AC:** (1) retragere posibilă doar
pe pending_approval fără aprobări; (2) motivul obligatoriu, în audit + notificare aprobatorului;
(3) draftul redevine editabil (bodyHash recalculat la re-submit).

### VM2-17 — Limite anti-fraudă: 4-eyes obligatoriu peste prag
**Problema:** DOA permite teoretic lanțuri de 1 pas la sume mari dacă matricea e configurată
greșit. **Ce construim:** setare tenant „peste suma X, minim 2 aprobatori DIFERIȚI de requestor"
— verificată la generarea lanțului ȘI la aprobare (defense in depth); avertizare în ParAdmin
dacă matricea DOA încalcă regula. **Reuse:** doa.ts. **AC:** (1) PAR > prag cu lanț de 1 pas →
la submit se adaugă pasul 2 (par_admin) automat sau submit refuzat cu mesaj clar (decidem la
build — default: auto-add); (2) requestorul nu poate fi aprobator în propriul lanț (verificat);
(3) config vizibil în ParAdmin.

### VM2-18 — Ștampilă „PLĂTIT" + QR de verificare pe dosar
**Problema:** dosarele PDF circulă extern (donatori, auditori) — nimic nu le leagă înapoi de
sistem. **Ce construim:** la generarea dosarului (VM1-12), pe prima pagină: ștampilă vizuală de
status (PLĂTIT/APROBAT + data) și un QR cu link către PAR (deep-link-ul din PR #255). **Reuse:**
pdf-lib deja în dosar; lib QR mică (import dinamic). **AC:** (1) dosarul unui PAR plătit are
ștampila + QR care duce la PAR (după login); (2) statusul din ștampilă = statusul la momentul
generării, cu timestamp; (3) zero impact pe boot API (import dinamic).

### VM2-19 — Arhivare an fiscal + snapshot imuabil
**Problema:** după închiderea anului, PAR-urile vechi trebuie „înghețate" pentru audit. **Ce
construim:** acțiune par_admin „Închide anul fiscal YYYY" → toate PAR-urile paid/rejected/
cancelled din an devin read-only (nici admin nu le mai editează), iar dosarele PDF se generează
și se stochează ca snapshot. **Reuse:** status machine + dosar VM1-12. **AC:** (1) după închidere,
orice mutare pe un PAR arhivat → 409 cu mesaj; (2) lista anilor închiși vizibilă în ParAdmin;
(3) reversibil doar cu confirmare dublă (și logat).

### VM2-20 — Sănătatea modulului: pagină de configurare ghidată
**Problema:** un tenant nou nu știe ce-i lipsește ca PAR să meargă (fără DOA → submit eșuează;
fără aprobatori → totul se blochează). **Ce construim:** în ParAdmin, card „Stare configurare"
cu checklist verificat live: are ≥1 approver? matrice DOA acoperă 0→∞? proiecte/bugete definite?
emailuri funcționale (ultimul send OK)? fiecare cu link „repară". **Reuse:** datele există toate;
email-log din PR #255. **AC:** (1) tenant proaspăt vede exact ce pași mai are; (2) fiecare
verificare are link direct la tab-ul de reparat; (3) verde complet = „PAR gata de producție".

---

## Ordine recomandată (valoare/efort)

1. **Faza A (quick wins):** VM2-01, VM2-02, VM2-03, VM2-04 — efort mic, folos zilnic imediat.
2. **Faza B (aprobare):** VM2-14, VM2-15, VM2-05, VM2-06, VM2-08 — deblochează gâtul de sticlă.
3. **Faza C (finance):** VM2-12, VM2-09, VM2-13, VM2-10, VM2-11 — economisește cele mai multe ore.
4. **Faza D (control):** VM2-16, VM2-17, VM2-20, VM2-07, VM2-18, VM2-19 — maturitate/audit.

> VM2-07 (aprobare din email) e mutat spre final deși e atractiv: are cea mai mare suprafață de
> securitate (token semnat care mută bani) — se face după ce restul fluxului e stabil.
