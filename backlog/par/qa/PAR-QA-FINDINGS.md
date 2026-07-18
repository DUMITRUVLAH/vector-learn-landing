# PAR @ FinFlow — Raport QA: bug-uri & lacune (cu dovezi în cod)

> Rezultatul analizei celor 300+ scenarii din `PAR-300-SCENARIOS.md`, verificate direct în cod.
> Fiecare finding are: **severitate**, **impact pe utilizatorul real**, **dovadă `fișier:linie`**,
> **cauza-rădăcină** și **repro**. Sortat pe severitate. Backlog-ul de reparații: `PAR-QA-BACKLOG.md`.
>
> Baseline teste: cele 38 de teste unitare PAR trec — dar sunt **toate mock/logic-only**, deci NU
> pot prinde bug-urile de integrare de mai jos (exact insight-ul: teste verzi, fluxuri rupte).

---

## 🔴 BLOCANTE (rup un flux principal pe care userul îl folosește zilnic)

### F-01 — Nu poți edita un draft salvat sau o cerere „changes_requested" din UI
- **Impact:** Bucla „Cere modificări → requestorul corectează → retrimite" este **ruptă din front-end**.
  Un aprobator cere o corecție; requestorul **nu are cum s-o facă** — poate doar „Re-trimite" identic.
  La fel, un draft început și salvat nu mai poate fi continuat/editat.
- **Cauză:** `ParCreateForm` apelează **mereu** `createPar()` la mount și nu citește un id din rută
  (`src/pages/par/ParCreateForm.tsx:219`); `ParDetail` nu are buton „Editează" deși docstring-ul îl
  promite (`src/pages/par/ParDetail.tsx:9` vs ActionPanel `:404-456`).
- **Repro:** creezi draft → pleci → dashboard → click pe draft → pagină read-only, fără Edit.
  Sau: aprobator „Cere modificări" → requestor deschide → doar „Re-trimite", fără editare.
- Scenarii: #109, #193, #211, #213, #216.

### F-02 — Clopoțelul de notificări in-app e contract-broken (rândurile apar goale, mark-read 404)
- **Impact:** O aplicație de aprobare plăți **fără notificări vizibile**. Aprobatorul nu vede în
  clopoțel că are ceva de aprobat; badge-ul de necitite e mereu 0; click pe o notificare dă 404.
- **Cauză:** `NotificationBell` citește `res.unreadCount` și `notif.title/type/body/link/isRead`
  (`src/components/app/NotificationBell.tsx:58-61,197-223`), dar `GET /api/notifications` întoarce
  rânduri brute `{items:[{payload:{body,par_id},kind,readAt,createdAt}]}`
  (`server/routes/notifications.ts:36-47`) — **niciunul din câmpurile citite nu există**. În plus
  `markRead(id)` → `PATCH /api/notifications/:id/read`, **rută inexistentă** (există doar `/mark-read`).
  esbuild nu face typecheck, deci s-a livrat tăcut (CLAUDE.md §3.5.1ter).
- **Repro:** login → submit o cerere ca requestor → login ca aprobatorul rutat → clopoțel: item cu
  titlu gol, fără link; click → 404 pe consolă.
- Scenarii: #268, #269, #204, #205, #251, #272, #282. **Afectează TOT in-app-ul, nu doar PAR.**

---

## 🟠 CRITICE (securitate / GDPR / corectitudine financiară)

### F-03 — Self-approval: un requestor care are și rol approver/par_admin își poate aproba propria cerere
- **Impact:** Controlul de segregare a atribuțiilor (SoD) e ocolit. Orice tenant admin/manager
  (par_admin **implicit**) își poate crea și aproba singur o plată.
- **Cauză:** la aprobare, matching-ul de pas nu verifică `userId !== par.requestedByUserId` pe pașii
  role-based (`server/routes/parApprovals.ts:41-43`). „Blocarea" din `submit.ts:160` doar de-asignează
  pasul specific și cade pe rutare role-based, pe care requestor-approver o satisface.
- **Repro:** user cu roluri {requestor, approver} creează o cerere ≤ prag (1 pas role-based) → submit
  → deschide inbox/detaliu → Aprobă → trece. (Testul e2e existent verifică doar requestor FĂRĂ approver.)
- Scenarii: #84, #328.

### F-04 — Scurgere GDPR: `GET /:id/dosar` expune payee (IBAN/IDNP) oricui are un rol PAR
- **Impact:** Datele bancare/personale ale beneficiarilor (IBAN, IDNP) din **orice** cerere pot fi
  descărcate de orice user cu **orice** rol PAR (chiar un requestor, pe cererile altora), deși
  `GET /:id` le nulează.
- **Cauză:** gate slab: `hasAnyRole || author` (`server/routes/par.ts:1310-1313`), fără restricția de
  vizibilitate payee pe care o are `GET /:id` (`par.ts:711`). Dosarul include foaia de aprobare +
  atașamentele (facturi/contracte cu date bancare).
- **Repro:** requestor A → `GET /api/par/<id-cerere-B>/dosar` → PDF cu IBAN/IDNP-ul lui B.
- Scenarii: #129, #324.

### F-05 — Scriere/editare vendori (IDNP+IBAN) fără role gate — risc de fraudă & GDPR
- **Impact:** Orice user autentificat din tenant (inclusiv un cont „teacher" fără rol PAR) poate
  **crea și mai ales EDITA** datele bancare ale beneficiarilor din registru (schimbă IBAN-ul unui
  payee → banii merg în altă parte).
- **Cauză:** `POST /api/par/vendors` (`parVendors.ts:56`) și `PATCH /:id` (`:110`) **nu au
  `requirePARRole`** — doar DELETE are.
- Scenarii: #62, #63, #325.

### F-06 — Regula 10% compară valute diferite pe cererile non-MDL
- **Impact:** Pe o cerere EUR/USD, gate-ul de reaprobare la depășire poate să nu se declanșeze (sau
  să se declanșeze greșit) — o plată cu depășire majoră poate trece fără reaprobare.
- **Cauză:** `pay` compară `par.totalEstimatedCents` (în valuta cererii) cu
  `micro_purchase_threshold_cents` (MDL) și cu `actual_amount_cents`
  (`server/routes/parPayments.ts:432`, `server/lib/par/payment.ts:55`) — folosește
  `totalEstimatedCents`, nu `totalMdlCents`.
- Scenarii: #238, #261.

### F-07 — Rutare DOA sub-nivel la eșec FX
- **Impact:** Dacă conversia FX pică la submit, o cerere de 1.000 EUR e rutată ca 1.000 MDL (~20× prea
  mic) → sare aprobatorii de nivel înalt. Plată mare aprobată de un singur aprobator.
- **Cauză:** fallback „nominal ca MDL" (`server/lib/par/submit.ts:140-144`).
- Scenariu: #88, #262.

### F-08 — Șabloanele: listare/ștergere fără gate; hard-delete cross-user; expun payee în snapshot
- **Impact:** Orice user poate șterge definitiv șablonul altui user și poate lista șabloane care conțin
  IBAN/IDNP în snapshot.
- **Cauză:** `parTemplates.ts` (POST/GET/DELETE/instantiate) doar `requireAuth`; DELETE hard scoped
  doar pe tenant (`:230`).
- Scenarii: #326, #327.

---

## 🟡 IMPORTANTE (funcție lipsă/parțială pe care userul o va cere)

### F-09 — `approverParRole` din DOA nu e aplicat la aprobare
- Un pas configurat „trebuie semnat de FINANCE" e aprobabil de orice approver. Nu există coloană
  `approver_par_role` pe `par_approvals`; rezolvat dar ignorat (`doa.ts:119` vs `parApprovals.ts:181`).
  Scenariu #78.

### F-10 — `approvalLimitCents` (plafon per aprobator) e câmp mort
- Setabil în UI, salvat, dar **niciodată citit/aplicat**. Fals sentiment de control.
  (`parMembers.ts:26` scrie; grep = 0 cititori). Scenarii #29, #89.

### F-11 — Nu există plăți parțiale/în tranșe
- Al doilea `/pay` **suprascrie** primul; fără sold rămas (`parPayments.ts:441`). O factură plătită în
  2 tranșe nu poate fi reprezentată. Scenariu #239.

### F-12 — Gate-uri inconsistente reject / request-changes (delegare, assignment, project scoping)
- Reject nu onorează delegarea; request-changes nu onorează nici delegarea nici assignment-ul explicit;
  project scoping nu e aplicat la reject/request-changes (doar la approve/inbox).
  (`parApprovals.ts:503-509,574`). Scenarii #35, #36, #48.

### F-13 — `rejected` e fundătură fără „resubmit"
- Nicio tranziție din rejected înapoi la editabil; userul se așteaptă la resubmit, primește doar
  duplicate. (`par.ts:123`). Scenariu #203.

### F-14 — Setări: drift insert-vs-update (enforceThreeWayMatch / onboardingComplete / pdfHelpUrl)
- Pe un tenant nou, primul PATCH care setează doar unul din aceste flag-uri creează rândul **fără** el
  (nu e în lista de insert). (`parSettings.ts:76-87`). Scenariu #8.

### F-15 — Onboarding există dar nu e declanșat
- Nimic nu citește `onboardingComplete` ca să redirecteze un tenant nou la wizard; aterizezi pe
  dashboard gol (`App.tsx:210`, flag doar scris). Scenariu #1.

### F-16 — 3-way match e opt-in și default OFF
- Cu `enforceThreeWayMatch` nesetat, `/pay` trece fără PO/recepție, doar warning. „Controlul" nu
  controlează nimic implicit (`parPayments.ts:425`). Scenariu #248.

### F-17 — Editare linie / ștergere șablon / detaliu registru — backend fără UI
- `PATCH /line-items/:lineId` (edit linie), `DELETE /templates/:id`, `GET /registry/companies/:idno`
  — există, fără caller UI. Scenarii #101, #112, #61.

### F-18 — Plata doar din coadă, nu din detaliu; input-uri UUID brute (secț. 16 + add-role)
- „Execută plata" din detaliu doar redirectează; „Received/Assigned By" și „Add role" cer UUID-uri
  fără user-picker. Scenarii #229, #250, #26.

### F-19 — Rapoarte: aging/cycle-time ignoră perioada; CSV valute mixte; lipsă by-vendor & trend lunar
- `parReports.ts:246` (perioada ignorată), `:326` (CSV native vs agregări MDL). Scenarii #300, #264,
  #303, #304.

### F-20 — e-Factura: dublă factură (export+submit), TVA hardcodat 0, regex IDNO 7-13 (nu 13)
- `finStatement.ts:668`, `statementEfactura.ts:88,53`. Scenarii #341, #342, #343.

### F-21 — Atașamente: MIME de încredere din client; finance nu poate șterge ce a urcat; base64 inline
- `parAttachments.ts:160,204,99`. Scenarii #160, #163, #166.

### F-22 — `par_audit.diff` — coloană moartă (UI/teste randează un diff pe care producția nu-l scrie)
- `parTimeline.ts:94` (doar citire). Scenariu #314.

### F-23 — Două registre payee deconectate (par_vendors vs fin_parties) + vocabular kind/payee_type
- Fără FK/sync; ce salvezi într-unul nu apare în celălalt (`finParties.ts`). Scenarii #69, #70.

---

## 🟢 MINORE / POLISH
- Email stub tăcut fără RESEND_API_KEY (#274) — de confirmat pe prod `finflow1`.
- Cantitate integer, fără fracții (#103). · obtain_quotations aproape gol poate fi depus (#117).
- Pagini finance/reports doar API-gated, se randează pt orice rol (#331). · „Cererile mele" mislabel (#224).
- ParFolders shell divergent (#351). · Delegations GET full-tenant scan (#39/perf). · două parsere MT940 (#344).
- Audit imutabil prin convenție, nu constrângere DB (#318). · MT940 amount grouped-number bug.
- Timeline actor-name încarcă tot tabelul users (#6-perf).

---

## Lacune de testare (de ce n-au fost prinse)
Testele existente sunt **mock/logic-only** — testează o copie a logicii pe date fabricate, nu ruta+DB
reală, și nu execută acțiunea din perspectiva userului. Cele mai valoroase teste de adăugat (§3.5.1quater
„testează ACȚIUNEA, nu affordance-ul"):
1. e2e: submit ca requestor → aprobatorul rutat **vede** notificarea în clopoțel + click deep-link (prinde F-02).
2. e2e: requestor-approver încearcă self-approval → **trebuie 403** (prinde F-03).
3. e2e: requestor A cere dosarul cererii B → **trebuie 403/payee nulat** (prinde F-04).
4. e2e: user fără rol PAR face POST/PATCH vendors → **trebuie 403** (prinde F-05).
5. e2e: plată EUR cu depășire > 10% → reaprobare corectă (prinde F-06).
6. e2e UI: după „Cere modificări", requestorul editează un câmp și retrimite (prinde F-01).
7. e2e: `/api/par/audit` + `/audit/emails` reale, cu gate + paginare (prinde lacuna #319).
