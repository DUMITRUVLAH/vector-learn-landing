# PAR @ FinFlow — Backlog de features & fix-uri (din QA-ul celor 300 scenarii)

> Backlog acționabil derivat din `PAR-QA-FINDINGS.md`. Fiecare item: **prioritate**, **efort**,
> **scope**, **criterii de acceptare** și un **test blocant** (care INVOCĂ acțiunea, nu doar randează
> — CLAUDE.md §3.5.1quater). ID namespace `PARQA-xxx`. Nu am modificat `STATE.json`/`BACKLOG.md`
> (regula §3.7 — doar orchestratorul le atinge); orchestratorul poate promova aceste item-uri.
>
> Grupare recomandată în 3 faze/PR-uri (§0.2 „o fază = un PR"):
> **Faza 1 = Blocante+Securitate** (PARQA-001..006) · **Faza 2 = UX & funcții lipsă** (PARQA-007..016) ·
> **Faza 3 = Rapoarte/e-Factura/polish** (PARQA-017..024).

---

## FAZA 1 — Blocante & securitate (prioritate 🔴, de făcut prima)

### PARQA-001 — Editare draft & cerere „changes_requested" din UI  🔴 (fix F-01)
- **Scope:** `ParCreateForm` să accepte un `id` din rută (`/business/par/:id/edit`) și să încarce
  draftul existent în loc să creeze mereu unul nou; `ParDetail` să arate un buton „Editează" pentru
  autor când status ∈ {draft, changes_requested} care navighează la formularul de edit.
- **Accept:** (1) autor deschide un draft → editează câmpuri + linii → salvează → modificările persistă.
  (2) după „Cere modificări", autorul schimbă suma/liniile și retrimite; lanțul DOA se recalculează.
- **Test blocant:** e2e UI — creează draft, navighează away, redeschide din dashboard, schimbă end-use,
  submit → `GET /:id` reflectă noul end-use; + changes_requested → edit linie → resubmit → 200.
- Efort: M. Fișiere: `ParCreateForm.tsx`, `ParDetail.tsx`, `App.tsx` (rută edit).

### PARQA-002 — Repară clopoțelul de notificări in-app  🔴 (fix F-02)
- **Scope:** aliniază contractul. Fie (a) `GET /api/notifications` întoarce forma bogată
  (`{items:[{id,type,title,body,link,isRead}], unreadCount}`) mapând `payload.body`→body,
  `readAt`→isRead, deep-link din `payload.par_id`; fie (b) `NotificationBell` citește forma brută
  (`payload.body`, `kind`, `readAt`). Adaugă ruta lipsă `PATCH /api/notifications/:id/read` SAU
  schimbă `markRead` să folosească `/mark-read`.
- **Accept:** un aprobator rutat vede în clopoțel titlu+corp reale, badge de necitite corect, click →
  deep-link la cerere + marcare citită (fără 404).
- **Test blocant:** e2e — submit cerere → login aprobator → `GET /api/notifications` conține item cu
  body ne-gol + link `/business/par/:id`; `PATCH .../read` → 200; badge scade.
- Efort: S/M. Fișiere: `server/routes/notifications.ts`, `src/lib/api/notifications.ts`,
  `src/components/app/NotificationBell.tsx`. (Afectează tot in-app-ul, nu doar PAR.)

### PARQA-003 — Blochează self-approval pe pași role-based  🔴 (fix F-03)
- **Scope:** în `approveParStep` (și reject/request-changes/bulk), un pas NU „matchează" userul dacă
  `userId === par.requestedByUserId`, chiar dacă are approver/par_admin. Mesaj clar 403
  „nu îți poți aproba propria cerere".
- **Accept:** requestor-approver → self-approve → 403; un ALT approver → 200.
- **Test blocant:** e2e — user {requestor,approver} creează+submit → `POST /:id/approve` de el însuși →
  403; alt approver → 200.
- Efort: S. Fișiere: `parApprovals.ts`, eventual `submit.ts`.

### PARQA-004 — Închide scurgerea GDPR pe dosar  🔴 (fix F-04)
- **Scope:** `GET /:id/dosar` să aplice aceeași regulă de vizibilitate ca `GET /:id`: payee (IBAN/IDNP)
  vizibil doar autorului + rolurilor elevate (approver rutat/finance/par_admin); un requestor terț →
  403 sau dosar cu payee nulat.
- **Accept:** requestor A cere dosarul cererii B → 403 (sau fără payee); finance → dosar complet.
- **Test blocant:** e2e — requestor A `GET /:id-B/dosar` → 403; finance → 200 cu payee.
- Efort: S. Fișier: `par.ts:1301`.

### PARQA-005 — Role gate pe scrierea vendorilor  🔴 (fix F-05)
- **Scope:** `POST /api/par/vendors` și `PATCH /:id` → `requirePARRole("requestor","approver","finance","par_admin")`
  (adică orice rol PAR, dar NU un cont fără rol). Decizie: cine poate EDITA IBAN-ul unui vendor existent
  (recomandat `par_admin`/`finance` pentru PATCH; requestor doar create).
- **Accept:** user fără rol PAR → POST/PATCH vendors → 403; requestor → POST 201; PATCH IBAN de
  requestor pe vendor existent → 403 (dacă alegem restricția).
- **Test blocant:** e2e — cont fără rol PAR → POST vendors → 403; PATCH vendor IBAN → 403.
- Efort: S. Fișier: `parVendors.ts`.

### PARQA-006 — Role gate + protecție cross-user pe șabloane  🔴 (fix F-08)
- **Scope:** `parTemplates` — GET/POST/instantiate cerute cu rol PAR; DELETE doar creatorul sau
  par_admin (nu orice user din tenant); ideal soft-delete.
- **Accept:** user B nu poate șterge șablonul lui A; listarea cere rol PAR.
- **Test blocant:** e2e — user B `DELETE /templates/:id-al-lui-A` → 403.
- Efort: S. Fișier: `parTemplates.ts`.

---

## FAZA 2 — UX & funcții lipsă (prioritate 🟠)

### PARQA-007 — Aplică `approverParRole` din DOA la aprobare  🟠 (fix F-09)
- Adaugă coloană `approver_par_role` pe `par_approvals` (migrare + heal sync-schema §3.5.1ter);
  gate-ul de aprobare verifică rolul cerut. **Test:** pas configurat „finance" → un approver simplu → 403.
- Efort: M (schema + migrare).

### PARQA-008 — Aplică `approvalLimitCents` SAU scoate-l din UI  🟠 (fix F-10)
- Decizie owner: (a) îl aplicăm — un aprobator sub plafon nu poate finaliza un pas peste plafon (cade
  la pasul superior); sau (b) îl ascundem din UI ca să nu dăm fals control. **Test:** aprobator cu
  plafon 5.000 pe cerere 7.000 → nu poate încheia singur.
- Efort: M (dacă aplicăm) / S (dacă scoatem).

### PARQA-009 — Plăți parțiale / în tranșe  🟠 (fix F-11)
- `par_payments` → mai multe rânduri per PAR (sau tabel `par_payment_installments`); `/pay` adaugă o
  tranșă, calculează sold rămas; `paid` doar când suma cumulată ≥ estimat (sau marcaj manual „închis").
  Regula 10% pe suma cumulată. **Test:** 2× `/pay` parțial → sold scade → a doua închide → `paid`.
- Efort: L (schema + logică + UI).

### PARQA-010 — Consistență gate reject / request-changes (delegare + assignment + project scope)  🟠 (fix F-12)
- Aliniază găsitorul de pas din reject și request-changes cu cel din approve: onorează assignment
  explicit, delegare activă, și project scoping. **Test:** delegat respinge/cere-modificări cererea
  delegatorului → 200; approver nedesemnat pe proiect → nu poate respinge.
- Efort: M. Fișier: `parApprovals.ts`.

### PARQA-011 — Recovery din `rejected` (resubmit ca draft)  🟠 (fix F-13)
- Buton „Reia cererea" pe o cerere rejected → creează un draft editabil (via duplicate + link la
  cererea originală) SAU permite tranziția rejected→draft pentru autor. **Test:** rejected → „Reia" →
  draft editabil cu datele copiate.
- Efort: S/M.

### PARQA-012 — Repară drift-ul insert-vs-update la setări  🟠 (fix F-14)
- Branch-ul de insert din `parSettings.ts` PATCH să includă toate câmpurile (`enforceThreeWayMatch`,
  `onboardingComplete`, `pdfHelpUrl`). **Test:** tenant nou → PATCH doar `enforceThreeWayMatch:true` →
  GET arată `true`.
- Efort: S.

### PARQA-013 — Declanșează onboarding pentru tenant nou  🟠 (fix F-15)
- La intrarea în `/business/par`, dacă `!onboardingComplete` și tenantul e gol → redirect la
  `/business/par/onboarding`. **Test:** tenant nou → prima intrare → aterizează pe wizard.
- Efort: S.

### PARQA-014 — 3-way match: default sigur + vizibilitate  🟠 (fix F-16)
- Decizie owner: default ON pentru tenanturi noi, sau un banner clar „control dezactivat" în coada de
  finanțe când e OFF, ca finance să știe că plătește fără PO/recepție. **Test:** OFF → warning vizibil
  în UI la plată.
- Efort: S.

### PARQA-015 — Cablează în UI: edit linie, ștergere șablon, plată din detaliu, user-pickers  🟠 (fix F-17/F-18)
- (a) buton edit-in-place pe linii (`updateLineItem`); (b) buton ștergere șablon; (c) PayModal inline
  pe `ParDetail` pentru finance; (d) user-picker (nu UUID) în secț. 16 și „Add role". **Test:** editezi
  o linie → totalul se recalculează fără delete+re-add.
- Efort: M (mai multe UI-uri mici — pot fi sub-item-uri).

### PARQA-016 — Payee multipli / split payment pe o cerere  🟠 (fix scenariu #135) — OPȚIONAL
- Dacă e nevoie real: permite N beneficiari pe o cerere. Necesită schimbare de model (payee pe linie
  sau tabel `par_payees`). **A se confirma cu owner-ul dacă e cerut** — altfel deprioritizează.
- Efort: L.

---

## FAZA 3 — Multi-valută, rapoarte, e-Factura, polish (prioritate 🟡)

### PARQA-017 — Regula 10% & pragul pe valuta corectă  🟡 (fix F-06)
- `pay`/`applyTenRule` să folosească `totalMdlCents` vs prag MDL (sau să convertească actual în MDL).
  **Test:** cerere EUR cu depășire > 10% (în MDL) → `reapproval_required`.
- Efort: S/M.

### PARQA-018 — FX-fail la submit: blochează SAU marchează, nu sub-ruta  🟡 (fix F-07)
- La eșec FX, fie blocăm submit-ul cu mesaj („rata indisponibilă, reîncearcă"), fie rutăm la banda cea
  mai înaltă (fail-safe sus, nu jos). **Test:** mock FX fail pe 1.000 EUR → NU rutează ca 1.000 MDL.
- Efort: S.

### PARQA-019 — Rapoarte: perioada pe aging/cycle-time + CSV MDL + by-vendor + trend lunar  🟡 (fix F-19)
- (a) aplică from/to pe aging & cycle-time; (b) CSV cu coloană MDL alături de nativă; (c) nou
  `GET /reports/by-vendor`; (d) `GET /reports/monthly` (serie temporală). **Test:** by-vendor sumează
  corect per payee; aging cu from/to întoarce fereastra.
- Efort: M.

### PARQA-020 — e-Factura: previne dubla factură + IDNO exact 13 + TVA configurabil  🟡 (fix F-20)
- (a) export-xml setează `linkedFinInvoiceId` / verifică `already_exported`; (b) regex buyer IDNO =
  exact 13 cifre; (c) TVA: câmp editabil per rând (nu hardcodat 0). **Test:** export apoi submit pe
  același rând → al doilea → 409.
- Efort: M.

### PARQA-021 — Atașamente: validare MIME server-side + delete pt finance + paginare listă  🟡 (fix F-21)
- (a) verifică bytes magic-number, nu prefixul client; (b) finance poate șterge atașamentele pe care
  le-a urcat la stagiul finance; (c) `GET /attachments` întoarce metadata, body la cerere. **Test:**
  upload .exe etichetat pdf → respins; finance șterge propriul proof → 200.
- Efort: M.

### PARQA-022 — `par_audit.diff`: scrie-l sau scoate-l din UI  🟡 (fix F-22)
- La „edited" scrie un diff structurat (before/after) în `par_audit.diff`; sau scoate randarea diff-ului
  din `ParTimeline`. **Test:** editezi un câmp → timeline arată diff real.
- Efort: S/M.

### PARQA-023 — Unifică registrele payee (par_vendors ↔ fin_parties)  🟡 (fix F-23) — evaluare
- Decizie de arhitectură: sync/FK între cele două, sau un adaptor de căutare comun. **A se evalua**
  costul vs beneficiul cu owner-ul. **Test:** payee salvat în PAR apare la căutarea din FinDesk.
- Efort: L.

### PARQA-024 — Recepție înainte de finanțe + polish diverse  🟡 (fix F-minore)
- Permite recepția și pe `approved` (nu doar `in_finance`); + polish: eticheta „Cererile mele",
  ParFolders shell, delegations GET scoping, unificare parsere MT940, gate client-side pe
  finance/reports. Sub-item-uri mici. **Test:** recepție pe cerere approved → 200.
- Efort: M (colecție de mici fix-uri).

---

### PARQA-025 — Role management UX (din cele 100 scenarii pe roluri)  🟠
- **Scope:** (a) **user-picker** după nume/email la „Adaugă rol" în loc de UUID brut (`ParAdmin.tsx:1431`)
  — reutilizează `GET /api/users/tenant-members`; (b) **search** în lista de membri; (c) **atribuire după
  email** (rezolvă email→userId); (d) invitații/atribuiri **în masă** (CSV/multi); (e) **help/tooltip**
  cu ce poate fiecare rol; (f) claritate **par_admin implicit vs explicit** (badge „din rol tenant") +
  guard să nu revoci ultimul admin.
- **Accept:** un admin adaugă rol unui coleg căutându-l după nume (fără să-i știe UUID-ul); nu poate
  rămâne tenant fără niciun admin.
- **Test blocant:** UI e2e — deschide „Adaugă rol", caută după nume, selectează, atribuie → membrul are rolul.
- Efort: M. Sursă: `PAR-100-ROLES-SCENARIOS.md` §D (#22, #30, #31, #77, #78, #82, #83, #87).

## Teste de regresie de adăugat (indiferent de item — locked-in per §3.5.1quater)
Extinde `scripts/e2e-par-100.mjs` (sau un `e2e-par-qa.mjs` nou) cu cele 7 scenarii-acțiune din
`PAR-QA-FINDINGS.md` §„Lacune de testare" — fiecare INVOCĂ endpoint-ul/acțiunea și aserează
status+shape, nu doar că butonul se randează. Acestea prind F-01..F-06 și lacuna de audit.
