# PAR @ FinFlow — 100 scenarii de testare pe ROLURI (pas cu pas)

> Focus dedicat, cerut de owner: **cum se adaugă rolurile, cine primește ce rol, ce vede fiecare rol,
> și cât de ușor e să le adaugi** — tot fluxul, pas cu pas. Complementar cu `PAR-300-SCENARIOS.md`.
> Verdicte verificate în cod (`fișier:linie`). Legenda: ✅ merge · ⚠️ bug · 🔒 doar-backend ·
> ❌ lipsește · 🟡 parțial · ❓ de-verificat.

## Modelul de roluri (recap din cod)

- **4 roluri PAR** (`parRoleEnum`, `requirePARRole.ts:13`): `requestor`, `approver`, `finance`, `par_admin`.
  Atenție la ortografie: **`requestor`** (nu „requester"). **NU există rol `viewer`** — citirile sunt
  deschise oricărui user autentificat din tenant.
- **par_admin implicit:** tenant roles `admin`/`manager` (`users.role`) primesc par_admin FĂRĂ rând în
  `par_members` (`requirePARRole.ts:23-30`) — rezolvă bootstrap-ul (primul admin poate împărți roluri).
- Un user poate avea **mai multe roluri simultan** (`par_members`, câte un rând per rol).
- Rolul PAR e **decuplat** de rolul de tenant: invitatul primește tenant role `"teacher"` + rândul
  `par_members` cu rolul din invitație (`auth.ts:560,576`).

---

## A. Cum se adaugă un rol — fluxul de invitație (1–20)

1. **[Dan/admin]** Deschid Administrare → Membri → secțiunea Invitații → **✅ MERGE** (`ParAdmin.tsx` InviteSection).
2. **[Dan]** Completez email + aleg rolul (requestor/approver/finance/par_admin) → „Trimite invitație" → **✅ MERGE** (`POST /api/par/invites`).
3. **[Dan]** Primesc înapoi un link de invitație copiabil → **✅ MERGE** (`inviteUrl` = `#/business/invite?token=`).
4. **[Dan]** Dacă RESEND e configurat, invitatul primește și email → **🟡 PARȚIAL** — `emailed:true/false`; fără key, doar link (owner trebuie să știe să-l copieze).
5. **[Invitat]** Deschid link-ul → văd cine mă invită, în ce organizație, cu ce rol → **✅ MERGE** (`GET /api/auth/invite-info` → `{email, parRole, orgName}`).
6. **[Invitat]** Îmi pun numele + parola și accept → cont creat + rol atribuit + sesiune → **✅ MERGE** (`POST /api/auth/accept-invite`).
7. **[Invitat]** După accept, aterizez direct în shell-ul FinFlow corect (nu în CRM) → **✅ MERGE** (accept flipează `appKind="business"`).
8. **[Invitat existent]** Am deja cont în tenant → invitația e refuzată „already_member" → **✅ MERGE** (409, `parInvites.ts:50`).
9. **[Dan]** Re-invit același email → invitația veche e ștearsă, nu se acumulează → **✅ MERGE**.
10. **[Dan]** Văd lista invitațiilor în așteptare (neacceptate, neexpirate) → **✅ MERGE** (`GET /api/par/invites`).
11. **[Dan]** Revoc o invitație trimisă greșit → **✅ MERGE** (`DELETE /api/par/invites/:id`).
12. **[Invitat]** Folosesc un link expirat (>7 zile) → refuzat → **✅ MERGE** (TTL 7 zile, `invites.ts:7`).
13. **[Invitat]** Folosesc un token deja consumat → „deja folosit", fără dublu cont → **✅ MERGE** (consum atomic în tranzacție).
14. **[Atacator]** Cer în body-ul accept-invite rolul `par_admin` deși invitația era `requestor` → rolul din body e ignorat → **✅ MERGE** (rol luat DOAR din invitație, `auth.ts:451-460`).
15. **[Invitat cu Google]** Contul e Google-only → sunt îndrumat spre login Google, nu parolă → **✅ MERGE** (`auth.ts:509-517`).
16. **[Dan]** Invit cu un rol invalid (typo „aprover") → respins de enum → **✅ MERGE** (zod enum).
17. **[Dan]** Invit un email cu format invalid → respins → **❓ DE-VERIFICAT** (validare email pe invite — de confirmat).
18. **[Invitat]** Token-ul e stocat doar ca sha256, plaintext doar în URL → **✅ MERGE** (`invites.ts:15`, securitate).
19. **[Dan]** Trimit 5 invitații deodată (batch) → **❌ LIPSEȘTE** — invitații una câte una; fără bulk-invite/CSV.
20. **[Dan]** Setez la invitație și un plafon de aprobare (approvalLimitCents) → **🟡 PARȚIAL** — se poate la member assign, dar câmpul e mort (nu se aplică, F-10); la invitație nici nu e expus.

## B. Cum se adaugă un rol — atribuire directă & auto-atribuire (21–40)

21. **[Dan]** Adaug un rol unui membru EXISTENT din tab-ul Membri (fără invitație) → **🟡 PARȚIAL** — merge (`POST /api/par/members`), DAR formularul cere „User ID (UUID)" brut (`ParAdmin.tsx:1431`).
22. **[Dan]** Nu știu UUID-ul colegului ca să-i dau rol → **⚠️ BUG (UX)** — nu există user-picker/căutare după nume/email; „un UUID pe care nimeni nu-l știe" (comentat chiar în cod, `:1230`).
23. **[Irina]** Îmi auto-atribui un rol din panoul „Rolurile mele" fără UUID → **✅ MERGE** (`MyRolesPanel`, workaround pt #22, `assignParMember({userId: me.userId})`).
24. **[Dan]** Atribui același rol de două ori aceluiași user → idempotent, nu se dublează → **✅ MERGE** (`parMembers.ts` idempotent pe (user,role)).
25. **[Dan]** Atribui unui user 2 roluri (requestor + approver) → ambele active → **✅ MERGE** (rânduri separate).
26. **[Dan]** Revoc un rol de la un membru → **✅ MERGE** (`DELETE /api/par/members/:id`).
27. **[Dan]** Văd lista completă de membri cu nume + email + rol + plafon → **✅ MERGE** (`GET /api/par/members`).
28. **[Elena]** Fără niciun rol, încerc să-mi atribui singură par_admin via API → 403 → **✅ MERGE** (`assignParMember` e gate-uit par_admin).
29. **[Owner]** Primul admin pe tenant gol își poate atribui roluri deși nu are `par_members` → **✅ MERGE** (par_admin implicit bootstrap).
30. **[Dan]** Atribui rol pe baza email-ului în loc de UUID → **❌ LIPSEȘTE** — endpoint-ul cere `userId`, nu email; fără rezolvare email→user în UI.
31. **[Dan]** Caut un membru după nume ca să-i schimb rolul → **❌ LIPSEȘTE** — fără search în tab-ul Membri.
32. **[Dan]** Schimb rolul unui membru din requestor în approver → **🟡 PARȚIAL** — practic revoc requestor + adaug approver (2 pași); nu există „edit rol" într-un pas.
33. **[Dan]** Un user cu rol de tenant `manager` apare automat ca par_admin în listă → **✅ MERGE** (sintetizat în `getUserPARRoles`, `:104`).
34. **[Dan]** Revoc rolul par_admin al unui `manager` de tenant → **⚠️ BUG/limitare** — nu am ce revoca (nu există rând `par_members`); ar rămâne par_admin implicit indiferent. Nu poți „coborî" un manager de tenant din par_admin fără să-i schimbi rolul de tenant.
35. **[Dan]** Atribui rol unui user din alt tenant (UUID greșit) → respins / neatins → **✅ MERGE** (scope tenant).
36. **[Dan]** După ce atribui un rol, membrul îl vede imediat (fără re-login)? → **❓ DE-VERIFICAT** — `getParMe`/`useParRoles` se reîncarcă la navigare; de confirmat că nu cere re-login.
37. **[Dan]** Plafonul de aprobare per membru e editabil → **🟡 PARȚIAL** — setabil dar mort (F-10).
38. **[Dan]** Revoc ultimul par_admin din tenant → rămân blocat fără admin? → **🟡 PARȚIAL** — par_admin implicit (tenant admin/manager) salvează situația; dar dacă toți sunt doar `par_members` par_admin și revoc ultimul, ai putea rămâne fără admin (de verificat guard).
39. **[Dan]** Adaug rol cu UUID malformat → 400/404, nu 500 → **❓ DE-VERIFICAT** (validare UUID pe member assign).
40. **[Dan]** Membru revocat mai are sesiune activă → acțiunile lui sunt refuzate la următorul apel → **✅ MERGE** (gate re-verifică `par_members` la fiecare request).

## C. Ce VEDE fiecare rol — vizibilitate & navigație (41–75)

41. **[Elena/fără rol]** Fără niciun rol PAR, modulul e complet invizibil (nici meniu, nici URL) → **✅ MERGE** (VM1-01, `ParGuardPage` blochează tot, `:26`).
42. **[Elena]** Accesez direct `/business/par` prin URL fără rol → blocat/redirect → **✅ MERGE** (guard pe rută).
43. **[Elena]** Grupul „PAR" din meniul principal nu apare fără rol → **✅ MERGE** (`hasPar` gating, `BusinessShell:349`).
44. **[Cristina/requestor]** Văd în nav: „Cereri de plată" → **✅ MERGE** (item ne-gate-uit, orice rol).
45. **[Cristina]** NU văd „Inbox aprobare" în nav (doar approver/par_admin) → **✅ MERGE** (`roles: [approver, par_admin]`).
46. **[Cristina]** NU văd „Coadă finanțe" (doar finance/par_admin) → **✅ MERGE**.
47. **[Cristina]** NU văd „Administrare PAR" (doar par_admin) → **✅ MERGE**.
48. **[Cristina]** Văd „Foldere proiecte" și „Rapoarte"? → **⚠️ BUG (nav vs acces)** — nav-ul le arată doar pt approver/finance/par_admin, dar dacă requestorul le accesează direct prin URL, pagina se randează (doar `ParGuardPage`), se bazează pe API 403 (F-scenariu #331/#305).
49. **[Cristina/requestor]** Pe `GET /api/par` văd DOAR cererile mele, nu ale altora → **✅ MERGE** (`par.ts:549` requestor fără rol elevat).
50. **[Ana/approver]** Pe `GET /api/par` văd TOATE cererile din tenant → **✅ MERGE** (rol elevat).
51. **[Mihai/finance]** Pe `GET /api/par` văd toate cererile → **✅ MERGE**.
52. **[Cristina]** Văd payee-ul (IBAN/IDNP) pe cererile ALTORA? → **✅ MERGE (nulat)** pe `GET /:id` — dar ⚠️ scurs pe `/:id/dosar` (F-04).
53. **[Ana/approver]** Văd payee-ul pe cererile rutate mie → **✅ MERGE** (rol elevat vede payee).
54. **[Cristina]** Deschid „Inbox aprobare" prin URL ca requestor → nu am cereri de aprobat → **✅ MERGE** (inbox gol pt non-approver).
55. **[Ana]** Inbox-ul îmi arată DOAR cererile unde sunt pasul activ → **✅ MERGE** (`GET /api/par/inbox`).
56. **[Ana]** Badge-ul de inbox arată numărul corect de cereri de aprobat → **✅ MERGE** (count 60s).
57. **[Mihai]** Coada de finanțe îmi arată doar execute_payment aprobate → **✅ MERGE** (`GET /api/par/finance`, gate finance/admin).
58. **[Cristina]** Cer `GET /api/par/finance` ca requestor → 403 → **✅ MERGE**.
59. **[Cristina]** Cer un raport (`/reports/by-budget`) ca requestor → 403 → **✅ MERGE** (`requirePARRole` approver/finance/admin).
60. **[Ana/approver]** Pot vedea rapoartele → **✅ MERGE**.
61. **[Ana]** Pot vedea matricea DOA (read) → **✅ MERGE** (`GET /api/par/doa` permite approver/finance).
62. **[Ana]** NU pot edita matricea DOA → **✅ MERGE** (POST/PATCH/DELETE = par_admin).
63. **[Cristina]** Văd listele de config (departamente/proiecte/coduri/vendori/evenimente) → **✅ MERGE** (GET-uri deschise oricărui rol autentificat).
64. **[Elena/fără rol]** Cer `GET /api/par/departments` → **❓ DE-VERIFICAT** — GET-urile de config sunt „any authed"; un user din tenant fără rol PAR ar putea citi listele (dar modulul e ascuns în UI). Inconsistență minoră.
65. **[Cristina]** Văd timeline-ul cererii MELE → **✅ MERGE** (`parTimeline.ts:46`).
66. **[Cristina]** NU văd timeline-ul cererii altui requestor → **✅ MERGE** (requestor doar propriile).
67. **[Ana]** Văd timeline-ul oricărei cereri → **✅ MERGE** (rol elevat).
68. **[Dan/par_admin]** Văd log-ul GLOBAL de audit → **✅ MERGE** (`GET /api/par/audit`, par_admin only).
69. **[Ana/approver]** Cer log-ul global de audit → 403 → **✅ MERGE** (par_admin only).
70. **[Dan]** Văd log-ul de livrare email PAR → **✅ MERGE** (`GET /api/par/audit/emails`).
71. **[Cristina]** Văd butoanele de acțiune corecte pe detaliu (requestor: submit/anulează; NU approve) → **✅ MERGE** (ActionPanel role-aware) — dar vezi F-01 (lipsă Edit).
72. **[Ana]** Pe detaliu văd Aprobă/Respinge/Cere modificări doar dacă sunt pasul activ → **✅ MERGE** (`myActiveStep`).
73. **[Mihai]** Pe detaliu văd „Recepționează la finanțe" / panel 3-way / recepție → **✅ MERGE** (finance + in_finance).
74. **[Cristina]** Clopoțelul de notificări îmi arată ce mă așteaptă → **⚠️ BUG (CRITIC)** — clopoțelul e rupt (F-02) pt toate rolurile.
75. **[Dan/par_admin]** Văd toate cele 5 tab-uri admin (DOA/Setări/Membri/Date referință/Audit) → **✅ MERGE** (`ParAdmin.tsx:125`); non-admin → panou 403 (`:2718`).

## D. Ușurința de a adăuga/gestiona roluri — UX & fricțiune (76–90)

76. **[Dan]** Fluxul „invită pe email" e ușor și clar (fără UUID) → **✅ MERGE** — calea recomandată.
77. **[Dan]** Fluxul „adaugă rol unui membru existent" cere UUID brut → **⚠️ BUG (UX)** — fricțiune majoră (#22); ar trebui user-picker după nume/email.
78. **[Dan]** Nu văd nicăieri UUID-ul unui coleg ca să-l copiez → **⚠️ BUG (UX)** — lista de membri arată nume/email/rol dar UUID-ul nu e ușor de copiat pt formularul de add-role.
79. **[Irina]** „Rolurile mele" e ușor de folosit pt auto-atribuire → **✅ MERGE** (dar e workaround pt lipsa pickerului).
80. **[Dan]** Mesajele de eroare la atribuire rol sunt clare (approver_not_a_member etc.) → **✅ MERGE** (pe DOA pin; pe member assign — de verificat).
81. **[Dan]** Când pinuiesc un user pe un pas DOA care nu e membru → eroare clară → **✅ MERGE** („approver_not_a_member", `parDoa.ts:24-38`).
82. **[Dan]** Văd ce înseamnă fiecare rol (help/tooltip) în UI → **❓ DE-VERIFICAT / probabil LIPSEȘTE** — nu am găsit un legend/help despre ce poate fiecare rol; owner-ul învață prin încercare.
83. **[Dan]** Pot atribui roluri în masă mai multor useri → **❌ LIPSEȘTE** — doar unul câte unul.
84. **[Dan]** Onboarding-ul mă ghidează să-mi invit echipa → **🟡 PARȚIAL** — pasul 3 „team summary" există, dar onboarding-ul nu e nici măcar declanșat automat (F-15).
85. **[Dan]** După ce dau un rol, e vizibil imediat în lista de membri → **✅ MERGE** (reload listă).
86. **[Dan]** Confirmarea la revocare rol (nu revoc din greșeală) → **❓ DE-VERIFICAT** — de confirmat dacă e dialog de confirmare.
87. **[Dan]** Diferența dintre par_admin explicit și implicit e vizibilă în UI → **❌ LIPSEȘTE/confuz** — un `manager` de tenant apare ca admin dar nu poate fi „revocat" din Membri (#34); UI nu explică de ce.
88. **[Dan]** Delegarea (X→Y) e ușor de configurat cu interval de date → **✅ MERGE** (DelegationSection).
89. **[Dan]** Văd clar cine e delegat pe cine și pe ce perioadă → **✅ MERGE** (`GET /api/par/delegations` all pt admin).
90. **[Dan]** Delegarea e un „rol temporar" intuitiv → **🟡 PARȚIAL** — funcțional, dar reject/request-changes NU onorează delegarea (F-12), deci delegatul are putere incompletă.

## E. Tranziții de rol & cazuri limită (91–100)

91. **[Cristina + approver]** Sunt requestor ȘI approver → îmi pot aproba propria cerere → **⚠️ BUG (SECURITATE)** — self-approval (F-03).
92. **[Dan]** Un user cu rol finance poate și crea cereri (nu are requestor)? → **✅ MERGE** — `POST /api/par` e deschis oricărui user autentificat din tenant (devine requestor de facto).
93. **[Mihai/finance]** Pot aproba o cerere (nu am approver)? → **✅ MERGE (refuzat)** — 403 dacă nu sunt assignat/approver.
94. **[Dan/par_admin]** Ca admin pot face tot (create/approve/finance/config) → **✅ MERGE** (par_admin = superset).
95. **[Ana]** Delegatul meu (Victor) capătă temporar puterea de a-mi aproba pașii → **✅ MERGE** (aprobare); ⚠️ dar nu reject/changes (F-12).
96. **[Dan]** Revoc rolul cuiva mid-flow (are o cerere pe pasul lui) → următoarea acțiune e refuzată → **✅ MERGE** (gate live) — dar cererea poate rămâne blocată pe pasul lui până reasignez DOA.
97. **[Dan]** Un requestor pe care îl fac approver își vede brusc inbox-ul populat → **✅ MERGE** (nav + inbox apar la reîncărcarea rolurilor).
98. **[Elena]** Devin membru nou → până nu primesc un rol, nu văd nimic → **✅ MERGE** (VM1-01).
99. **[Dan]** Un cont invitat are tenant role „teacher" — apare ciudat în vreun UI de tenant → **🟡 PARȚIAL** — cosmetic (F-scenariu #40), accesul PAR e corect.
100. **[Owner]** Pe un tenant care NU e appKind „business", login-ul de business e refuzat → **✅ MERGE** (`businessAuth.ts:72` cere appKind business; invite-accept îl flipează).

---

## Concluzii pe roluri

**Merge bine (~75/100):** cele 4 roluri + par_admin implicit, fluxul de invitație (securizat, token hash,
consum atomic, rol legat de invitație), gating-ul de navigație și vizibilitatea cererilor/payee/rapoarte
per rol, delegarea pe interval.

**De reparat (legat de findings-urile din `PAR-QA-FINDINGS.md`):**
- **⚠️ UX critic:** adăugarea unui rol unui membru existent cere **UUID brut** — fără user-picker după
  nume/email (#22, #77, #78). Cea mai frecventă operație admin e cea mai grea. → **PARQA-015** (user-picker).
- **⚠️ Securitate:** self-approval pt requestor-approver (#91) → **PARQA-003**.
- **⚠️ GDPR:** dosar + vendori expuși pe roluri largi (#52, F-04/F-05) → **PARQA-004/005**.
- **⚠️ Notificări:** clopoțelul rupt pt toate rolurile (#74) → **PARQA-002**.
- **⚠️ Delegare incompletă:** reject/request-changes nu o onorează (#90, #95) → **PARQA-010**.
- **❌ Lipsă:** invitații/atribuiri în masă (#19, #83), atribuire după email (#30), search membri (#31),
  help despre ce poate fiecare rol (#82), claritate par_admin implicit vs explicit (#34, #87).
  → propuse ca **PARQA-025 (Role management UX)** în backlog.
