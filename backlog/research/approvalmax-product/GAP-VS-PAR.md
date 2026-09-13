# ApprovalMax → PAR — bifare ecran cu ecran

Scanare: 2026-08-29. Sursă: `screenshots/app-demo/*.png` (contul trial live) + `screenshots/*.png`
(cele 19 pagini de produs) + `pages/*.md`. Comparat cu PAR-ul nostru așa cum e în cod azi
(`server/routes/par*.ts`, `server/db/schema/par.ts`, `src/pages/par/*.tsx`, `backlog/par/PAR-CORE.md`).

Legendă: **✅ avem** · **🟡 avem parțial / alt model** · **❌ lipsă** · **N/A** (nu ne aplică).

---

## Partea A — Aplicația live, ecran cu ecran

### `15` Getting started — checklist de 7 pași
**Ce e pe ecran:** pagină dedicată cu video + acordeon în 7 pași (invită colegi → configurează
workflow → creează cerere → ia prima decizie → conectează contabilitatea → app mobil → alege plan).
Pașii se **bifează singuri** pe măsură ce îi faci (`74` arată 2,3,4 deja verzi).
**De ce:** trialul de 14 zile trebuie să ajungă la „aha" în prima sesiune; checklistul e busola.
**Noi:** 🟡 `ParOnboarding.tsx` e un wizard de configurare (departamente, coduri buget, valută,
invită coleg, rezumat) care se termină și dispare. Nu avem checklist persistent care se auto-bifează
din activitatea reală.

### `20` Workflows and settings — hub
**Ce e pe ecran:** două coloane — „Connected workflows" (Xero / QBO / NetSuite, fiecare cu Connect)
și „Stand-alone workflows" (+ Create, badge Premium).
**De ce:** poziționarea produsului: motor de aprobare peste contabilitatea ta, sau de sine stătător.
**Noi:** N/A pe partea de contabilitate externă (noi avem SFS e-Factura, nu Xero). ❌ nu avem noțiunea
de „workflow" ca obiect creabil — avem UN singur flux PAR, configurat din matricea DOA.

### `21` `22` `23` Cele trei liste: All requests / Requires my approval / On hold
**Ce e pe ecran:** trei intrări separate în rail, fiecare cu empty-state scris omenește
(„There's nothing to approve — ask your colleagues if they have something in the pipeline").
**Noi:** ✅ `ParDashboard` (toate cererile + filtre pe status/proiect/dată/sumă) și ✅ `ParInbox`
(pending my approval, cu filtre pe plătitor/proiect/eveniment și bulk-approve — noi suntem peste ei aici).
❌ „On hold" nu există la noi ca listă, pentru că nu există starea (vezi `62`–`66`).

### `24` `46` Reports
**Ce e pe ecran:** pagină goală cu „+ New Report" — e un **report builder**, nu un dashboard. Rămâne
gol chiar și după ce ai aprobat o cerere.
**Noi:** ✅ mai bun pe viteză: `ParReports` are 12 rapoarte gata făcute (pe buget, plătitor, departament,
proiect, eveniment, charge-to, furnizor, valute, aging, cycle-time) + export CSV/XLSX.
❌ nu avem rapoarte salvate/definite de utilizator (echivalentul builder-ului).

### `25` `73` Users
**Ce e pe ecran:** tabel cu **Name · Email · Role · Status · 2FA · Substitute · Start date · End date ·
Time zone**; „Add or Invite Users" = lipești o listă de emailuri separate prin virgulă/spațiu → Next.
**De ce contează:** trei coloane sunt de fapt controale: `2FA` (vizibil per om), `Substitute`
(înlocuitor când lipsește) și `Start/End date` (acces care **expiră singur** — consultant, sezonier).
**Noi:** ✅ roluri + membri (`par_members`), ✅ invitații (`parInvites`), ✅ înlocuitor cu perioadă
(`par_delegations`, chiar mai bun: deleagă autoritatea, nu doar pașii). ❌ start/end date pe membru,
❌ starea 2FA vizibilă în tabel (2FA există în `server/auth/twoFactor.ts`, dar nu e expusă acolo),
❌ invitare în masă prin lipire de emailuri.

### `26` „New request" blocat
**Ce e pe ecran:** modal — „It looks like you haven't been added as a requester to any approval
workflow" + numele organizației + buton **Go to workflow**.
**De ce:** eroarea nu doar refuză, ci spune ce lipsește și duce exact la locul reparației.
**Noi:** 🟡 la noi orice `requestor` poate crea; dar tiparul (empty-state care duce la fix) merită copiat
în ecranele unde blocăm ceva (ex. lipsă cod de buget / lipsă aprobator pe proiect).

### `30`–`36` `53`–`58` Workflow builder (cel mai relevant bloc pentru noi)
**Ce e pe ecran:**
- lanț vizual orizontal: `Creation` → `Approval step` → `+ Step`, fără limită de pași;
- pe fiecare pas: **Add an Approver**, iconița de **matrice**, **ceasul de deadline**, și
  **Approval condition: All / Any**;
- **`33` matricea de aprobare**: rânduri = aprobatori, coloane = condiții (`Amount`, `Requester`,
  **+ Add a field**) — se citește ca o propoziție: „X should approve if Amount … and Requester …";
- **`55`/`56`**: „Add a field" acceptă **text liber** („Project code") — condițiile NU sunt o listă fixă;
- **`53` deadline per pas**: Not set / Based on submission / Based on approval;
- **`34` Workflow settings**: mesaj de instrucțiuni afișat solicitanților + **politica de decizie**
  („dacă un aprobator apare pe mai mulți pași, aprobarea lui se aplică la toți pașii sau doar la cel curent");
- **`35` meniul „…"**: Discard changes / Delete / **Copy workflow**;
- **`36`**: workflow-ul are stare **draft → Activate**, cu confirmare.
**Noi:** 🟡 matricea DOA (`par_doa_matrix`, editabilă în `ParAdmin`) rutează pe **sumă + charge-to +
departament**, plus aprobatori per proiect (`par_project_approvers`) — deci motorul multi-nivel ✅ există.
Lipsesc: ❌ condiții pe câmpuri libere, ❌ deadline/SLA per pas, ❌ All/Any (cvorum), ❌ pași paraleli,
❌ instrucțiune per flux pentru solicitanți, ❌ politica „toți pașii deodată vs. pasul curent",
❌ copiere de configurație, ❌ **stare draft + Activate** (la noi o modificare de DOA intră live instant),
❌ istoric de versiuni al configurației.

### `37`–`41` Formularul de cerere
**Ce e pe ecran:** subiect, sumă, valută, dată · **Note for approvers** (rich text, opțional) ·
**Description** (rich text, **obligatoriu**) · Files drag & drop max 25 Mb · sus:
**File preview / No preview** (previzualizare document lângă formular), salvare draft, ștergere,
**Submit for approval**; validare live pe câmpurile lipsă.
**Noi:** ✅ mult mai bogat (linii de articole, beneficiar cu IDNO/IBAN/bancă, cod bugetar cu sold,
proiect, eveniment, scop, pornire din șablon / repetare cerere anterioară, prefill AI din document).
❌ **preview document lângă formular** (avem preview la atașamente, dar nu split-view la completare) —
exact ecranul unde omul transcrie de pe factură. 🟡 separarea „notă conversațională" vs „descriere
structurată obligatorie" — la noi e un singur bloc de scop/descriere.

### `42` Pagina de cerere (după submit)
**Ce e pe ecran:** layout **master-detail** (lista rămâne în stânga) · sumă mare sus-dreapta ·
bara de acțiuni: **ochi+ (watchers)**, **lacăt (hold)**, **fulger (force decision)**, **Reject**, **Approve** ·
`Actions: Edit …` · card Description · card **Approval workflow** (pasul cu badge `ACTIVE`, condiția,
aprobatorul cu iconițe de editare și **reatribuire**) · card **Audit trail** — fiecare intrare are
autor, frază în limbaj natural, timestamp **și canalul**: „Aug 29, 2026, 4:31 PM **via Web**" ·
casetă de comentariu cu clips de atașament.
**Noi:** ✅ lanț de aprobare cu pași și decizii, ✅ timeline + comentarii (`parTimeline`, `parComments`),
✅ acțiuni în funcție de rol, ✅ atașamente. ❌ watchers (observatori pe cerere), ❌ reatribuire de pe
cerere, ❌ canalul deciziei în audit, 🟡 layout full-page în loc de master-detail.

### `43` Force decision (fulgerul)
**Ce e pe ecran:** „**Forcing the approval decision** — As an Administrator, you can force approval or
rejection of this request. **This will override the decisions of other approvers.**" → Force the approval /
Force the rejection.
**De ce:** supapa pentru blocaje reale (om plecat, lanț înțepenit), făcută explicit și lăsând urmă.
**Noi:** ❌ nu avem. Azi un lanț blocat se rezolvă prin delegare sau retragere+retrimitere.

### `44` Cerere aprobată
**Ce e pe ecran:** chip `APPROVED` în listă și în antet, pasul devine verde, acțiunile se reduc la
**Copy**, iar audit-ul spune „All approvals for the request are now collected and request is closed."
**Noi:** ✅ chips de status, ✅ duplicare (`POST /api/par/:id/duplicate`), ✅ audit la fiecare tranziție.

### `62`–`66` „Reject" = **hold reversibil**, nu respingere
**Ce e pe ecran:** butonul Reject deschide modalul „**Reason to put the request on hold**" cu comentariu
**obligatoriu** → cererea intră în `ON HOLD`, Approve/Reject devin gri, apare bannerul persistent
„This request is on hold. Click 'Unlock' to continue.", iar motivul apare citat în audit trail.
**De ce:** nicio respingere accidentală ireversibilă; motivul e obligatoriu și rămâne în dosar.
**Noi:** 🟡 model diferit — `changes_requested` (întoarce cererea în draft la autor, cu comentariu) și
`rejected` (terminal, dar cu `reopen` de către autor). ❌ nu avem îngheț reversibil care **păstrează
lanțul intact** („pauzez cererea până lămuresc ceva, apoi continui din același pas").

### `71` `72` `80` Comentarii și Audit Report
**Ce e pe ecran:** comentariile intră în **același fir cronologic** cu audit trail-ul (nu un chat separat);
pe o cerere aprobată butoanele de decizie sunt înlocuite de un singur **Audit Report** (PDF).
**Noi:** ✅ timeline unificat, ✅ export audit PDF/XLSX (`parAudit`), ✅ dosarul cererii ca PDF.

### `74` Notificări
**Ce e pe ecran:** panou lateral dreapta (nu dropdown), „1 unread", **Mark all as read**, iar în notificare
butoane de acțiune („Contact sales" / „Buy now").
**Noi:** ✅ `NotificationBell` + mark-all-read + notificări pe email la fiecare tranziție.
🟡 fără butoane de acțiune în notificare.

### `70` Organizations dashboard
**Ce e pe ecran:** tabel cross-organizație: **On approval**, **Requires my approval**, abonament +
„Trial expires on…", status (`Reconnect` roșu), owner, buton Organization settings; sus: căutare,
**Setup columns**, **Download CSV**, Add new organization.
**Noi:** 🟡 avem plătitori multipli și filtre pe plătitor în inbox/rapoarte; ❌ nu avem tabloul agregat
cross-plătitor cu „câte așteaptă decizia mea, unde". Consola de platformă acoperă partea de superadmin.

### `81` Subscription
Aplicație separată (`account.approvalmax.com`) pentru billing. N/A pentru noi.

---

## Partea B — Cele 19 pagini de produs, feature cu feature

| Feature ApprovalMax | Ce promite | La noi |
|---|---|---|
| Multi-level approvals | lanț nelimitat, secvențial **sau paralel**, reguli pe sumă/furnizor/departament | ✅ multi-nivel pe sumă/charge-to/departament (DOA) · ❌ paralel |
| Substitut la absență | adminul numește înlocuitor, coada trece mai departe | ✅ `par_delegations` (cu perioadă, deleagă autoritatea) |
| Remindere automate + „nudge" manual | cererile blocate sunt împinse singure | ❌ (avem remindere doar pe e-Factura prestator) |
| Approval channels (email, Slack, mobil, web) | aprobi din inbox/Slack, fără cont în contabilitate | ❌ doar web (responsive); **cel mai mare gap de fricțiune** |
| Segregation of duties | requester ≠ approver impus de sistem, roluri înguste, escaladare | ✅ regulă dură + roluri + escaladare la par_admin |
| Audit readiness | raport per document, **rol Auditor read-only**, **bypass detection**, duplicate | ✅ audit complet + export · ❌ rol auditor · ❌ bypass detection · ❌ detectare duplicate |
| Purchase orders | PO aprobat înainte de angajarea banilor, copiat în factură | 🟡 `parPurchaseOrders` + recepții (`parReceipts`) |
| Bill-to-PO matching | potrivire automată factură↔PO, auto-aprobare la furnizori de încredere, PO se închide singur | ❌ |
| Budget controls | soldul bugetului **în fața aprobatorului**, perioade (lunar/trim./YTD) | 🟡 soldul apare la **creare** (`ParCreateForm`), ❌ nu în inbox-ul aprobatorului, ❌ fără perioade |
| Vendor approvals | furnizor nou vetat (IBAN, cod fiscal) înainte să intre în sistem | ❌ registrul de furnizori există, fluxul de aprobare a furnizorului nu |
| Invoices | rutare pe furnizor/sumă/cont, flag pe duplicate/mismatch/depășire buget | 🟡 rutare da, flagging automat nu |
| Credit notes | flux dedicat AP/AR | ❌ (probabil irelevant pentru noi) |
| Expenses | cheltuieli de angajat pe politică | 🟡 PAR le acoperă ca tip de cerere |
| Standalone workflows | motorul expus pentru orice decizie, cu câmpuri custom | 🟡 noi SUNTEM standalone, dar cu un singur tip de cerere și fără câmpuri custom |
| Capture (OCR) | email dedicat de intrare, upload în masă, 40+ limbi, intră direct în flux | 🟡 extragere AI din orice act ✅ · ❌ email de intrare · ❌ upload în masă |
| ApprovalMax Pay | plata efectivă din platformă, 30+ valute, batch 200 | ❌ (și nu merită — produs reglementat) |
| Security | ISO 27001, SSO, 2FA, **auto-logout la 15 min**, date în UE | ✅ 2FA + SSO Google · ❌ auto-logout pe inactivitate (sesiune 30 zile) · ❌ certificare |
| Integrations | Xero/QBO/NetSuite + API public | N/A (noi: SFS e-Factura) |

---

## Partea C — Ce merită construit, în ordinea raportului valoare/efort

1. **Hold reversibil cu motiv obligatoriu** (`62`–`66`) — stare nouă + banner + unlock, lanțul rămâne intact.
   Ieftin, elimină respingerile accidentale, e pur audit. *(cel mai transferabil lucru din tot turul)*
2. **Soldul bugetului în fața aprobatorului** — avem deja `GET /api/par/budget-codes/:id/balance`;
   e doar de arătat în `ParInbox` și pe cerere. Aproape gratis, impact direct pe decizie.
3. **Remindere automate pentru cererile blocate** + „nudge" manual din cerere. Fără ele, un aprobator
   uituc oprește tot fluxul și nimeni nu află.
4. **Deadline/SLA per pas** (`53`) + afișarea întârzierii în inbox și în raportul de cycle-time (îl avem deja).
5. **Aprobare din email (un click, link semnat)** — cel mai mare câștig de fricțiune pentru aprobatorii
   ocazionali (director care nu deschide aplicația). Slack după, dacă are cerere.
6. **Force decision de admin, auditat** (`43`) — supapa pentru lanțuri înțepenite, cu avertisment explicit.
7. **Rol Auditor read-only** — ca să nu mai dăm cont de admin unui auditor extern.
8. **Watchers + reatribuire de pe cerere** (`42`) — „vreau să văd ce se întâmplă cu asta" / „dă-i-o lui X".
9. **Configurația DOA cu stare draft → Activate + istoric de versiuni** — azi o editare de matrice
   schimbă rutarea live, fără urmă. Risc real pe un client care plătește.
10. **Detectare duplicate la creare** (același beneficiar + aceeași sumă + interval scurt) — control clasic
    anti-fraudă, ieftin de calculat.
11. **Preview document lângă formular** (`38`) — exact ecranul unde omul transcrie de pe factură.
12. **Câmpuri custom + condiții de rutare pe ele** (`55`/`56`) — flexibilitatea care ne-ar scoate din
    „un singur tip de cerere".
13. **Valabilitate start/end pe membru** (`25`) — acces care expiră singur.
14. **Auto-logout pe inactivitate** — cerință de audit, sesiunea de 30 de zile e greu de apărat.
15. **Checklist de start persistent, auto-bifat** (`15`) — pentru clienți noi.

Neincluse deliberat: ApprovalMax Pay (produs reglementat), Xero/QBO/NetSuite (noi avem SFS),
credit notes AP/AR.

> Notă: cele 6 `Screenshot 2026-08-10 *.png` din rădăcina repo-ului NU sunt ApprovalMax — sunt din
> generatorul de diplome Vector Academy (docgen). Nu intră în această comparație.
