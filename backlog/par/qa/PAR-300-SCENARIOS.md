# PAR (Payment Action Request) @ FinFlow — 300 scenarii de testare din viața reală

> **Scop.** Nu teste tehnice „am construit bine ce-am construit", ci **cum vor folosi oamenii modulul**:
> ce flow parcurg, ce așteaptă să poată face, și — pentru fiecare — dacă *avem* funcția, dacă *o avem
> dar are un bug*, sau dacă *o avem în cod dar nu se poate din interfață*. Scris pornind de la
> `PAR-CORE.md` (contractul de comportament), deciziile confirmate ale Violetei (VM1-xx) și o
> cartografiere completă a codului (rute backend, schema, paginile frontend, AI, notificări, teste).
>
> **Verdictele au fost verificate în cod** (referințe `fișier:linie`). Un rezumat al bug-urilor și un
> backlog de features sunt în `PAR-QA-FINDINGS.md` și `PAR-QA-BACKLOG.md`.

## Legenda verdictelor

| Simbol | Înseamnă |
|--------|----------|
| ✅ **MERGE** | Funcția există, e accesibilă din UI, se comportă cum se așteaptă utilizatorul |
| ⚠️ **BUG** | Există dar e greșit / se rupe / rezultat incorect |
| 🔒 **DOAR-BACKEND** | Endpoint-ul există și merge, dar **nu există buton/flow în front-end** ca să-l atingi |
| ❌ **LIPSEȘTE** | Nu există deloc capacitatea — utilizatorul o va căuta și n-o va găsi |
| 🟡 **PARȚIAL** | Merge doar pe unele căi / are o limitare importantă nedocumentată |
| ❓ **DE-VERIFICAT** | Plauzibil din cod, dar necesită rulare live pentru certitudine 100% |

## Personaje (NGO ATIC — proiect „Digital Safeguard", Republica Moldova)

- **Cristina** — Procurement Specialist, rol `requestor`. Depune cereri de plată. Grăbită, telefon + laptop.
- **Ana** — Strategic Projects Director, rol `approver` (DOA Holder, pasul 1).
- **Irina** — Executive Director, `approver` (aprobare finală) + e și tenant `admin` → **par_admin implicit**.
- **Mihai** — ofițer `finance`. Recepționează, plătește, ține evidența.
- **Victor** — al doilea aprobator, primește **delegare** când Ana e în concediu.
- **Dan** — `par_admin` dedicat: configurează DOA, membri, proiecte, coduri buget.
- **Elena** — angajată NOUĂ, fără niciun rol PAR (test de vizibilitate/acces).
- **Owner** — proprietarul organizației, tenant `admin`, primul login pe un tenant gol (bootstrap).
- **Donor/Auditor** — cine cere rapoarte de cheltuieli pe proiect/cod buget/eveniment.

---

## A. Onboarding & configurare organizație (1–15)

1. **[Owner]** Prima logare pe un tenant nou, gol → mă așteaptă un wizard de configurare. **⚠️ BUG** — `ParOnboarding` există și e complet, dar **nimic nu citește `onboardingComplete` ca să redirecteze** un tenant nou către `/business/par/onboarding`; aterizezi pe un dashboard gol (`ParOnboarding.tsx` e rutat manual doar, `App.tsx:210`).
2. **[Owner]** Ca tenant admin nou, fără niciun rând `par_members`, pot totuși intra în modul și configura → **✅ MERGE** — regula „par_admin implicit" pentru tenant roles admin/manager (`requirePARRole.ts:23-30`).
3. **[Owner]** Setez pragul micro-purchase (ex. 10.000 MDL) din Administrare → Setări → **✅ MERGE** (`ParAdmin.tsx` Setări → `updateParSettings`).
4. **[Owner]** Setez moneda implicită a organizației (MDL) → **✅ MERGE** (`parSettings`).
5. **[Owner]** Introduc numele legal al organizației (apare pe PDF-ul PAR) → **✅ MERGE** (`orgLegalName`).
6. **[Owner]** Pun un URL de logo pentru antetul PDF → **✅ MERGE** (`orgLogoUrl`).
7. **[Owner]** Schimb prefixul numerelor de cerere (`PAR` → `ATIC`) → **✅ MERGE** (`requestNoPrefix`, folosit de `generateRequestNo`).
8. **[Owner]** Pe un tenant NOU, primul PATCH la setări care activează DOAR „enforce 3-way match" → **⚠️ BUG** — branch-ul de INSERT nu persistă `enforceThreeWayMatch`/`onboardingComplete`/`pdfHelpUrl` la prima creare a rândului (drift insert-vs-update, `parSettings.ts:76-87`); flag-ul se pierde silențios.
9. **[Owner]** Activez „enforce 3-way match" pe un tenant care are deja setări → **✅ MERGE** (branch-ul de update face spread `...body`).
10. **[Owner]** Import config din Excel la onboarding (proiecte + departamente + coduri buget) → **✅ MERGE** — VM1-02, `POST /api/par/config-import` cu 3 sheet-uri; upsert idempotent (`parConfigImport.ts`).
11. **[Owner]** Descarc întâi șablonul .xlsx de import ca să știu formatul → **✅ MERGE** (`GET /config-import/template`).
12. **[Owner]** Import Excel cu un rând care are „Denumire proiect" gol → rândul e sărit, nu pică tot importul → **✅ MERGE** (row skipped + raportat în `errors[]`).
13. **[Owner]** Import Excel cu sume în format RO „1.234,56" și US „45.50" → parsează corect ambele → **✅ MERGE** (`parseMdlAmount`).
14. **[Owner]** Încarc un fișier `.csv` la import config (nu `.xlsx`) → e respins clar → **✅ MERGE** (422/reject non-xlsx, `parConfigImport.ts:125`).
15. **[Owner]** Sar peste onboarding și configurez mai târziu → **✅ MERGE** („Sari peste" → `onboardingComplete:true`), dar vezi #1: nu există gate care să te fi adus aici.

## B. Membri, roluri, invitații, delegare (16–40)

16. **[Dan]** Invit un coleg pe email cu rolul `approver` → primește link de invitație → **✅ MERGE** (`POST /api/par/invites`, link `#/business/invite?token=`).
17. **[Dan]** Invit pe cineva care e deja membru al tenantului → primesc eroare „already_member" → **✅ MERGE** (409, `parInvites.ts:50`).
18. **[Dan]** Re-invit același email → invitația veche e înlocuită, nu se dublează → **✅ MERGE** (delete prior pending).
19. **[Coleg nou]** Deschid link-ul de invitație și văd cine mă invită + ce rol → **✅ MERGE** (`GET /api/auth/invite-info`).
20. **[Coleg nou]** Accept invitația, îmi pun parola, intru direct în shell-ul FinFlow corect → **✅ MERGE** (accept-invite flipează `appKind` la „business").
21. **[Atacator]** Încerc să-mi cer în body al accept-invite un rol mai mare (`par_admin`) decât cel din invitație → rolul e ignorat, se ia doar din invitație → **✅ MERGE** (hardening `auth.ts:451-460`).
22. **[Coleg nou]** Folosesc un token de invitație deja consumat → primesc „deja folosit", nu se creează dublu cont → **✅ MERGE** (consum atomic în tranzacție).
23. **[Coleg nou]** Deschid o invitație expirată (>7 zile) → e respinsă → **✅ MERGE** (TTL 7 zile).
24. **[Dan]** Văd lista de invitații în așteptare și revoc una → **✅ MERGE** (`GET/DELETE /api/par/invites`).
25. **[Dan]** Fără RESEND_API_KEY setat, invitația nu pleacă pe email dar link-ul copiabil funcționează → **🟡 PARȚIAL** — `emailed:false`, link merge; dar owner-ul trebuie să știe să copieze manual (UX slab dacă nu observă).
26. **[Dan]** Atribui rol unui membru existent pe baza `userId` → **🔒 DOAR-BACKEND parțial** — merge, dar formularul „Add role" cere un **UUID brut pe care nimeni nu-l știe** (`ParAdmin.tsx:1431`); nu există un user-picker.
27. **[Irina]** Îmi auto-atribui un rol PAR din panoul „Rolurile mele" fără să știu UUID-ul → **✅ MERGE** (`MyRolesPanel`, workaround pentru #26).
28. **[Dan]** Revoc un rol de la un membru → **✅ MERGE** (`DELETE /api/par/members/:id`).
29. **[Dan]** Setez un plafon de aprobare per aprobator (`approvalLimitCents = 5.000 MDL`) → **⚠️ BUG** — se salvează dar **nu e citit/aplicat nicăieri**; aprobatorul poate aproba orice sumă (câmp mort, verificat prin grep — `parMembers.ts:26` scrie, nimic nu citește).
30. **[Ana]** Plec în concediu, deleg autoritatea de aprobare lui Victor pentru 1–15 august → **✅ MERGE** (`POST /api/par/delegations`, interval datat).
31. **[Victor]** În perioada delegării, văd în inbox cererile lui Ana și le pot aproba → **✅ MERGE** (semnătura notează „delegat de …").
32. **[Ana]** Încerc să deleg cuiva care NU e aprobator → primesc „delegate_not_approver" → **✅ MERGE** (`parDelegations.ts:93-105`).
33. **[Ana]** Încerc să-mi deleg mie însămi → respins → **✅ MERGE** (no self-delegation).
34. **[Ana]** Pun `ends_at` înainte de `starts_at` → respins → **✅ MERGE**.
35. **[Victor]** Delegat de Ana, încerc să **RESPING** o cerere a ei → **⚠️ BUG** — reject nu onorează delegarea (doar aprobarea o onorează); găsitorul de pas la reject verifică doar assigned-user sau role-based (`parApprovals.ts:503-509`). Victor poate aproba dar nu poate respinge.
36. **[Victor]** Delegat, încerc „Cere modificări" pe cererea lui Ana → **⚠️ BUG** — request-changes cere `canApprove` direct (`parApprovals.ts:574`), nu onorează nici delegarea nici assignment-ul explicit.
37. **[Dan]** Anulez o delegare activă → **✅ MERGE** (soft-delete `active=false`).
38. **[Dan]** Văd toate delegările din tenant (ca admin) → **✅ MERGE** (`GET /api/par/delegations` all pt. admin).
39. **[Oricine]** Un requestor simplu poate crea o delegare de la el către un aprobator → **🟡 PARȚIAL** — endpoint-ul e ne-gate-uit; rândul se creează dar e inert (nu deține pași). Zgomot în tabelă, impact real mic (`parDelegations.ts:76`).
40. **[Coleg nou]** După accept invitație, rolul meu de tenant e „teacher" într-un produs financiar → **🟡 PARȚIAL** — cosmetic/leftover din schema learn (`auth.ts:560`); accesul PAR e corect via `par_members`, dar e confuz.

## C. Date de referință: departamente, proiecte, evenimente, coduri buget (41–70)

41. **[Dan]** Creez un departament („ATIC") → **✅ MERGE** (`POST /api/par/departments`).
42. **[Dan]** Redenumesc / dezactivez un departament → **✅ MERGE** (soft-delete `active=false`).
43. **[Cristina]** La crearea cererii aleg departamentul dintr-un dropdown → **✅ MERGE** (listă din `listDepartments`).
44. **[Dan]** Creez un proiect/program cu donor („Digital Safeguard / Donor X") → **✅ MERGE**.
45. **[Dan]** Atribui aprobatori desemnați unui proiect (doar ei pot aproba cererile lui) → **✅ MERGE** (`PUT /api/par/projects/:id/approvers`).
46. **[Ana]** Un proiect fără aprobatori desemnați e aprobabil de orice aprobator → **✅ MERGE** (default-open scoping, `projectApprovers.ts:14`).
47. **[Ana]** Sunt aprobator dar NU sunt desemnat pe proiectul X → nu pot APROBA cererea → **✅ MERGE** (scoping aplicat în approve + inbox).
48. **[Ana]** Nu-s desemnată pe proiectul X, dar pot totuși **RESPINGE** cererea lui → **⚠️ BUG** — project scoping NU e aplicat la reject/request-changes (`parApprovals.ts`), doar la approve/inbox.
49. **[Dan]** Creez un eveniment sub un proiect (VM1-04) → **✅ MERGE** (`parEvents`, `projectId`).
50. **[Cristina]** La cerere, dropdown-ul de evenimente e filtrat după proiectul ales → **✅ MERGE** (`?project_id=`).
51. **[Cristina]** Aleg un proiect fără evenimente → văd un hint + link către admin → **✅ MERGE** (`ParCreateForm.tsx:677-714`).
52. **[Dan]** Redenumesc / șterg un eveniment → **✅ MERGE** (PUT/DELETE soft).
53. **[Dan]** Creez un cod bugetar cu alocare (100.000 MDL) → **✅ MERGE** (`allocatedCents`).
54. **[Cristina]** La alegerea codului bugetar văd soldul rămas live → **✅ MERGE** (`getBudgetCodeBalance`).
55. **[Cristina]** Depun o cerere care depășește alocarea codului → primesc avertisment (soft, nu blochează) → **✅ MERGE** (`over_budget` advisory).
56. **[Dan]** Văd utilizarea tuturor codurilor (alocat/angajat/plătit/disponibil) → **✅ MERGE** (`GET /budget-codes/usage`).
57. **[Dan]** „Angajat" e calculat din `totalEstimatedCents` al cererilor în curs, nu din plăți → **✅ MERGE** (intenționat, consistent cu formularul).
58. **[Dan]** Creez un vendor/beneficiar reutilizabil (nume + IDNP + IBAN + bancă) → **✅ MERGE** (`POST /api/par/vendors`, validează IDNP 13 cifre + IBAN mod-97).
59. **[Dan]** Salvez același beneficiar de două ori (același IBAN) → se face dedup, nu se dublează → **✅ MERGE** (dedup pe IBAN normalizat, 200 vs 201).
60. **[Cristina]** Caut o companie în registru (Contfirm) după nume și preiau IDNO → **✅ MERGE** (`GET /api/registry/companies`).
61. **[Cristina]** Registrul îmi arată și activitățile/emailul/telefonul companiei → **🔒 DOAR-BACKEND** — `GET /api/registry/companies/:idno` există cu toate detaliile, dar **UI nu-l consumă** (doar nume+IDNO din search, `par.ts:1158`).
62. **[Cristina, requestor]** Ca simplu requestor, pot crea un vendor cu IDNP+IBAN → **⚠️ BUG (GDPR)** — `POST /api/par/vendors` **nu are role gate**; orice user autentificat scrie în registrul GDPR-sensibil (`parVendors.ts:56`).
63. **[Elena, fără rol]** Ca angajată fără rol PAR, pot edita datele bancare ale unui beneficiar existent → **⚠️ BUG (GDPR)** — `PATCH /api/par/vendors/:id` ne-gate-uit (`parVendors.ts:110`); oricine schimbă IBAN-ul unui payee (risc de fraudă).
64. **[Dan]** Șterg un vendor din registru → **✅ MERGE** (soft-delete, gate `par_admin` — singurul gate-uit).
65. **[Dan]** Vendor-ul altui tenant NU apare în lista mea → **✅ MERGE** (izolare tenant).
66. **[Dan]** Caut o companie lichidată în registru → e exclusă / semnalată → **✅ MERGE** (filtru lichidate în `companyRegistry`).
67. **[Dan]** Salvez un vendor cu IBAN cu checksum greșit → 400 → **✅ MERGE** (mod-97).
68. **[Dan]** Salvez un vendor cu IDNP de 12 cifre → 400 → **✅ MERGE** (13 cifre exact).
69. **[Cristina]** Beneficiarul salvat de mine în PAR e vizibil și în FinDesk (fin_parties)? → **⚠️ BUG/GAP** — **NU**; două registre deconectate (`par_vendors` vs `fin_parties`), fără FK/sync; ce salvezi într-unul nu se vede în celălalt.
70. **[Cristina]** Vocabularul „fizic/juridic" (payee_type) vs „individual/company" (vendor.kind) e același lucru → **🟡 PARȚIAL** — două vocabulare pentru același concept, nesincronizate (`par.ts:230` vs `:348`).

## D. Matricea DOA & rutarea aprobărilor (71–90)

71. **[Dan]** Configurez o regulă DOA: ≤ prag → 1 pas (Aprobator) → **✅ MERGE** (`POST /api/par/doa`).
72. **[Dan]** Configurez o regulă: > prag, ≤ 100k → 2 pași (DOA Holder + Director Executiv) → **✅ MERGE**.
73. **[Dan]** Configurez o bandă > 100k → 3 pași → **✅ MERGE**.
74. **[Cristina]** Depun o cerere de 7.000 MDL (peste prag) → se creează lanț de 2 pași, pas 1 deblocat, pas 2 blocat → **✅ MERGE** (`resolveApprovalChain` + `submit.ts`).
75. **[Cristina]** Cerere ≤ prag → 1 singur pas de aprobare → **✅ MERGE**.
76. **[Dan]** Regulă DOA specifică pe charge_to=program bate regula generică (null) → **✅ MERGE** (most-specific wins, `doa.ts:96-110`).
77. **[Dan]** Regulă DOA specifică pe departament → aplicată corect → **✅ MERGE**.
78. **[Dan]** Configurez pasul 2 „trebuie semnat de rolul FINANCE" (approverParRole) → **⚠️ BUG** — `approverParRole` e rezolvat dar **nu e aplicat la aprobare**; nu există coloană pe `par_approvals` și gate-ul verifică doar „assigned user vs orice approver". Orice approver simplu poate semna pasul „finance" (`doa.ts:119` + `parApprovals.ts:181`).
79. **[Dan]** Pinuiesc un user specific pe un pas DOA care nu e membru → primesc „approver_not_a_member" → **✅ MERGE** (validare `parDoa.ts:24-38`).
80. **[Dan]** Uit complet să configurez matricea DOA → orice cerere primește 1 pas generic „Aprobator" → **🟡 PARȚIAL** — fallback anti-blocaj (`doa.ts:77`); sigur contra „stuck", dar o plată mare trece cu o singură semnătură (sub-controlat).
81. **[Ana]** Aprob pasul 1 din 2 → pasul 1 devine approved, pasul 2 devine pending, cererea rămâne pending_approval → **✅ MERGE** (secvențial, `parApprovals.ts:238`).
82. **[Irina]** Aprob pasul final → cererea trece în `approved` (sau `in_finance` dacă execute_payment) → **✅ MERGE**.
83. **[Victor]** Încerc să aprob pasul 2 înainte ca pasul 1 să fie aprobat → blocat (pas locked) → **✅ MERGE** (unlock secvențial).
84. **[Cristina, și approver]** Sunt și requestor și approver → încerc să-mi aprob propria cerere → **⚠️ BUG (SECURITATE)** — pe pași role-based **nu există check `userId !== requestedByUserId`** la aprobare (`parApprovals.ts:41-43`). „Blocarea self-approval" din submit doar de-asignează pasul specific, dar cade pe rutare role-based pe care requestor-approver o satisface. Un tenant admin (par_admin implicit) își poate aproba singur cererea.
85. **[Ana]** Aprob în masă 10 cereri deodată din inbox → **✅ MERGE** (`POST /api/par/bulk-approve`, max 25).
86. **[Ana]** La bulk approve, o cerere pică (locked/status greșit) dar restul trec → **✅ MERGE** (per-id success/failure).
87. **[Cristina]** Cerere non-MDL (EUR) → suma e convertită în MDL pentru pragul DOA → **🟡 PARȚIAL** — convertit la submit (`toMdlCents`), dar vezi #124: regula de 10% la plată folosește `totalEstimatedCents` (EUR) vs prag MDL.
88. **[Cristina]** Conversia FX eșuează (rată indisponibilă) la submit → **⚠️ BUG** — o cerere de 1.000 EUR e rutată ca 1.000 MDL (~20× prea mic), sărind aprobatori de nivel înalt (`submit.ts:140-144`).
89. **[Dan]** Un aprobator cu plafon setat sub sumă tot poate aproba → **⚠️ BUG** — vezi #29 (`approvalLimitCents` neaplicat).
90. **[Aprobator vechi]** O cerere veche blocată cu 0 pași se auto-repară când deschid inbox-ul → **✅ MERGE** (`backfillStuckApprovalChains`).

## E. Crearea unei cereri — antet, clasificare, linii (91–120)

91. **[Cristina]** Apăs „Cerere nouă" → se creează un draft imediat (pot adăuga linii/atașamente pe loc) → **✅ MERGE** (`createPar` on mount).
92. **[Cristina]** Data cererii e pre-completată cu azi → **✅ MERGE**.
93. **[Cristina]** „Data necesară" se auto-completează la data cererii + 10 zile până o editez → **✅ MERGE** (`ParCreateForm.tsx:151`).
94. **[Cristina]** Pun „Data necesară" înainte de data cererii → respins → **✅ MERGE** (validare `date_needed ≥ date_of_request`).
95. **[Cristina]** Numele solicitantului e pre-completat din sesiune, needitabil → **✅ MERGE**.
96. **[Cristina]** Aleg scopul: execute_payment / obtain_quotations / provide_estimate → **✅ MERGE**.
97. **[Cristina]** Aleg obtain_quotations → apare secțiunea RFQ (Quotes) → **✅ MERGE** (`QuotesSection`).
98. **[Cristina]** Adaug o linie: descriere + cantitate + UM + preț unitar → **✅ MERGE** (`addLineItem`, total calculat server-side).
99. **[Cristina]** UM are sugestii (bucăți, sesie, ore…) via datalist → **✅ MERGE**.
100. **[Cristina]** Totalul se recalculează automat când adaug/șterg linii → **✅ MERGE** (`recalcParTotal`).
101. **[Cristina]** Greșesc prețul pe o linie și vreau să-l corectez → **🔒 DOAR-BACKEND** — `PATCH /line-items/:lineId` există dar **nu are UI**; trebuie să ștergi linia și s-o readaugi (`updateLineItem` fără caller).
102. **[Cristina]** Pun cantitate 0 sau negativă → respins → **✅ MERGE** (qty > 0).
103. **[Cristina]** Vreau cantitate fracționară (1.5 ore) → **🟡 PARȚIAL / LIPSEȘTE** — `quantity` e INTEGER în schema; fracțiile sunt imposibile (`par_line_items.quantity`).
104. **[Cristina]** Total peste prag → văd nota „regula 10%" → **✅ MERGE** (`above_micro_threshold`).
105. **[Cristina]** Completez end-use (descrierea utilizării) → **✅ MERGE** (required pt execute_payment).
106. **[Cristina]** Aleg charge_to (operations/program/other) + cod de facturare → **✅ MERGE**.
107. **[Cristina]** Aleg moneda MDL/EUR/USD → **✅ MERGE** (RON exclus intenționat, VM1-03).
108. **[Cristina]** Încerc să salvez o cerere în RON → 400 → **✅ MERGE** (enum guard).
109. **[Cristina]** Salvez un draft, plec, revin mâine să-l continui → **⚠️ BUG (MAJOR)** — **nu există cale de a re-edita un draft salvat din UI**; `ParCreateForm` face mereu `createPar()` la mount și nu citește un id din rută; detaliul e read-only fără buton „Editează" (`ParDetail.tsx` docstring promite „Edit draft" dar nu-l implementează).
110. **[Cristina]** Salvez cererea ca șablon pentru data viitoare → **✅ MERGE** („Salvează ca șablon").
111. **[Cristina]** Instanțiez o cerere dintr-un șablon salvat → **✅ MERGE** (`instantiateParTemplate` → draft nou).
112. **[Cristina]** Șterg un șablon vechi de care nu mai am nevoie → **🔒 DOAR-BACKEND** — `DELETE /api/par/templates/:id` există dar **fără UI**; șablonul e permanent din perspectiva userului.
113. **[Cristina]** Duplic o cerere existentă ca punct de plecare → **✅ MERGE** (`POST /:id/duplicate`).
114. **[Cristina]** La duplicare, atașamentele/aprobările/plata NU se copiază → **✅ MERGE** (doar antet + linii).
115. **[Cristina]** Duplic o cerere pe care NU am voie să-i văd payee-ul → câmpurile payee nu se copiază → **✅ MERGE** (copiate doar dacă am voie să le văd).
116. **[Cristina]** Antetul (departament/proiect/cod buget) nu e validat ca obligatoriu → **🟡 PARȚIAL** — doar linii + (pt execute_payment) end-use + payee sunt validate; poți depune fără departament/proiect (`clientValidate`).
117. **[Cristina]** Cerere obtain_quotations aproape goală (fără payee/end-use) poate fi depusă → **🟡 PARȚIAL/BUG** — purpose ≠ execute_payment sare validarea payee/end-use; o astfel de cerere „goală" trece (`ParCreateForm.tsx:520`).
118. **[Cristina]** Numărul cererii e secvențial per tenant (PAR-2026-0001) fără coliziuni → **✅ MERGE**.
119. **[Cristina]** Instanțiez din șablon → numărul NU e „PAR-PAR-0001" (dublu prefix) → **✅ MERGE** (bug istoric reparat, `parTemplates.ts:272`).
120. **[Cristina]** Câmpul „Funcție / Cod" (titlul solicitantului) apare pe PDF → **✅ MERGE** (`requestorTitle`).

## F. Payee / beneficiar / lookup registru (121–135)

121. **[Cristina]** Aleg un beneficiar salvat din dropdown → se copiază name/IDNP/IBAN/bancă pe cerere → **✅ MERGE** (snapshot vendor).
122. **[Cristina]** Introduc manual un payee fizic (nume + IDNP + IBAN) → **✅ MERGE** (toggle fizic/juridic).
123. **[Cristina]** Introduc un IBAN MD invalid la payee → validare client-side îl prinde → **✅ MERGE** (`ParCreateForm.tsx:520`).
124. **[Cristina]** Introduc un IBAN străin (non-MD) → e acceptat dar semnalat → **✅ MERGE** (foreign IBAN flagged, `choosePayee.ts`).
125. **[Cristina]** La plată, payee-ul inline cu IBAN se salvează automat în registru (dedup pe IBAN) → **✅ MERGE** (VM1-05, `autoLinkVendorOnPayment`).
126. **[Cristina]** Un IDNP de 13 cifre pus greșit în slotul IBAN e re-rutat corect la IDNO → **✅ MERGE** (`routeIdAndIban`).
127. **[Approver]** Ca aprobator, văd datele payee (IBAN/IDNP) pe cererea rutată mie → **✅ MERGE** (acces elevat).
128. **[Cristina]** Ca requestor, NU văd payee-ul cererii altui requestor → câmpurile sunt nule → **✅ MERGE** (GDPR nulling pe `GET /:id`, `par.ts:711`).
129. **[Cristina]** Dar pot descărca „dosarul complet" al cererii altui requestor cu tot cu IBAN/IDNP → **⚠️ BUG (GDPR)** — `GET /:id/dosar` cere doar „orice rol PAR SAU autor"; ocolește nulling-ul de payee (`par.ts:1310-1313`). Scurgere reală de date personale/bancare.
129b. **[Elena]** Fără niciun rol, dosarul altei cereri îmi e refuzat → **✅ MERGE** (403 dacă nu ai rol și nu ești autor) — dar vezi #129 pentru oricine CU rol.
130. **[Cristina]** Payee juridic — caut compania în registru și preiau IDNO + nume → **✅ MERGE**.
131. **[Cristina]** Aceeași companie ca și organizația mea NU e propusă ca beneficiar → **✅ MERGE** (self-org exclus via `orgLegalName`).
132. **[Cristina]** Banca (ex. „BC Moldindconbank") apare corect pe payee și pe PDF → **✅ MERGE**.
133. **[Cristina]** Editez beneficiarul pe un draft (schimb IBAN-ul) → **✅ MERGE** (`PATCH /:id` payee, doar draft/changes_requested).
134. **[Cristina]** Payee cu diacritice românești pe PDF nu sparge randarea → **✅ MERGE** (escape corect, test PAR-114-3).
135. **[Cristina]** Vreau plăți către mai mulți beneficiari pe aceeași cerere → **❌ LIPSEȘTE** — un singur payee per PAR (name/IDNP/IBAN unic pe header).

## G. AI prefill din document (136–155)

136. **[Cristina]** Încarc o factură PDF și apăs „Completează automat din document" → se completează payee/sumă/IBAN/scop → **✅ MERGE** (`POST /api/par/ai-prefill`, reuse captureExtractor).
137. **[Cristina]** Butonul AI e dezactivat până există un draft → **✅ MERGE** (necesită `parId`).
138. **[Cristina]** Încarc o poză (JPEG) a facturii → merge prin modelul vision → **✅ MERGE** (base64 data URL).
139. **[Cristina]** Încarc un fișier > 8 MB → primesc 413 → **✅ MERGE** (`parAiPrefill.ts:123`).
140. **[Cristina]** AI-ul îmi arată nivelul de încredere per câmp → **✅ MERGE** (confidence + low_confidence).
141. **[Cristina]** Documentul nu e financiar → primesc avertisment „not invoice" → **✅ MERGE** (`documentClass`).
142. **[Cristina]** Factura are 2 companii (furnizor + client) → AI mă întreabă „care e beneficiarul?" → **✅ MERGE** (radio chooser, `needsClarification` + candidates).
143. **[Cristina]** AI alege beneficiarul după ROL (executor/furnizor), nu după cuvântul „Beneficiar" → **✅ MERGE** (`roleRank`, exclude plătitorul/clientul).
144. **[Cristina]** Organizația MEA (plătitorul) e exclusă din candidați → **✅ MERGE** (fuzzy self-org match).
145. **[Cristina]** IDNO extras care nu are exact 13 cifre e semnalat/eliminat → **✅ MERGE** (`isValidIDNP`).
146. **[Cristina]** IBAN MD extras cu checksum greșit e curățat + low-confidence → **✅ MERGE** (mod-97).
147. **[Cristina]** Prefill-ul NU scrie nimic în DB — doar propune, scrierea reală e la create/update → **✅ MERGE** (fără gap de validare directă).
148. **[Cristina]** Fără cheie API (CI/stub), extractorul cade pe parser regex determinist → **✅ MERGE** (`parsePartiesFromText`).
149. **[Cristina]** Contract multi-pagină — blocul bancar de la pagina 3 nu e trunchiat → **✅ MERGE** (`buildAiText` păstrează ferestre în jurul ancorelor IBAN/DATE BANCARE).
150. **[Cristina]** Scopul (end-use) extras vine mereu cu low-confidence și se aplică silențios → **🟡 PARȚIAL** — confidence fix 0.6 (`parAiPrefill.ts:184`); mereu „low", dar formularul îl aplică fără să sublinieze.
151. **[Cristina]** AI extrage și liniile (line items) din factură → **🟡 PARȚIAL** — `lineItems[]` se întorc, dar VM1-13 spune „PAR lines = phase 2"; aplicarea lor completă e limitată.
152. **[Regresie]** Prefill-ul NU mai crapă cu „invalid uuid par-prefill-…" → **✅ MERGE** (fix `randomUUID()` ca entityId, `parAiPrefill.ts:146`).
153. **[QA]** Există un test care chiar INVOCĂ `/api/par/ai-prefill` cu un document real (nu doar „butonul se randează") → **❓ DE-VERIFICAT** — `par-ai-prefill.test.ts` există; trebuie confirmat că postează un document și aserează 200+shape (§3.5.1quater).
154. **[Cristina]** Extrag payee-ul, apoi îl editez manual înainte de submit → **✅ MERGE** (`applyResolvedPayee` → form state editabil).
155. **[Cristina]** Moneda extrasă (EUR/USD/MDL) se pre-completează pe cerere → **✅ MERGE**.

## H. Atașamente (156–170)

156. **[Cristina]** Atașez un contract PDF la cerere → apare cu nume + tip (kind) → **✅ MERGE** (`POST /:parId/attachments`).
157. **[Cristina]** Atașez mai multe fișiere deodată (multi-upload) → **✅ MERGE** (VM1-06).
158. **[Cristina]** Încerc să atașez al 11-lea fișier → 409 „too_many_attachments" → **✅ MERGE** (max 10).
159. **[Cristina]** Aleg tipul atașamentului (contract/factură/act de primire/…) → **✅ MERGE** (kind enum).
160. **[Cristina]** Atașez un .exe deghizat ca `data:application/pdf;base64,…` → e acceptat → **⚠️ BUG** — MIME check se bazează pe prefixul data-URL controlat de client (`parAttachments.ts:160`); orice bytes pot fi etichetate PDF.
161. **[Cristina]** Șterg un atașament de pe draftul meu → **✅ MERGE** (autor + draft/changes_requested).
162. **[Mihai]** La finanțe, atașez dovada plății pe o cerere plătită → **✅ MERGE** (finance poate upload la approved/in_finance/paid).
163. **[Mihai]** Am urcat dovada greșită și vreau s-o șterg → **⚠️ BUG** — finance poate UPLOAD dar **nu poate DELETE** (delete e autor-only + draft/changes_requested, `parAttachments.ts:204`).
164. **[Approver]** Deschid și vizualizez atașamentele cererii rutate mie → **✅ MERGE** (view: autor sau rol elevat).
165. **[Elena]** Fără rol, cer atașamentele unei cereri → 404 → **✅ MERGE**.
166. **[Perf]** Cerere cu 10 atașamente de ~10MB — lista le întoarce pe toate inline (base64) → **⚠️ BUG (PERF)** — `GET /:parId/attachments` întoarce tot `fileUrl` inline fără paginare (`parAttachments.ts:99`); payload uriaș.
167. **[Cristina]** `attachments_present=true` dar 0 fișiere la submit → warning nu blocaj → **✅ MERGE** (dacă există note).
168. **[Cristina]** Atașamentele sunt stocate ca base64 în DB, nu în bucket → **🟡 PARȚIAL** — funcțional dar nu scalabil (10×10MB base64 per cerere în DB).
169. **[Cristina]** `size_bytes` raportat de client nu e verificat server-side → **⚠️ BUG minor** — default 0, ne-verificat; doar lungimea string-ului e mărginită.
170. **[Mihai]** După plată, urc „ordinul de plată" ca atașament kind=payment_order → **✅ MERGE** (`ParDetail.tsx:919`).

## I. Submit & validare (171–185)

171. **[Cristina]** Depun un draft complet valid → devine `pending_approval` + redirect la detaliu → **✅ MERGE**.
172. **[Cristina]** Depun un draft gol (fără linii) → 400 cu mesaj prietenos „adaugă articole" → **✅ MERGE** (erori mapate RO).
173. **[Cristina]** Depun cu linii dar fără end-use (execute_payment) → 400 „end use required" → **✅ MERGE**.
174. **[Cristina]** Depun cu end-use dar fără payee → 400 „payee required" → **✅ MERGE**.
175. **[Cristina]** Re-depun o cerere deja `pending_approval` → 409 (idempotency) → **✅ MERGE**.
176. **[Cristina]** După submit, încerc să editez antetul → 403 (imutabil) → **✅ MERGE**.
177. **[Cristina]** După submit, încerc să adaug o linie → 403 → **✅ MERGE**.
178. **[Cristina]** La submit se calculează un hash al corpului (dovadă imutabilitate) → **✅ MERGE** (`body_hash`, `submit.ts:196`).
179. **[Attacker]** Modific corpul cererii în DB după submit → aprobarea e blocată cu integrity_violation → **✅ MERGE** (hash re-verificat la approve + display, 409).
180. **[Cristina]** Depun cerere cu total = 0 → 400 → **✅ MERGE** (total > 0).
181. **[Cristina]** obtain_quotations cu < 3 oferte → avertisment (regula donor 3-bid) nu blocaj → **✅ MERGE** (`quotes_below_three` non-blocking).
182. **[Cristina]** obtain_quotations fără ofertă selectată → avertisment `no_quote_selected` → **✅ MERGE**.
183. **[Cristina]** La resubmit după changes_requested, lanțul de aprobare se reconstruiește de la zero → **✅ MERGE** (șterge aprobările vechi, re-rulează DOA).
184. **[Cristina]** Mesajele de eroare la submit sunt prietenoase, nu `validation_failed` brut → **✅ MERGE** (mapare RO, `ParCreateForm.tsx:47`).
185. **[Cristina]** Depun cerere peste alocarea codului bugetar → `over_budget` advisory, nu blocaj → **✅ MERGE**.

## J. Flux de aprobare — inbox, decizii, secvențial (186–210)

186. **[Ana]** Deschid inbox-ul și văd doar cererile unde eu sunt pasul activ → **✅ MERGE** (`GET /api/par/inbox`).
187. **[Ana]** Inbox-ul arată un badge cu numărul de cereri de aprobat → **✅ MERGE** (count badge, refresh 60s).
188. **[Ana]** Aprob o cerere din inbox cu un comentariu opțional → **✅ MERGE** (DecisionModal).
189. **[Ana]** Semnătura mea (nume) e pre-completată din /auth/me → **✅ MERGE**.
190. **[Ana]** Resping o cerere fără comentariu → 400 (comentariul e obligatoriu) → **✅ MERGE**.
191. **[Ana]** Resping cu comentariu → cererea devine `rejected`, lanțul se oprește, requestorul e notificat → **✅ MERGE**.
192. **[Ana]** „Cere modificări" cu comentariu → cererea devine `changes_requested` → **✅ MERGE** (backend).
193. **[Cristina]** După „cere modificări", editez cererea și o retrimit → **⚠️ BUG (MAJOR)** — **nu pot edita din UI** (vezi #109); butonul e doar „Re-trimite" as-is, fără posibilitatea de a schimba ce mi s-a cerut. Bucla changes-requested e ruptă din front-end.
194. **[Ana]** Aprob în masă din inbox (checkbox-uri + „Aprobă N selectate") → **✅ MERGE** (bulk, VF-102).
195. **[Ana]** Sortez și filtrez inbox-ul pe proiect / coloane → **✅ MERGE** (client-side).
196. **[Cristina]** Ca requestor deschid inbox-ul → nu văd cereri de aprobat (nu-mi apar acțiuni) → **✅ MERGE**.
197. **[Cristina, fără rol approver]** Încerc să aprob o cerere → 403 → **✅ MERGE** (dar vezi #84 pt requestor CARE ARE și rol approver).
198. **[Irina]** Aprob pasul final al unei execute_payment → sare direct în `in_finance` (nu se oprește în approved) → **✅ MERGE** (`parApprovals.ts:264`).
199. **[Irina]** Aprob pasul final al unei obtain_quotations → se închide în `approved` (nu merge la finanțe) → **✅ MERGE**.
200. **[Ana]** Văd lanțul de aprobare pe pagina de detaliu (cine, când, ce decizie) → **✅ MERGE** (`ParApprovalChain`).
201. **[Ana]** Aprob un pas când sunt assignată explicit deși nu am rolul generic approver → **✅ MERGE** (VF-002, assignment bypass).
202. **[Victor]** Aprob prin delegare — semnătura notează „delegat de Ana" → **✅ MERGE**.
203. **[Cristina]** După respingere, vreau să „re-depun" cererea respinsă → **⚠️ BUG/UX** — `rejected` e terminal, fără cale de recovery; singura opțiune e `duplicate` (draft nou) sau cancel. Userul se va aștepta la „resubmit" (`par.ts:123`).
204. **[Ana]** Aprob o cerere → requestorul primește notificare de aprobare → **🟡 PARȚIAL** — se scrie in-app + email, DAR clopotelul in-app e rupt (vezi #251); emailul depinde de RESEND key.
205. **[Ana]** După aprobarea mea, următorul aprobator (Irina) e notificat → **🟡 PARȚIAL** — la fel ca #204.
206. **[Ana]** Un aprobator care nu e pe niciun pas al cererii nu o vede în inbox → **✅ MERGE**.
207. **[Ana]** Timeline-ul arată fiecare tranziție (submitted/approved/…) cronologic → **✅ MERGE** (`par_audit` + `ParTimeline`).
208. **[Ana]** Comentariile pe cerere sunt append-only și vizibile tuturor celor cu acces → **✅ MERGE** (`par_comments`, VF-104).
209. **[Ana]** Adaug un comentariu pe o cerere fără s-o aprob (întreb ceva) → **✅ MERGE** (`POST /:id/comments`).
210. **[Dan, par_admin]** Ca admin pot respinge/cere modificări pe orice cerere → **✅ MERGE** (gate include par_admin).

## K. Editare / bucla changes-requested / resubmit (211–225)

211. **[Cristina]** Salvez un draft parțial și îl continui mai târziu de pe alt device → **⚠️ BUG (MAJOR)** — vezi #109; nu există „draftul meu în lucru" reeditabil.
212. **[Cristina]** Draftul meu apare în dashboard la „Cererile mele" cu status draft → **✅ MERGE** (filtrare status).
213. **[Cristina]** Deschid draftul din dashboard → ajung pe detaliu read-only, fără buton „Editează" → **⚠️ BUG** — `ParDetail` nu expune Edit (docstring promite, ActionPanel nu-l are).
214. **[Cristina]** Anulez un draft de care nu mai am nevoie → **✅ MERGE** („Anulează" → DELETE, status cancelled).
215. **[Cristina]** Corectez o singură linie greșită pe draft → **🔒 DOAR-BACKEND** — vezi #101 (updateLineItem fără UI).
216. **[Cristina]** După changes_requested, schimb suma cerută conform feedback-ului → **⚠️ BUG** — imposibil din UI (vezi #193).
217. **[Cristina]** Retrimit o cerere changes_requested cu exact aceleași date → **✅ MERGE** („Re-trimite" funcționează as-is).
218. **[Cristina]** După resubmit cu sumă schimbată, lanțul DOA se recalculează la noua bandă → **✅ MERGE** (backend; dar vezi #216 că nu poți schimba suma din UI).
219. **[Cristina]** Editez payee-ul pe un draft → **✅ MERGE** (`PATCH /:id`, doar draft/changes_requested — backend OK, dar UI-ul de edit lipsește pt changes_requested).
220. **[Cristina]** Editez antetul unei cereri deja aprobate → 403 → **✅ MERGE** (imutabil).
221. **[Cristina]** Șterg o linie de pe draft → totalul scade corect → **✅ MERGE**.
222. **[Cristina]** Draftul păstrează atașamentele când revin la el → **✅ MERGE** (persistate pe parId).
223. **[Cristina]** Filtrele mele din dashboard se păstrează între sesiuni → **✅ MERGE** (`localStorage vf.dashboard.filters`).
224. **[Cristina]** „Cererile mele" arată doar cererile mele → **🟡 PARȚIAL** — secțiunea e etichetată „Cererile mele" dar randează tot ce întoarce `listPar` pentru user, nu strict autor (`ParDashboard.tsx:206`).
225. **[Cristina]** Caut o cerere după număr / payee / descriere linie → **✅ MERGE** (`q` search server-side).

## L. Finanțe — secțiunea 16, plată, regula 10%, 3-way, PO, recepție (226–255)

226. **[Mihai]** Deschid coada de finanțe → văd cererile execute_payment aprobate → **✅ MERGE** (`GET /api/par/finance`).
227. **[Mihai]** Coada arată IDNO/IBAN/sumă/destinație/linie buget cu copy-to-clipboard → **✅ MERGE** (pt paste în internet banking).
228. **[Mihai]** Completez secțiunea 16 (PAR BL / Received By / Assigned To) → cererea trece în `in_finance` → **✅ MERGE**.
229. **[Mihai]** „Received By / Assigned To" sunt input-uri UUID brute, nu user-picker → **⚠️ BUG (UX)** — free-text UUID (`ParFinanceQueue.tsx:124`).
230. **[Mihai]** Înregistrez plata: sumă efectivă (pre-completată cu estimatul) + data + referință → **✅ MERGE** (`POST /:id/pay`).
231. **[Mihai]** Las referința de plată goală → e acceptată (owner a făcut-o opțională) → **✅ MERGE** (`paySchema`).
232. **[Mihai]** Sumă efectivă ≤ +10% din estimat → cererea devine `paid` → **✅ MERGE**.
233. **[Mihai]** Sumă efectivă > +10% peste estimat (și peste prag) → cererea devine `reapproval_required` → **✅ MERGE** (regula 10%).
234. **[Mihai]** Sumă exact +10% → NU declanșează reaprobare → **✅ MERGE** (`>`, nu `≥`).
235. **[Mihai]** Total sub prag, chiar cu >10% depășire → se poate plăti fără reaprobare → **✅ MERGE** (regula doar peste prag).
236. **[Irina]** Reaprob o depășire de 10% → cererea revine în `in_finance` → **✅ MERGE** (`POST /:id/reapprove`).
237. **[Mihai]** După reaprobare, re-rulez plata → nu mai bounce-uiește la infinit → **✅ MERGE** (`overageReapproved` guard).
238. **[Mihai]** Plătesc o cerere în EUR — regula 10% compară corect în aceeași monedă → **⚠️ BUG** — `pay` compară `totalEstimatedCents` (EUR) cu pragul `micro_purchase_threshold_cents` (MDL); apples-to-oranges pt non-MDL (`parPayments.ts:432`, `payment.ts:55`).
239. **[Mihai]** Plătesc o factură în două tranșe → **❌ LIPSEȘTE** — fără plăți parțiale; al doilea `/pay` **suprascrie** primul `actualAmountCents`; fără sold rămas (`parPayments.ts:441`).
240. **[Mihai]** Atașez dovada plății (proof) în modalul de plată → **🟡 PARȚIAL** — modalul urcă proof ca atașament separat; câmpul `proof_url` din `paySchema` NU e trimis de UI (`ParFinanceQueue.tsx:249`), reachable doar prin API.
241. **[Mihai]** Emit un Purchase Order dintr-o cerere aprobată → **✅ MERGE** (`POST /:id/purchase-order`, 1 PO per PAR).
242. **[Mihai]** Descarc PO-ul ca PDF → **✅ MERGE** (`downloadPoPdf`).
243. **[Mihai]** Încerc să emit al doilea PO pe aceeași cerere → 409 → **✅ MERGE** (idempotency).
244. **[Mihai]** Înregistrez recepția bunurilor (ce a sosit) înainte de plată → **✅ MERGE** (`POST /:id/receipts`, per linie).
245. **[Mihai]** Recepție parțială (nu tot a sosit) → marcată `complete=false` → **✅ MERGE**.
246. **[Mihai]** Vreau să înregistrez recepția pe o cerere `approved` (înainte să intre la finanțe) → **⚠️ BUG/limitare** — recepțiile sunt permise DOAR la `in_finance` (`parReceipts.ts:70`); PO se poate emite la approved/paid, dar recepția nu.
247. **[Mihai]** Cu 3-way match activat, plătesc fără PO/recepție → 409 `three_way_match_failed` → **✅ MERGE** (când `enforceThreeWayMatch=true`).
248. **[Mihai]** Fără 3-way match activat (default), plătesc fără niciun control → trece cu warning → **🟡 PARȚIAL** — controlul e opt-in și default OFF; „controlul" nu controlează nimic dacă tenantul nu l-a pornit (`parPayments.ts:425`).
249. **[Mihai]** Văd starea 3-way match pentru o cerere → **✅ MERGE** (`GET /:id/match` + panel).
250. **[Mihai]** Plătesc dintr-o pagină de detaliu a unei cereri specifice → **🔒 DOAR-BACKEND/UX** — butonul „Execută plata" din detaliu doar redirectează la coadă (`ParDetail.tsx:542`), nu deschide PayModal inline.
251. **[Mihai]** La plată, requestorul primește notificare „plătit" → **⚠️ BUG** — se scrie in-app dar clopotelul e rupt (vezi #251/#252 în secțiunea Notificări); emailul depinde de RESEND.
252. **[Mihai]** După plată, payee-ul se salvează automat în registru dacă are IBAN → **✅ MERGE** (VM1-05).
253. **[Mihai]** obtain_quotations NU apare în coada de finanțe → **✅ MERGE** (exclus).
254. **[Mihai]** Recepționez cererea la finanțe din pagina de detaliu → **✅ MERGE** („Recepționează la finanțe", direct fetch).
255. **[Mihai]** Marchez o linie de recepție cu id de linie inexistent → respins → **✅ MERGE** (validare line_item_id).

## M. Multi-valută (256–267)

256. **[Cristina]** Depun o cerere în EUR → rata BNM e înghețată la submit pentru raportare → **✅ MERGE** (VM1-03, `exchangeRate` + `totalMdlCents`).
257. **[Cristina]** Cerere USD → convertită corect în MDL pentru pragul DOA → **✅ MERGE** (`toMdlCents`).
258. **[Cristina]** Nu pot depune în RON → **✅ MERGE** (exclus, VM1-03).
259. **[Donor]** Rapoartele agregă totul în MDL (bază) folosind rata înghețată → **✅ MERGE** (`coalesce(totalMdlCents, totalEstimatedCents)`).
260. **[Mihai]** Plătesc în valuta exactă a cererii (conturi separate per monedă) → **✅ MERGE** (VM1-03, fără conversie forțată la plată).
261. **[Mihai]** Regula 10% pe o cerere EUR — comparație corectă → **⚠️ BUG** — vezi #238 (mix de valute în comparația cu pragul).
262. **[Cristina]** Rata FX indisponibilă la submit → cererea nu se blochează dar e sub-rutată → **⚠️ BUG** — vezi #88.
263. **[Donor]** Raport currency-breakdown: totaluri native per monedă + total MDL → **✅ MERGE** (`GET /reports/currency-breakdown`).
264. **[Donor]** Export CSV cu cereri mixte valutar → **⚠️ BUG** — CSV emite sume native + monedă per rând, dar agregările folosesc MDL; sumarea manuală a CSV-ului mixt e greșită (`parReports.ts:326`).
265. **[Cristina]** Moneda e per-cerere, nu se poate schimba după submit → **✅ MERGE** (imutabil).
266. **[Cristina]** Simbolul/formatarea sumei pe PDF respectă moneda (L pt MDL) → **✅ MERGE** (`paymentAccountPdf.money`).
267. **[Donor]** Vreau conversie FX cu rata curentă (nu înghețată) în rapoarte → **❌ LIPSEȘTE/by design** — out of scope v1 (rata înghețată la submit).

## N. Notificări — in-app + email (268–282)

268. **[Ana]** Sunt notificată în clopoțel când o cerere ajunge la pasul meu → **⚠️ BUG (CRITIC)** — pipeline-ul scrie corect `in_app_notifications`, DAR `NotificationBell` citește `res.unreadCount` / `notif.title/body/link/isRead` care **nu există** pe rândurile brute (`{payload:{body},kind,readAt}`) întoarse de `GET /api/notifications`. Badge = 0, titlu gol, fără deep-link (`NotificationBell.tsx:58-61` vs `notifications.ts:36`).
269. **[Ana]** Dau click pe notificarea din clopoțel ca s-o marchez citită → **⚠️ BUG (CRITIC)** — `markRead(id)` → `PATCH /api/notifications/:id/read`, **rută inexistentă** (există doar `/mark-read` pt toate) → 404.
270. **[Ana]** Emailul de aprobare conține sumă/payee/motiv/proiect/buget dar FĂRĂ IBAN → **✅ MERGE** (VM1-08, `notify.ts:73-145`).
271. **[Ana]** Link-ul din email mă duce direct la cererea corectă → **✅ MERGE** (`parDeepLink` absolut, supraviețuiește Gmail).
272. **[Mihai]** Sunt notificat (finance) când o cerere e complet aprobată → **🟡 PARȚIAL** — scris corect server-side, dar livrarea depinde de #268 (in-app rupt) + RESEND (email).
273. **[Cristina]** Sunt notificată la respingere cu motivul → **🟡 PARȚIAL** — la fel (#268/#274).
274. **[Owner]** Fără `RESEND_API_KEY`, emailurile sunt doar log-uite (stub) → **⚠️ BUG/RISC** — `[EMAIL STUB]` (`providers.ts:46`); combinat cu #268, pe un mediu fără key userul poate să NU primească NICIO notificare reală.
275. **[Dan]** Văd log-ul livrării emailurilor PAR (ultimele 50 + eșecuri) în Administrare → **✅ MERGE** (`GET /api/par/audit/emails`, VM1-07).
276. **[Dan]** Un email eșuat e vizibil ca `failed` în log, nu moare în console → **✅ MERGE** (`EmailLogSection`).
277. **[Ana]** Notificarea nu blochează acțiunea dacă livrarea pică → **✅ MERGE** (best-effort try/catch, `notify.ts:220`).
278. **[Victor]** Ca delegat, primesc și eu notificarea (VM1-07) → **✅ MERGE** (delegate notified).
279. **[Ana]** Motivul respingerii > 500 caractere e trunchiat în notificare → **✅ MERGE**.
280. **[Ana]** Clopoțelul se reîmprospătează periodic (30s) → **✅ MERGE** (dar vezi #268 — conținutul e gol).
281. **[Ana]** „Marchează toate citite" din clopoțel → **✅ MERGE parțial** — `markAllRead` → `/mark-read` există (spre deosebire de #269), deci butonul „toate" merge, dar itemii tot apar goi.
282. **[QA]** Există test care confirmă că userul CHIAR VEDE notificarea în clopoțel (nu doar „rândul s-a inserat") → **❌ LIPSEȘTE** — testele notify se opresc la „row inserted"; nimic nu prinde bug-ul #268.

## O. PDF / dosar / documente (283–294)

283. **[Cristina]** Descarc PDF-ul cererii (formularul PAR reprodus) → **✅ MERGE** (`downloadParPdf`, jsPDF+html2canvas).
284. **[Cristina]** PDF-ul conține toate 16 secțiuni + opțiunea Purpose/Charge marcată X → **✅ MERGE**.
285. **[Cristina]** Boxurile de semnătură din PDF se completează din lanțul de aprobare (nume/titlu/dată) → **✅ MERGE**.
286. **[Cristina]** Diacriticele românești pe PDF nu se strică → **✅ MERGE** (rasterizare HTML).
287. **[Cristina]** PDF-ul generat se re-atașează automat la cerere (kind=par_pdf) → **✅ MERGE** (`ParDetail.tsx:259`).
288. **[Mihai]** Descarc „dosarul complet" (foaie aprobare + atașamente unite) → **✅ MERGE** (`GET /:id/dosar`).
289. **[Mihai]** Dosarul unește docx/xlsx ca anexe separate cu pagină separator → **✅ MERGE** (VM1-12, fără conversie Office→PDF).
290. **[Elena]** Dosarul altei cereri îmi e refuzat dacă n-am rol → **✅ MERGE** — dar vezi #129 (oricine CU un rol PAR îl poate lua, scurgere GDPR).
291. **[Mihai]** Formatarea banilor pe PDF (L 7 000, mii grupate) → **✅ MERGE**.
292. **[Cristina]** „Ordinul de plată" e urcat manual de contabil (fără template generat în faza 1) → **✅ MERGE by design** (VM1-12).
293. **[Cristina]** PDF-ul se generează fără crash pe o cerere complexă (10 linii, 10 atașamente) → **❓ DE-VERIFICAT** — html2canvas pe payload mare; de testat live.
294. **[Cristina]** Link-ul „Instrucțiuni completare formular" (pdfHelpUrl) apare pe PDF → **🟡 PARȚIAL** — `pdfHelpUrl` există în setări dar vezi #8 (nu se persistă la primul insert).

## P. Rapoarte & foldere (295–310→ comprimat 295–305)

295. **[Donor]** Raport cheltuieli per cod bugetar → **✅ MERGE** (`GET /reports/by-budget`).
296. **[Donor]** Raport per departament / proiect / eveniment / charge-to → **✅ MERGE**.
297. **[Donor]** Raport per EVENIMENT (raportare donor VM1-04) → **✅ MERGE** (`by-event`).
298. **[Donor]** Aging (câte cereri + sumă + vârstă medie per status) → **✅ MERGE** (`/reports/aging`).
299. **[Donor]** Cycle-time (submit→approved, submit→paid) → **✅ MERGE**.
300. **[Donor]** Filtrez aging/cycle-time pe o perioadă (from/to) → **⚠️ BUG** — aging și cycle-time IGNORĂ filtrul de perioadă (doar tenant scope, `parReports.ts:246`); userul crede că e fereastră, primește all-time.
301. **[Donor]** Export raport în Excel (nume rezolvate, nu UUID-uri) → **✅ MERGE** (`export.xlsx`, 3 sheet-uri).
302. **[Donor]** Export CSV → **✅ MERGE** (dar vezi #264, valute mixte).
303. **[Donor]** „Cât am plătit vendorului X" (raport per beneficiar) → **❌ LIPSEȘTE** — nu există by-vendor/by-payee.
304. **[Donor]** Trend lunar de cheltuieli (spend over time) → **❌ LIPSEȘTE** — perioada e filtru, nu serie temporală.
305. **[Cristina]** Requestor simplu încearcă să vadă rapoartele → 403 → **✅ MERGE** (gate approver/finance/admin) — dar vezi #319, pagina se randează, se bazează pe API 403.
306. **[Cristina]** Foldere Proiect → status (De aprobat / Aprobate / Plătite) cu numărători + total MDL → **✅ MERGE** (VM1-10/11).
307. **[Cristina]** Sub-foldere Proiect → Eveniment → **✅ MERGE**.
308. **[Cristina]** Click pe un bucket → mă duce în dashboard filtrat pe proiect+status → **✅ MERGE** (deep-link `?project_id=&status=`).
309. **[Donor]** PDF de raport (nu doar per-cerere) → **❌ LIPSEȘTE** — PDF există doar pt cererea individuală.
310. **[Cristina]** Folderele calculează corect totalurile din `listPar` (fără endpoint dedicat) → **✅ MERGE** (agregare client).

## Q. Timeline, audit, integritate (311–320)

311. **[Ana]** Timeline-ul cererii arată fiecare eveniment cu actor + timestamp → **✅ MERGE** (`GET /:id/timeline`).
312. **[Cristina]** Ca requestor văd timeline-ul cererii MELE, nu al altora → **✅ MERGE** (role gate, `parTimeline.ts:46`).
313. **[Ana]** Un eveniment fără actor apare ca „System" → **✅ MERGE**.
314. **[Ana]** Timeline-ul ar arăta diff-ul (înainte/după) la „edited" → **⚠️ BUG** — coloana `par_audit.diff` **nu e scrisă niciodată** (doar citită); UI + teste randează un diff pe care producția nu-l produce (dead column, `parTimeline.ts:94`).
315. **[Dan]** Ca admin văd log-ul global de audit (paginat, filtrabil pe eveniment/dată/actor) → **✅ MERGE** (`GET /api/par/audit`, par_admin only).
316. **[Dan]** Export CSV al audit-ului → **✅ MERGE** (client-built).
317. **[Elena]** Ca non-admin încerc să văd audit-ul global → 403 → **✅ MERGE**.
318. **[Attacker]** Încerc să modific/șterg un rând de audit → **🟡 PARȚIAL** — nu există endpoint de update/delete, dar imutabilitatea e prin convenție, nu prin constrângere DB/trigger.
319. **[QA]** Există test care chiar lovește `/api/par/audit` real + email-log → **❌ LIPSEȘTE** — nimic nu testează gate-ul, paginarea, filtrele sau `failedCount` (toate mock/logic-only).
320. **[Dan]** Vocabularul de evenimente (created/submitted/approved/paid/…) are etichete RO în UI → **✅ MERGE** (`AUDIT_EVENT_LABELS`).

## R. Securitate, GDPR, izolare tenant, permisiuni (321–335)

321. **[Elena, fără rol]** Fără niciun rol PAR, modulul e complet ascuns (nici în meniu, nici pe URL direct) → **✅ MERGE** (VM1-01, `ParGuardPage` blochează tot).
322. **[Cristina]** Cererea unui alt tenant nu-mi apare niciodată → **✅ MERGE** (izolare tenant pe fiecare query).
323. **[Cristina, requestor]** Nu văd cererile altor requestori → **✅ MERGE** (requestor vede doar ale lui pe `GET /api/par`).
324. **[Cristina]** Payee-ul (IBAN/IDNP) altei cereri e nulat pentru mine → **✅ MERGE** pe `GET /:id`, **dar ⚠️ scurs pe `/:id/dosar`** (#129).
325. **[Requestor]** Pot scrie/edita IBAN-uri în registrul de vendori fără rol → **⚠️ BUG (GDPR)** — #62/#63.
326. **[Requestor]** Pot șterge șablonul altui user (hard delete, cross-user) → **⚠️ BUG** — templates ne-gate-uit, DELETE hard scoped doar pe tenant (`parTemplates.ts:230`); șabloanele conțin IBAN/IDNP în snapshot.
327. **[Requestor]** Pot lista șabloanele altora (cu payee în snapshot) → **⚠️ BUG (GDPR)** — listare ne-gate-uită.
328. **[Requestor + approver]** Îmi aprob propria cerere → **⚠️ BUG (SECURITATE)** — #84.
329. **[Attacker]** Trimit `GET /api/par/notauuid/timeline` → 404, nu 500 → **✅ MERGE** (`parUuidGuard`).
330. **[Attacker]** Accesez `/business/par/admin` fără rol admin → panou 403 → **✅ MERGE** (`ParAdmin.tsx:2718`).
331. **[Attacker]** Accesez direct `/business/par/finance` ca requestor → **🟡 PARȚIAL** — pagina se randează (doar `ParGuardPage`/any-role), se bazează pe API 403 din `getFinanceQueue` (`ParFinanceQueue`).
332. **[Attacker]** Modific corpul cererii după submit → integrity_violation blochează aprobarea → **✅ MERGE** (body hash).
333. **[Owner]** Secretele SFS/credențiale la rest sunt criptate AES-256-GCM → **✅ MERGE** (`server/lib/crypto.ts`, per CLAUDE.md).
334. **[Owner]** Setările PAR (prag, nume legal) sunt citibile de orice user din tenant → **🟡 PARȚIAL** — `GET /api/par/settings` ne-gate-uit; probabil ok, inconsistent cu PATCH par_admin-only.
335. **[Elena]** Un user invitat primește rol tenant „teacher" într-un produs financiar → **🟡 PARȚIAL** — #40, cosmetic.

## S. Statement → e-Factura (adiacent, dar în fluxul de plată) (336–345)

336. **[Mihai]** Încarc un extras bancar MAIB (PDF) → se extrag rândurile cu IDNO/IBAN contraparte → **✅ MERGE** (`statementExtractor.ts`).
337. **[Mihai]** Corectez IDNO/IBAN/direcție pe un rând → **✅ MERGE** (`PATCH /:captureId/lines/:lineId`).
338. **[Mihai]** Export XML pentru Import manual în portalul SFS (fără credențiale) → **✅ MERGE** (STMT-005, `export-xml`).
339. **[Mihai]** Fără setări SFS (IDNO+IBAN companie) → export-xml dă 422 clar → **✅ MERGE** (`sfs_settings_missing`).
340. **[Mihai]** Submit direct la SFS (mock mode fără credențiale) → **✅ MERGE** (`createMockTransport`).
341. **[Mihai]** Export XML pe un rând, apoi și submit-efactura pe același rând → dublă factură → **⚠️ BUG** — export-xml e stateless (nu setează `linkedFinInvoiceId`); poți face ambele → 2 facturi pt 1 rând (`finStatement.ts:668`).
342. **[Mihai]** Un rând cu IDNO de 7 cifre trece validarea de buyer → **⚠️ BUG** — regex `missing_buyer_idno` acceptă 7-13 cifre (`statementEfactura.ts:53`), dar IDNO MD e exact 13; SFS îl va respinge downstream.
343. **[Mihai]** e-Factura din extras are TVA hardcodat 0 → **⚠️ BUG** — suma tratată ca finală, `vatRate:0` (`statementEfactura.ts:88`); un buyer care așteaptă defalcare TVA primește e-Factura greșită.
344. **[Mihai]** Un extras MT940/OFX nu produce IDNO buyer → rândul pică la e-Factura → **🟡 PARȚIAL** — doar parserul MAIB PDF/Excel extrage IDNO; MT940/OFX cere editare manuală (`finBankParser.ts`/`mt940Parser.ts`).
345. **[Mihai]** Export batch (zip) al mai multor rânduri e all-or-nothing (un rând invalid → 422) → **✅ MERGE** (STMT-005, per-line errors).

## T. Mobile / dark mode / accesibilitate / polish (346–355)

346. **[Cristina]** Folosesc PAR de pe telefon — nav de jos (bottom nav) cu aceleași gate-uri de rol → **✅ MERGE** (`BusinessShell` mobile nav).
347. **[Cristina]** Creez o cerere de pe telefon (single-screen, nu wizard 7 pași) → **✅ MERGE** (form single-screen).
348. **[Toți]** Paginile PAR sunt lizibile în dark mode (fără hex hardcodat) → **❓ DE-VERIFICAT** — design system Vector 365; de confirmat vizual pe toate paginile PAR.
349. **[Toți]** Fiecare input are `<label>`, butoanele icon au `aria-label` (WCAG AA) → **❓ DE-VERIFICAT** — parțial confirmat (ParTimeline region label, ParAdmin role=alert); audit axe complet lipsă pe paginile noi.
350. **[Cristina]** Badge-urile de inbox/finanțe se actualizează live (60s) → **✅ MERGE**.
351. **[Cristina]** Folders folosește un shell diferit (BusinessShell direct) → randare inconsistentă → **🟡 PARȚIAL** — divergență de shell (`ParFolders.tsx:29`), latent.
352. **[Cristina]** Copy-to-clipboard pe IBAN/sumă în coada finanțe → feedback vizual → **✅ MERGE** (`CopyValue`).
353. **[Toți]** Meniul lateral se comută în „PAR-only" cu link „Toate modulele" înapoi → **✅ MERGE** (`PAR_NAV_GROUPS`).
354. **[Elena]** Grupul „PAR" din meniul principal apare doar dacă am rol PAR → **✅ MERGE** (`hasPar`).
355. **[Cristina]** Din FinDesk/cheltuieli, butonul „Creează PAR" mă duce la formular → **✅ MERGE** (`PaymentApprovalBadge`).

## U. Cazuri limită & integritate date (356–365)

356. **[Cristina]** Creez 2 cereri simultan (2 taburi) → numerele nu se ciocnesc → **✅ MERGE** (collision-free request_no).
357. **[Mihai]** Anulez o cerere deja `paid` → blocat → **✅ MERGE** (terminal = paid/cancelled).
358. **[Cristina]** Anulez o cerere `pending_approval` → devine cancelled, lanțul se oprește → **✅ MERGE**.
359. **[Dan]** Șterg un proiect care are cereri legate → soft-delete (cererile rămân) → **✅ MERGE** (active=false).
360. **[Attacker]** Trimit un `charge_to` invalid la create → 400 → **✅ MERGE** (enum guard).
361. **[Cristina]** Cerere cu 50 de linii — totalul rămâne corect (integer, fără float drift) → **✅ MERGE** (minor units).
362. **[Mihai]** Plată cu `actual_amount_cents` negativ → respins → **✅ MERGE** (positive int).
363. **[Mihai]** Un audit insert care pică oprește mutația părinte → **🟡 PARȚIAL** — `writeAudit` fără try/catch (fail-closed pt integritate, dar poate apărea ca 500).
364. **[Dan]** Modific pragul micro-purchase → cererile NOI rutează după noua valoare → **✅ MERGE** (cele vechi păstrează lanțul).
365. **[Cristina]** O cerere obtain_quotations aprobată — vreau s-o convertesc în execute_payment (plată) → **❌ LIPSEȘTE** — nu există convert estimate→payment; trebuie cerere nouă.

---

## Rezumat verdicte (din 365 scenarii — includ sub-scenarii)

| Verdict | Aprox. | Exemple cheie |
|---------|--------|---------------|
| ✅ MERGE | ~245 | fluxul de bază create→approve→pay, DOA, PDF, rapoarte, izolare tenant, AI prefill |
| ⚠️ BUG | ~30 | #84 self-approval, #109/#193 edit draft, #129 dosar GDPR, #238 10% EUR, #268/#269 clopoțel, #314 diff, #341/#343 e-Factura |
| 🔒 DOAR-BACKEND | ~7 | #101 edit linie, #112 delete șablon, #61 registru detaliu, #250 plată din detaliu |
| ❌ LIPSEȘTE | ~9 | #135 payee multipli, #239 plăți parțiale, #303 raport per vendor, #304 trend lunar, #365 convert estimate→plată |
| 🟡 PARȚIAL | ~40 | #8 setări insert, #248 3-way opt-in, #274 email stub, #331 gate client-side |
| ❓ DE-VERIFICAT | ~6 | #153 test AI acțiune, #293 PDF payload mare, #348/#349 dark mode + axe |

> **Top 5 de reparat imediat** (impact real pe utilizator): #109/#193 (nu poți edita un draft / o cerere cu modificări cerute — bucla changes-requested ruptă), #268/#269 (clopoțelul de notificări rupt — o aplicație de aprobare plăți fără notificări vizibile), #84 (self-approval), #129 (scurgere GDPR pe dosar), #238 (regula 10% greșită pe valute non-MDL). Detalii + backlog: `PAR-QA-FINDINGS.md`, `PAR-QA-BACKLOG.md`.
