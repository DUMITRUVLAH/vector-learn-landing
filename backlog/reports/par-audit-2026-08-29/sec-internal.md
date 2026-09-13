# Audit securitate internă (authz / izolare) — modul PAR, FinFlow
Data: 2026-08-29. Metodă: citirea integrală a `server/routes/par*.ts`, `server/lib/par/*`,
`server/middleware/*`, montările din `server/app.ts`. **[C]** = confirmat în cod, **[P]** = probabil.

## Ce e solid (nu re-audita)
- **Izolarea de tenant e consistentă** — fiecare select/update/delete pe `par_*` are `eq(tenantId, user.tenantId)`.
  Nu s-a găsit IDOR cross-tenant. Excepție cosmetică: `parTemplates.ts:359` (id creat local, neexploatabil).
- Auto-aprobarea e blocată pe approve/reject — `parApprovals.ts:177-179`, `decisionAuthority.ts:119`.
- Sigiliul de integritate (body hash) se verifică la fiecare aprobare — `parApprovals.ts:225-236`.
- Mass assignment: toate rutele folosesc `zValidator` cu `z.object` (strip implicit) sau mapare explicită.
  `status`/`tenantId`/`createdBy`/`approvedAt` nu se acceptă din body.
- DOA, settings, members, invites, projects, departments, config-import sunt închise pe `par_admin`.
- Rapoartele (`parReports.ts:43-71`) folosesc exact același scope ca listarea.
- `par_audit` nu are rută de UPDATE/DELETE.

## HIGH

### 1. [C] Datele bancare ale tuturor beneficiarilor, expuse oricărui cont autentificat
`parSuggestions.ts:26` — doar `requireAuth`, fără rol PAR, fără scope. Query la `:85-114` filtrează
DOAR `tenantId`; răspunsul (`:138-145`) include `payeeName`, `payeeIdnp`, `payeeIban`, `payeeBank`.
**Exploatare:** orice cont din workspace (ex. un „teacher" invitat, zero roluri PAR) face
`GET /api/par/suggestions/line-items?q=a` → IBAN/IDNP-urile beneficiarilor din ultimele 400 de linii,
din toate proiectele și toți plătitorii. Exact suprafața închisă deliberat în `parVendors.ts:107`.
**Fix:** `requirePARRole(...)` pe rută + filtrare pe `accessibleProjectIds`/`accessiblePayerIds`.

### 2. [C] Re-aprobarea depășirii de 10% nu verifică auto-aprobarea
`parApprovals.ts:886-909`. Scope-ul ESTE verificat (`mayAccessProject`/`mayAccessPayer`, l.900), dar
lipsește garda `par.requestedByUserId === user.id` care există la `:177-179`, și nu se cere ca actorul
să fi fost aprobatorul final.
**Exploatare:** solicitantul care are și rol `approver` își re-aprobă singur depășirea → `in_finance` → plata trece.
**Fix:** aceleași gărzi ca `approveParStep` + cerința de aprobator final real + limita DOA pe suma efectiv plătită.

### 3. [C] Delegarea ocolește plafonul de aprobare (DOA ceiling)
`parApprovals.ts:247-258` citește plafonul din rândul `par_members` al CELUI CARE APASĂ
(`role='approver'`); `approvalLimit.ts:37`: lipsa rândului ⇒ `null` ⇒ nelimitat. Autoritatea moștenită
prin delegare (`delegations.ts:83-108`) nu poartă plafonul delegatorului.
**Exploatare:** A (plafon 50.000) deleagă lui B; B nu are rând `approver` ⇒ plafon nelimitat ⇒ semnează 2.000.000.
**Fix:** plafon = `min(actor, toți delegatorii)`; ia în calcul orice rând `par_members`, nu doar `role='approver'`.

### 4. [C] O gaură între benzile DOA degradează orice sumă la o singură semnătură
`lib/par/doa.ts:81-94`: dacă nicio bandă nu se potrivește ⇒ lanț de UN pas, „orice aprobator".
Fallback-ul eșuează în direcția permisivă. Combinat cu #3 ⇒ un singur om semnează plăți de milioane.
**Fix:** fallback = cel mai restrictiv lanț; blochează salvarea unei matrice DOA cu sume neacoperite.

### 5. [C] Impersonarea are drepturi depline de scriere și falsifică atribuirea în audit
`lib/impersonation.ts:88-101` creează o sesiune normală pe utilizatorul-țintă; niciun handler PAR nu
știe că sesiunea e împrumutată. `par_audit` primește `actorUserId = <userul clientului>`
(`parPayments.ts:556-562`, `parApprovals.ts:299-302`) și `signatureName` = numele clientului (`:283`).
**Impact:** non-repudiere ruptă — clientul nu poate demonstra că nu el a aprobat plata.
**Fix:** `impersonatedByUserId` în context la `requireAuth`; mutațiile financiare blocate implicit pe
sesiuni de impersonare; dacă se permit, fiecare rând de audit marcat cu actorul real.

## MEDIUM

6. **[C] `canViewPar` nu verifică scope-ul de proiect/plătitor** (`lib/par/visibility.ts:17-27`).
   `GET /api/par/:id` compensează manual (`par.ts:921-927`), dar NU compensează:
   `/:id/dosar` (`par.ts:1798-1813` — PDF cu IBAN/IDNP), `/:id/timeline` (`parTimeline.ts:50`),
   `/:id/comments` GET+POST (`par.ts:429,456`), `/:id/quotes` (`par.ts:491`),
   `/efactura/requests/:parId` + `/scan` + `/reminder` (`parEfactura.ts:354,358,390,407`).
   **Fix:** mută scope-ul ÎN `canViewPar` — o singură regulă, cum promite comentariul fișierului.
7. **[C] `/:id/purchase-order` și `/:id/receipts` fără scope** — `parPurchaseOrders.ts:55-57,79-82`,
   `parReceipts.ts:39-41,66-72`. Recepția e intrarea în 3-way match ⇒ finanțe din alt scope deblochează plata.
8. **[C] Un `par_admin` restrâns își poate acorda singur acces la tot** — `parProfiles.ts:102-139`
   (`PUT /:id/projects`, `/:id/payers`) validează doar existența în tenant, nu accesul actorului, și nu
   interzice auto-modificarea.
9. **[C] Șabloanele scurg rechizite bancare între scope-uri** — `parTemplates.ts:112-118` (sursă citită
   fără `canViewPar`), `:206-232` (listare tenant-wide cu IBAN/IDNP), `:267-336` (instantiate fără
   `mayAccessProject`, spre deosebire de `POST /api/par`, `par.ts:230-232`).
10. **[C] Istoricul de aprobări se ȘTERGE** — `par.ts:1655` (reopen), `par.ts:1727` (withdraw),
    `submit.ts:211` (re-submit): `DELETE FROM par_approvals`. Semnăturile anterioare dispar definitiv.
    **Fix:** `superseded`, nu DELETE — sau serializare în `par_audit.diff`.
11. **[C] Orice „manager" e aprobator PAR nelimitat, invizibil în DOA** — `requirePARRole.ts:37,74-77`
    + `approvalLimit.ts:35`. Riscul e recunoscut în comentariul din cod; deblocarea cere confirmarea pe
    prod că migrarea 0137 a rulat.
12. **[C] Nicio segregare cere-vs-plătește** — `parPayments.ts:298-300,400-402` verifică doar rolul;
    lipsește `par.requestedByUserId !== user.id` pe care `/approve` o are.
13. **[C] Delegările nu sunt nici controlate, nici auditate** — `parDelegations.ts:76-154`: creare fără
    niciun rol cerut, ștergere fără audit. „Cine avea drept de aprobare pe 14 martie?" nu are răspuns.
14. **[P] Sigiliul devine fals-pozitiv după plată** — `parPayments.ts:571` → `autoLinkVendorOnPayment`
    scrie `vendorId`, care face parte din corpul semnat (`submit.ts:191`) ⇒ `body_hash_valid:false` la
    vizualizările ulterioare ⇒ alarma reală va fi ignorată.
15. **[C] Plata nu re-verifică sigiliul** — `parPayments.ts:391-499` nu apelează `verifyParBodyHash`.
    Momentul în care banii pleacă e singurul care nu confirmă că beneficiarul/suma sunt cele aprobate.

## LOW
- `parBudgetCodes.ts:81` — GET fără rol PAR (scrierea e gardată).
- `parVendors.ts:107` — registrul de beneficiari vizibil oricărui `requestor`, tenant-wide (prin design, de restrâns).
- `par.ts:1694-1698` — orice `par_admin` retrage cererea altcuiva, ștergându-i deciziile, fără scope.
- `par.ts:1490-1499` — `UPDATE par_line_items` fără `parId` în WHERE (sigur azi; apărare în adâncime).
- `parAudit.ts:115-117` — filtrul de scope exclude cererile payer-only din jurnal.
- `parUuidGuard` montat ca `/:id/:action/*` — rutele cu două segmente par neprinse (de aici verificările
  UUID locale din `par.ts:886`, `parPayments.ts:584`). Efect: 500 în loc de 404.
