# Audit de performanță BACKEND — modulul PAR (FinFlow)

Repo: `/Users/dima/vector-learn-landing` · branch `feat/platform-impersonation` · 2026-08-29
Stack: Hono + Drizzle · prod = Supabase Postgres prin pooler (`max: 3`, `prepare:false`), local = PGlite in-process.

## Ipoteza de cost folosită peste tot

Pe prod, fiecare `await db…` = un dus-întors de rețea către pooler-ul Supabase. Măsurătorile din
`server/db/client.ts:52-56` spun că răspunsurile reușite vin „sub 3 s" și că avaria e binară — deci
nu avem un număr publicat pe interogare. Folosesc **20 ms/dus-întors** ca ipoteză conservatoare
(pooler în altă regiune ⇒ 30-60 ms; aceeași regiune ⇒ 3-8 ms). Toate estimările de mai jos sunt
liniare în acest număr, deci se rescalează trivial.

**De ce nimic din asta nu se vede local:** PGlite rulează în proces (`server/db/client.ts:84-90`),
un query costă ~0.1 ms. Un handler cu 30 de interogări secvențiale e 3 ms local și 600 ms pe prod.
Toate problemele „N+1 / secvențial" din raport sunt invizibile în dezvoltare **prin construcție**.

**Amplificatorul:** `max: 3` conexiuni per instanță (`client.ts:73`). Când o pagină trage 8-10
cereri în paralel (ParDashboard, ParReports — verificat mai jos), cele ~150 de interogări rezultate
se serializează prin 3 conexiuni. Costul per cerere se înmulțește cu factorul de coadă.

---

## 1. GET /api/par/:id trimite corpurile base64 ale atașamentelor (până la zeci de MB)

**Unde:** `server/routes/par.ts:942-945` (`db.select().from(parAttachments)` = `SELECT *`),
returnat neatins la `server/routes/par.ts:1076` (`attachments,`).
Aceeași problemă: `server/routes/parAttachments.ts:209-222` (`fileUrl` inclus explicit în listă).

**De ce e lentă:** `par_attachments.file_url` e `text` și conține un data-URL base64
(`server/db/schema/par.ts:621-623` — comentariul o spune explicit: „base64 data URLs (megabytes)").
Limitele: 10 fișiere per cerere (`parAttachments.ts:146`), fiecare până la **15.000.000 de
caractere** (`parAttachments.ts:143`). Deci răspunsul teoretic maxim al lui `GET /api/par/:id` e
**~134 MB**; realist, 3-5 documente scanate ⇒ **5-20 MB**, la FIECARE deschidere a paginii de
detaliu.

**Impact:**
- transfer: 5-20 MB per deschidere de cerere (× fiecare aprobator, × fiecare reîncărcare);
- serializare JSON a 20 MB de string-uri în funcția serverless: sute de ms de CPU + presiune de
  memorie;
- **risc de eroare, nu doar de viteză**: răspunsul unei funcții Vercel are plafon (~4.5 MB); o
  cerere cu 2-3 scanuri mari nu întoarce lent, ci **cade**.

**Dovada că datele nu sunt necesare:** `src/pages/par/ParDetail.tsx:1078` folosește `att.fileUrl`
doar în `onClick` (`openParAttachment`), iar pentru previzualizare există deja o rută dedicată,
`GET /api/par/:parId/attachments/:attId/preview` (`parAttachments.ts:319`), folosită de
`ParInbox.tsx:852`.

**Fix (mic, mecanic):**

```ts
// par.ts — nu mai selecta corpul fișierului
const attachments = await db
  .select({
    id: parAttachments.id, fileName: parAttachments.fileName,
    kind: parAttachments.kind, kindOther: parAttachments.kindOther,
    uploadedBy: parAttachments.uploadedBy, createdAt: parAttachments.createdAt,
    analysis: parAttachments.analysis,
    sizeChars: sql<number>`length(${parAttachments.fileUrl})`, // opțional, pentru UI
  })
  .from(parAttachments)
  .where(and(eq(parAttachments.parId, parId), eq(parAttachments.tenantId, tenantId)));
```

Frontend: `openParAttachment(...)` deschide `/api/par/${parId}/attachments/${att.id}/preview`
(ruta există deja). Același tratament pentru `GET /:parId/attachments` — cine chiar vrea corpul îl
cere pe `/preview`.

**Câștig estimat:** 5-20 MB → ~5 KB per deschidere de cerere (**~1000×** pe payload), plus dispare
clasa de eșec „payload too large".

---

## 2. `backfillStuckApprovalChains` — N+1 pe calea fiecărei deschideri de inbox

**Unde:** `server/lib/par/doa.ts:131-158`, apelat necondiționat la
`server/routes/parApprovals.ts:407-413` pentru orice aprobator.

```ts
const candidates = await db.select({id}).from(parRequests)
  .where(and(tenantId, status = 'pending_approval'));          // 1 interogare
for (const par of candidates) {
  const steps = await db.select({step}).from(parApprovals)     // ← 1 interogare PER CERERE
    .where(and(parId, tenantId));
  if (steps.some(s => s.step >= 1)) continue;                  // în 99.9% din cazuri: no-op
  await db.insert(parApprovals).values({...});
}
```

**De ce e lentă:** `1 + N` interogări **secvențiale**, unde N = toate cererile în
`pending_approval` din workspace. Nu e plafonat, nu e memoizat, rulează la fiecare `GET /inbox`.
Iar în practică nu vindecă nimic — e o plasă pentru un bug istoric.

**Impact:** N=50 ⇒ +51 dus-întorsuri ⇒ **~1.0 s**; N=200 ⇒ **~4.0 s**; N=500 ⇒ **~10 s**, adică
peste jumătate din plafonul de 20 s al lui `getTimeout` (`server/middleware/getTimeout.ts:22`).
E cel mai probabil vinovat pentru „inboxul se încarcă greu" pe un workspace real.

**Fix — o singură interogare, plafonată:**

```ts
export async function backfillStuckApprovalChains(tenantId: string): Promise<number> {
  const stuck = await db
    .select({ id: parRequests.id })
    .from(parRequests)
    .where(and(
      eq(parRequests.tenantId, tenantId),
      eq(parRequests.status, "pending_approval"),
      sql`NOT EXISTS (SELECT 1 FROM ${parApprovals} a
                      WHERE a.par_id = ${parRequests.id} AND a.step >= 1)`,
    ))
    .limit(200);
  if (!stuck.length) return 0;
  await db.insert(parApprovals).values(stuck.map(({ id }) => ({
    tenantId, parId: id, step: 1, approverUserId: null,
    approverRoleLabel: "Aprobator", decision: "pending" as const, locked: false,
  })));
  return stuck.length;
}
```

`1 + N` → **2 interogări**, indiferent de N. (Bonus: mută apelul pe `void` — vindecarea nu are de
ce să întârzie randarea inboxului.)

---

## 3. GET /api/par/finance — coada de finanțe trage și dovezile de plată base64

**Unde:** `server/routes/parPayments.ts:196-199`

```ts
const pmts = await db.select().from(parPayments)   // SELECT * → include proof_url
  .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, parIds)));
```

`par_payments.proof_url` e `text` și, conform propriului comentariu din schemă
(`server/db/schema/par.ts:661`), „may hold a base64 proof image". Rândul întreg ajunge în răspuns
la `parPayments.ts:272` (`payment: paymentsMap[p.id] ?? null`). Ironia: comentariul de la
`parPayments.ts:257` explică de ce atașamentele au fost reduse la metadate — dar dovada plății a
rămas întreagă.

**Plus, în același handler:**
- `parPayments.ts:175-184`: `db.select().from(parRequests)` **fără `limit`** — toată coada
  `approved | in_finance | reapproval_required` a workspace-ului;
- filtrarea de arie se face **în JS** (`:188-190`) după ce s-a adus tot, deci baza nu poate folosi
  indexul pe `payer_id`/`project_id`;
- ajutoarele de „join" sunt liniare per rând ⇒ pătratice pe total:
  `approversFor` (`:228`), `approverDecisionsFor` (`:237`), `attachmentsFor` (`:264`),
  `budgetLabel` (`:251`), `userName` (`:227`), `projName` (`:226`).
  Cu Q cereri și A rânduri de aprobare: `approversFor` singur face `Q × A ≈ Q² × pași`.
  Q=300, 3 pași ⇒ ~270.000 de comparații + 300 de `.sort()`. Nu e catastrofal, dar e gratuit de
  eliminat.

**Impact:** payload de ordinul MB-ilor (dovezile de plată), plus timp de răspuns care crește
liniar cu vechimea cozii, nu cu ce se vede pe ecran.

**Fix:**

```ts
const pmts = await db.select({
  id: parPayments.id, parId: parPayments.parId, parBl: parPayments.parBl,
  receivedAt: parPayments.receivedAt, receivedByUserId: parPayments.receivedByUserId,
  assignedToUserId: parPayments.assignedToUserId,
  actualAmountCents: parPayments.actualAmountCents,
  paymentDate: parPayments.paymentDate, paymentRef: parPayments.paymentRef,
  hasProof: sql<boolean>`(${parPayments.proofUrl} IS NOT NULL AND ${parPayments.proofUrl} <> '')`,
  overageReapproved: parPayments.overageReapproved,
}).from(parPayments).where(...);
```

(Exact tiparul deja folosit corect la `server/routes/par.ts:833`.)

Filtrarea de arie coboară în SQL:

```ts
const [projectScope, payerScope] = await Promise.all([...]);
const conds = [eq(parRequests.tenantId, tenantId), eq(parRequests.purpose, "execute_payment"),
               inArray(parRequests.status, ["approved","in_finance","reapproval_required"])];
if (projectScope !== null || payerScope !== null) {
  conds.push(or(
    ...(projectScope?.length ? [inArray(parRequests.projectId, projectScope)] : []),
    ...(payerScope?.length ? [and(isNull(parRequests.projectId), inArray(parRequests.payerId, payerScope))] : []),
  )!);
}
const queue = await db.select().from(parRequests).where(and(...conds))
  .orderBy(desc(parRequests.approvedAt)).limit(limit).offset(offset);
```

Iar cele 6 ajutoare devin `Map`-uri construite o singură dată (O(N) în loc de O(N²)):

```ts
const approvalsByPar = new Map<string, typeof approvalRows>();
for (const a of approvalRows) (approvalsByPar.get(a.parId) ?? approvalsByPar.set(a.parId, []).get(a.parId)!).push(a);
const userNameById = new Map(userRows.map(u => [u.id, u.name]));
```

---

## 4. Taxa de autorizare + arie plătită de FIECARE cerere `/api/par/*`

**Unde:** `server/app.ts:276-279` (middleware global) + helperele de arie.

Pentru un utilizator care **nu** e `admin`/`manager` de workspace, o singură cerere
`GET /api/par/:id` execută:

| pas | fișier:linie | interogări | dus-întorsuri |
|---|---|---|---|
| `requireAuth` | `middleware/requireAuth.ts:11` | 0 (cache 30 s, `auth/session.ts:79-83`) | 0 |
| `requireModuleEntitlement` — platformAdmins | `requireModuleEntitlement.ts:14` | 1 | 1 |
| — `isModuleEnabledForTenant` | `lib/platformModules.ts:120` | 1 | 1 |
| — lookup `parRequests.payerId` (calea `/:uuid`) | `requireModuleEntitlement.ts:22-27` | 1 | 1 |
| — `parPayerModules` | `requireModuleEntitlement.ts:32` | 1 | 1 |
| `getUserPARRoles` | `requirePARRole.ts:105` + `:121` (rolul de tenant) | 2 | 2 |
| `mayAccessProject`/`mayAccessPayer` | `lib/par/projectScope.ts:29`/`:52` | 3-5 | 2-3 |
| `hasPayerModuleEntitlement` | `requireModuleEntitlement.ts:41-51` | 2 | 2 |

**≈ 11-13 interogări, ≈ 10-11 dus-întorsuri secvențiale ⇒ ~200-220 ms** înainte ca handler-ul să
citească măcar un rând util.

Trei defecte concrete:

**(a) Muncă dublă structurală.** `accessiblePayerIds` (`projectScope.ts:35-51`) apelează
`accessibleProjectIds` în interior. Deci `Promise.all([accessibleProjectIds(...), accessiblePayerIds(...)])`
— tiparul din `par.ts:697-700`, `parApprovals.ts:460-462`, `parPayments.ts:185-187`,
`parActivity.ts:61-64`, `parEfactura.ts:157-160` — rulează `accessibleProjectIds` **de două ori**,
cu aceleași argumente, în aceeași cerere.

**(b) `parPayerModules` se citește de două ori.** O dată în middleware
(`requireModuleEntitlement.ts:32`), a doua oară în `enabledPayerIds` (`:65`) chemat din handler
(`par.ts:671`, `parBudgetCodes.ts:87`, `parActivity.ts:44`, `parReports.ts:45`).

**(c) Nimic nu e memoizat per cerere.** Rolurile PAR, membrii, proiectele accesibile și drepturile
de modul nu se schimbă în timpul unei cereri.

**Amplificarea, verificată în frontend:**
- `src/pages/par/ParDashboard.tsx:185-227` trage la montare: `listEvents`, `listProjects`,
  `getParInbox`, `getParMe`, `getParSettings`, `listDepartments`, `listBudgetCodes`,
  `getBudgetCodesUsage` — plus `listPar` la `:231`. **≈9 cereri paralele.**
- `src/pages/par/ParReports.tsx:446` + `:475` — **10 rapoarte în paralel**, fiecare plătind
  `requireModuleEntitlement` (3) + `requirePARRole` (1) + middleware-ul de arie
  (`parReports.ts:43-71`, ~10 interogări, **secvențial**: `enabledPayerIds` → `accessibleProjectIds`
  → `accessiblePayerIds`).

  ⇒ ~140 de interogări de autorizare pentru 10 de conținut. **>90% din munca DB a paginii de
  rapoarte e autorizare recalculată identic de 10 ori**, împinsă prin 3 conexiuni.

**Fix — un cache per cerere + unul scurt per proces:**

```ts
// server/lib/par/scopeCache.ts
type Scope = { roles: ParRole[]; projects: string[] | null; payers: string[] | null;
               entitledPayers: string[] };
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: Promise<Scope> }>();

export function parScope(userId: string, tenantId: string, tenantRole: string): Promise<Scope> {
  const key = `${tenantId}:${userId}:${tenantRole}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (async () => {
    // accessibleProjectIds O SINGURĂ DATĂ, apoi payers derivă din el
    const [roles, entitledPayers, projects] = await Promise.all([
      getUserPARRoles(userId, tenantId, tenantRole),
      enabledPayerIds(tenantId, "par"),
      accessibleProjectIds(userId, tenantId, tenantRole),
    ]);
    const payers = await payersFromProjects(userId, tenantId, tenantRole, projects);
    return { roles, projects, payers, entitledPayers };
  })();
  cache.set(key, { at: Date.now(), value });   // se pune PROMISIUNEA → cererile concurente o împart
  return value;
}
```

Punând în cache **promisiunea**, cele 10 cereri paralele ale paginii de rapoarte rezolvă aria **o
singură dată**. Precedentul există deja în repo și e exact același raționament:
`server/auth/session.ts:57-83` (cache de sesiune 30 s, cu invalidare explicită la revocare).
Aceeași invalidare e obligatorie aici la: schimbarea unui `par_members`, a unui
`par_project_members`/`par_payer_members`, sau a unui `par_payer_modules`/`tenant_modules`.

**Câștig estimat:** ~140 → ~14 interogări pe pagina de rapoarte; ~10 → ~2-3 dus-întorsuri per
cerere PAR obișnuită. Pe ipoteza de 20 ms: **-150…-200 ms per cerere**, și dispare coada pe cele 3
conexiuni.

---

## 5. GET /api/par/:id — ~26 de dus-întorsuri secvențiale, aproape toate paralelizabile

**Unde:** `server/routes/par.ts:888-1090`.

Lanțul, în ordinea execuției (fiecare `await` îl așteaptă pe precedentul):

| linie | ce | interogări |
|---|---|---|
| 898 | `getPAR` | 1 |
| 901 | `getUserPARRoles` | 2 |
| 921-923 | `mayAccessProject`/`mayAccessPayer` | 3-5 |
| 925 | `hasPayerModuleEntitlement` | 2 |
| 930 | line items | 1 |
| 936 | approvals | 1 |
| 942 | attachments (`SELECT *`, vezi §1) | 1 |
| 947 | payment (`SELECT *`) | 1 |
| 953 | settings | 1 |
| 977 | `buildBodyForHash` (par + line items — **deja citite mai sus!**) | 2 |
| 1001 | users | 1 |
| 1010 | department | 1 |
| 1017 | project | 1 |
| 1024 | payer | 1 |
| 1031 | budget code | 1 |
| 1039 | event | 1 |
| 1050 | `getDesignatedApprovers` | 1 |
| 1053 | `getActiveDelegators` | 1 |
| 1054 | `getDelegatedAuthority` | 1-2 |

Plus cele 4 din middleware (§4). **≈28-32 de interogări, ≈26 secvențiale ⇒ ~520 ms** doar latență.

Trei categorii de risipă:
1. **`buildBodyForHash` (`:977`) recitește cererea și articolele**, deși ambele sunt deja în
   memorie de la `:898` și `:930` — 2 dus-întorsuri complet gratuite.
2. **Cinci lookup-uri de etichetă (department/project/payer/budget code/event) rulează unul după
   altul** (`:1010`-`:1044`), deși nu depind între ele. Sunt 5 dus-întorsuri unde ar fi 1.
3. Nimic după verificarea de acces nu e ordonat — totul poate merge într-un `Promise.all`.

**Fix, în două mișcări:**

```ts
// (a) restul citirilor, într-un singur val
const [lineItems, approvals, attachments, [payment], [settings],
       designatedApprovers, viewerDelegators] = await Promise.all([
  db.select().from(parLineItems).where(...).orderBy(asc(parLineItems.position)),
  db.select().from(parApprovals).where(...).orderBy(asc(parApprovals.step)),
  db.select({ /* fără fileUrl — §1 */ }).from(parAttachments).where(...),
  db.select({ /* fără proofUrl */ }).from(parPayments).where(...),
  db.select({ threshold: parSettings.microPurchaseThresholdCents }).from(parSettings).where(...),
  par.projectId ? getDesignatedApprovers(tenantId, par.projectId) : Promise.resolve(new Set<string>()),
  getActiveDelegators(user.id, tenantId),
]);

// (b) etichetele, cu un LEFT JOIN în locul a 5 SELECT-uri
const [labels] = await db
  .select({
    departmentName: parDepartments.name, projectName: parProjects.name,
    payerName: parPayers.name, budgetCode: parBudgetCodes.code,
    budgetName: parBudgetCodes.name, eventName: parEvents.name,
  })
  .from(parRequests)
  .leftJoin(parDepartments, eq(parDepartments.id, parRequests.departmentId))
  .leftJoin(parProjects,    eq(parProjects.id,    parRequests.projectId))
  .leftJoin(parPayers,      eq(parPayers.id,      parRequests.payerId))
  .leftJoin(parBudgetCodes, eq(parBudgetCodes.id, parRequests.budgetCodeId))
  .leftJoin(parEvents,      eq(parEvents.id,      parRequests.eventId))
  .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
```

Și `buildBodyForHash` primește rândurile deja citite în loc să le reinterogheze
(`server/lib/par/submit.ts:283` — adaugă o supraîncărcare care acceptă `{ par, lineItems }`).

**Câștig estimat:** 26 → **~6 dus-întorsuri** ⇒ **~520 ms → ~120 ms** (cu §4 aplicat: **~80 ms**).
Combinat cu §1: pagina de detaliu trece de la „o secundă + 10 MB" la „sub 150 ms + 30 KB".

---

## 6. POST /api/par/bulk-approve — 25 × un handler de 15 dus-întorsuri, secvențial

**Unde:** `server/routes/parApprovals.ts:653-670`

```ts
for (const parId of [...new Set(par_ids)]) {           // până la 25 (schema :648)
  const r = await approveParStep(user.id, tenantId, user.role, parId, {...});
}
```

`approveParStep` (`:145-383`) execută per cerere: `getUserPARRoles` (2), `getActiveDelegators` (1),
`par` (1), `approvalSteps` (1), `getDesignatedApprovers` (1), `getDelegatedAuthority` (1-2),
limita aprobatorului (1), `nameOf` (1-2), `UPDATE` (1), audit (1), deblocare pas + audit (2),
`refreshed` (1) ⇒ **~14-16 dus-întorsuri**, plus notificările din §7.

**Impact:** 25 × 15 = **~375 de dus-întorsuri secvențiale ⇒ ~7.5 s**, plus 25 de valuri de
notificări (§7: 5-20 dus-întorsuri + apeluri Resend fiecare). Realist: **20-60 s** ⇒ peste plafonul
implicit de execuție al funcțiilor Vercel. Aprobarea în masă e, practic, o rută care nu se poate
termina pe un lanț cu mai mulți aprobatori.

**Fix (în ordinea raportului efort/câștig):**
1. Rezolvă **o singură dată** contextul comun (`roles`, `delegators`, harta de aprobatori de
   proiect, aria) și pasează-l în `approveParStep` — scoate ~7 dus-întorsuri × 25.
2. Notificările pleacă `void` (§7), nu `await`.
3. Scade plafonul din schemă la 10 până când (1)+(2) sunt livrate, sau mută operația într-o coadă
   și întoarce `202 Accepted` cu un id de lot.

---

## 7. Emailurile se trimit sincron, într-o buclă, pe calea cererii

**Unde:** `server/services/par/notify.ts:194-200`

```ts
for (const userId of recipients) {
  await sendInApp({...});                                    // 1 INSERT
  const u = await getUser(userId, ctx.tenantId);             // 1 SELECT
  if (u?.email) await sendEmail({...});                      // 1 apel HTTP către Resend
}
```

Plus `buildApproverEmailBody` (`:152`) → `loadParSummary`, care face **5 interogări secvențiale**
(cerere, vendor `:100`, project `:108`, event `:118`, budget code `:127`), plus `accountFooter`
(`:233`) încă una **per email**.

Pentru un pas cu rutare pe rol, `recipients` = toți `approver` + `par_admin` din workspace
(`:185-191`). Cu 6 aprobatori: `5 + 1 + 6×(1+1+1 apel Resend)` = **12 dus-întorsuri DB + 6 apeluri
HTTP externe**, toate `await`-uite.

**Impact:** `POST /api/par/:id/submit` și `POST /api/par/:id/approve` întorc după
**~1.5-4 s**, din care marea majoritate e trimitere de email — muncă de care utilizatorul nu are
nevoie ca să vadă rezultatul. Apelurile Resend sunt și cea mai instabilă componentă a lanțului.

**Fix:** notificarea nu are voie să întârzie răspunsul. Tiparul e deja folosit în repo la
`server/app.ts:127` (`void recordError(...)`):

```ts
// în submit.ts / approveParStep
void notifySubmitted({ tenantId, parId, requestNo: par.requestNo }, firstStep?.approverUserId ?? null)
  .catch(() => {});
```

Și în interiorul lui `notifyApprovers`: un singur `INSERT … VALUES (…), (…)` pentru toate
notificările in-app, un singur `SELECT … WHERE id IN (…)` pentru destinatari, `Promise.all` pentru
emailuri (nu buclă), și `accountFooter` calculat **o dată** per lot, nu per destinatar.

**Câștig estimat:** `submit`/`approve` de la ~1.5-4 s la **~250-400 ms**.

---

## 8. Importul de configurație: 2 interogări per rând × 6 categorii

**Unde:** `server/routes/parConfigImport.ts` — același tipar, de șase ori:

| funcție | bucla | citire per rând | scriere per rând |
|---|---|---|---|
| `upsertVendors` | `:503` | `:527` | `:551` / `:560` |
| `upsertPayers` | `:612` | `:624` | `:631` / `:639` + `:640` |
| `upsertProjects` | `:673` | `:699` | `:707` / `:713` |
| `upsertEvents` | `:740` | `:774`, `:786` | `:796` / `:805` |
| `upsertDepartments` | `:823` | `:836` | `:842` / `:848` |
| `upsertBudgetCodes` | `:878` | `:924`, `:957` | `:963` / `:969` |

**Impact:** un fișier Excel real de configurație (proiecte + coduri bugetare + beneficiari, ~800
rânduri) ⇒ **1600-2400 de dus-întorsuri secvențiale ⇒ 32-48 s**. Peste plafonul de execuție al
funcției Vercel ⇒ importul **nu se termină pe prod**, deși local (PGlite, 0.1 ms/query) durează
~2 s și pare în regulă. Aceasta e exact clasa de bug „merge local, cade pe prod" pe care o produce
diferența de model de bază.

**Fix — citire în bloc + scriere în bloc, per categorie:**

```ts
async function upsertVendors(tenantId: string, rows: ImportRow[]) {
  const parsed = rows.map(parseVendorRow).filter(ok);           // pur, fără DB
  // 1 interogare: tot ce ar putea exista
  const ibans = parsed.map(p => p.iban).filter(Boolean) as string[];
  const names = parsed.map(p => p.name);
  const existing = await db.select().from(parVendors).where(and(
    eq(parVendors.tenantId, tenantId),
    or(ibans.length ? inArray(parVendors.iban, ibans) : undefined,
       inArray(parVendors.name, names))!,
  ));
  const byIban = new Map(existing.filter(v => v.iban).map(v => [v.iban!, v]));
  const byName = new Map(existing.map(v => [v.name, v]));
  // partiționare în memorie
  const toInsert = [], toUpdate = [];
  for (const p of parsed) { const hit = (p.iban && byIban.get(p.iban)) ?? byName.get(p.name);
                            hit ? toUpdate.push(patchFor(hit, p)) : toInsert.push(p); }
  if (toInsert.length) await db.insert(parVendors).values(toInsert).onConflictDoNothing(); // 1
  // update-urile: 1 interogare per câmp-set distinct, sau un CASE/`unnest` dacă merită
}
```

**Câștig estimat:** 1600-2400 → **~15 interogări**. De la „nu se termină" la **~1 s**.
(Notă: pe același drum, `upsertPayers:640` inserează un `par_payer_modules` per plătitor — și el
în lot.)

---

## 9. GET /api/par/inbox — scanare completă + „join-uri" pătratice în JS

**Unde:** `server/routes/parApprovals.ts:388-625`.

Trei probleme distincte, în plus față de §2:

**(a) Aduce toate cererile în aprobare, apoi le filtrează în JS**
`:504-513` selectează `SELECT *` din toate cererile `pending_approval` ale workspace-ului, **fără
limit**, iar `:522` face `pars.filter(p => parIds.includes(p.id))` — `parIds` e un **array**, deci
`.includes` e liniar ⇒ `O(P × M)`. Corect: `inArray(parRequests.id, parIds)` în SQL (lista e deja
calculată la `:501`).

**(b) `chainOf` e pătratic**
`:580-606`: pentru fiecare cerere din inbox, `chainRows.filter(...)` parcurge **toate** rândurile de
lanț, apoi `.sort()`. Cu P cereri × S pași: `P × (P·S)` = **O(P²·S)**. P=200, S=3 ⇒ ~120.000 de
comparații + 200 de sortări. În interior, `chainUserName` (`:574`) face `.find` pe lista de
utilizatori ⇒ încă un factor.

**(c) Aceleași scanări liniare per rând**
`projName`/`reqName` (`:535-536`, `.find`), `mySteps.find` (`:609`), `attachmentRows.filter`
(`:618`).

**Fix:** grupare o singură dată în `Map`-uri, înainte de `.map`:

```ts
const chainByPar = new Map<string, typeof chainRows>();
for (const r of chainRows) {
  const list = chainByPar.get(r.parId); list ? list.push(r) : chainByPar.set(r.parId, [r]);
}
for (const list of chainByPar.values()) list.sort((a, b) => a.step - b.step); // o dată, nu P ori
const nameById   = new Map(chainUserRows.map(u => [u.id, u.name || u.email]));
const projById   = new Map(projRows.map(p => [p.id, p.name]));
const stepByPar  = new Map(mySteps.map(s => [s.parId, s]));
const attByPar   = new Map<string, typeof attachmentRows>(); /* idem */
```

**Impact:** `O(P²·S)` → `O(P·S)`; plus un `SELECT *` neplafonat mai puțin. Pe P=200 înseamnă câteva
sute de ms de CPU în funcție și un payload semnificativ mai mic.

---

## 10. `syncEfacturaCandidates` — scrieri într-o buclă, pe un GET

**Unde:** `server/services/par/efacturaScan.ts:146-183`, apelat necondiționat din
`server/routes/parEfactura.ts:144` (`GET /api/par/efactura`).

```ts
for (const row of rows) {                 // rows = TOATE cererile 'paid' ale workspace-ului (:74-94)
  if (!current) { await db.insert(parEinvoices).values({...}); continue; }   // 1 scriere per rând
  ...
  await db.update(parEinvoices).set({...}).where(...);                       // 1 scriere per rând
}
```

**Impact:** la prima deschidere a cozii e-Factura pe un workspace cu 400 de cereri plătite:
**400 de INSERT-uri secvențiale ⇒ ~8 s**, pe un `GET` care e tăiat la 20 s de `getTimeout`. În regim
staționar e mai ieftin (majoritatea iterațiilor fac `continue`), dar rămâne o scriere per cerere
nou plătită, la fiecare deschidere de pagină.

**Fix:**

```ts
const toInsert = [], toUpdate = [];   // partiționare pură, în buclă
if (toInsert.length)
  await db.insert(parEinvoices).values(toInsert).onConflictDoNothing();   // 1 interogare
for (const [status, ids] of groupBy(toUpdate, u => u.status))            // ≤2 grupuri reale
  await db.update(parEinvoices).set({ status, updatedAt: new Date() })
    .where(and(eq(parEinvoices.tenantId, tenantId), inArray(parEinvoices.parId, ids)));
```

**Câștig:** N → **≤3 interogări**. În plus, `parEfactura.ts:148-155` selectează `par: parRequests`
(rândul întreg) fără `limit` — plafonează-l și selectează doar coloanele folosite la `:206-218`.
Iar cele 4 numărători de la `:222-227` sunt 4 treceri peste `visible`; una singură ajunge.

---

## 11. Cursul BNM se ia sincron, pe calea cererii, secvențial per valută

**Unde:** `server/routes/parBudgetCodes.ts:55-68`

```ts
for (const raw of currencies) { ... out.set(cur, await getMdlRate(cur)); }   // secvențial
```

`getMdlRate` (`server/lib/fx.ts:46-80`) are un cache **doar în memoria procesului**
(`fx.ts:15-16`). Pe Vercel fiecare instanță pornește cu cache gol, deci **prima cerere pe fiecare
instanță face un `fetch` real la bnm.md**, cu `AbortSignal.timeout(6000)` (`fx.ts:63`).

**Impact:** `GET /api/par/budget-codes/usage` cu coduri în EUR **și** USD ⇒ 2 fetch-uri externe
**secvențiale**: 0.4-1.6 s tipic, **12 s** în cazul rău (două timeout-uri de 6 s) — pe un GET
plafonat la 20 s. Se plătește la fiecare instanță nouă și după fiecare schimbare de zi.

**Fix:**
1. `Promise.all` peste valutele distincte (sunt maximum 3);
2. cursul zilei se persistă în DB (există deja `finExchangeRates` / `parFx`) — cache-ul devine
   partajat între instanțe, iar BNM se atinge o dată pe zi, dintr-un cron, nu de pe calea unei
   cereri de utilizator.

---

## 12. Rapoarte și exporturi fără plafon

- `parReports.ts:508-532` (`/breakdown`): toate cererile care compun o bară, fără `limit`.
  Totalurile se calculează apoi în JS (`:565-566`) prin două `reduce` peste tot setul — ar trebui
  să fie un `SUM()` în aceeași interogare.
- `parReports.ts:575-590` (`/export.csv`) și `:623-666` (`/export.xlsx`): fără `limit`.
  Pentru xlsx se aduc și toate articolele, apoi `buildParWorkbook` (`lib/par/excelExport.ts:86`)
  construiește registrul **în memoria funcției** înainte de primul octet trimis.
- `par.ts:784-788`: plafonul implicit al listei e **1000**, cu `SELECT *`. Rezonabil azi, dar
  comentariul de la `:779-782` recunoaște deja consecința: `ParDashboard` însumează KPI-urile în
  client peste `requests` (`ParDashboard.tsx:288-293`), deci **cifrele devin tăcut greșite** peste
  1000 de cereri. Reparația e un endpoint de sumar agregat în SQL, nu un plafon mai mare.

**Fix pentru exporturi:** plafon explicit + mesaj („exportul e limitat la N rânduri, îngustează
filtrul"), sau streaming pe rânduri pentru CSV (`ReadableStream`) în loc de un singur string
construit la `:606-608`.

---

## 13. Indexuri lipsă

| tabelă | interogare | fișier:linie | index lipsă |
|---|---|---|---|
| `par_payer_modules` | `WHERE tenant_id = ? AND module_key = ?` | `requireModuleEntitlement.ts:32`, `:65` | **niciun index pe `tenant_id`** (`schema/par.ts:177-180` are doar `payer_id` și unicul `(payer_id, module_key)`) ⇒ scanare secvențială **la fiecare cerere `/api/par/*`** |
| `par_requests` | `WHERE tenant_id = ? … ORDER BY created_at DESC LIMIT n` | `par.ts:790-797` | `(tenant_id, created_at DESC)` — azi se folosește `par_requests_tenant_idx` + sortare completă |
| `par_requests` | `WHERE tenant_id = ? AND status = ?` | `parApprovals.ts:507-512`, `parPayments.ts:178-184`, `doa.ts:135` | `(tenant_id, status)` |
| `par_approvals` | `WHERE tenant_id = ? AND decision='pending' AND locked=false` | `parApprovals.ts:431-437` | index parțial `(tenant_id) WHERE decision='pending' AND locked=false` |
| `par_audit` | `WHERE tenant_id = ? … ORDER BY created_at DESC LIMIT n` | `parActivity.ts:130-137` | `(tenant_id, created_at DESC)` |

Toate sunt `CREATE INDEX CONCURRENTLY`, fără schimbare de comportament. Cel de pe
`par_payer_modules` e cel mai ieftin câștig din tot raportul: o linie, și atinge **fiecare** cerere
PAR.

⚠️ Conform CLAUDE.md §0.2bis + memoriei „migrările nu se aplică fiabil pe prod": indexurile trebuie
livrate ȘI ca `CREATE INDEX IF NOT EXISTS` în `server/db/sync-schema.ts`, nu doar ca migrare.

---

## 14. Importuri top-level scumpe — **curat, nimic de reparat**

Verificat exhaustiv (`grep` peste toate `server/routes/par*.ts` + `server/lib/par/*.ts`):

- `exceljs`: doar `import type` la `parConfigImport.ts:35`, `lib/par/excelExport.ts:15`,
  `lib/par/configImportSheets.ts:20` — șters la compilare. Runtime-ul intră prin `await import()`
  la `parConfigImport.ts:136`, `:264`, `excelExport.ts:86`, `parAudit.ts:64`.
- `pdf-lib`: `await import()` la `par.ts:1920`, `parAudit.ts:84`.
- `playwright`: absent din tot modulul PAR.
- `openai` / `unpdf`: nu apar ca importuri statice în rutele PAR.

Lecția din memoria [[par-port-and-exceljs-lazy]] e respectată. **Singura recomandare: păstrează o
gardă automată**, altfel regresia reintră la primul refactor:

```js
// scripts/check-no-heavy-static-imports.mjs — de adăugat în vercel.json + prod-safety.yml
const HEAVY = ["exceljs", "pdf-lib", "playwright", "playwright-core", "unpdf", "sharp"];
// eșuează dacă un fișier din server/ îl importă static (fără `import type` / `await import`)
```

---

## 15. Diverse cu impact real, dar mai mic

**(a) Decodarea base64 caracter cu caracter în dosar** — `par.ts:2055-2057`

```ts
const binary = atob(base64);
pdfBytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i);
```

O buclă JS peste fiecare octet. Un dosar cu 8 PDF-uri × 3 MB = 24M iterații ⇒ **200-500 ms** de CPU
pur risipit. Fix: `const pdfBytes = new Uint8Array(Buffer.from(base64, "base64"));` — nativ, ~30×
mai rapid.

**(b) `parVendors.ts:260-281` — `POST /actions/normalize`**: un `UPDATE` per beneficiar, secvențial.
Acțiune de administrator, rulată rar ⇒ prioritate mică, dar la 2000 de beneficiari sunt 2000 de
dus-întorsuri (~40 s) și ruta nu se termină. Fix: acumulează și trimite `CASE`-uri în loturi de 500.

**(c) `submit.ts:229-242`**: un `INSERT` per pas de lanț (tipic 1-3, deci neglijabil), dar
`Math.min(...sanitizedChain.map(...))` la `:240` se recalculează **în fiecare iterație** —
`O(n²)` pe un `n` mic. Ridică-l în afara buclei.

**(d) `par.ts:1008`, `:535`, `parPayments.ts:226-227`, `parApprovals.ts:535-536`**: `.find()` pe
array-uri de rezultate în loc de `Map`. Individual neglijabil; devine relevant doar acolo unde e
în interiorul unui `.map` peste sute de rânduri (§3, §9).

---

## Ce NU e o problemă (verificat, ca să nu se piardă timp)

- **Rapoartele agregă în SQL**, corect: `parReports.ts:150-168` (by-budget), `:410-423` (aging),
  `:440-462` (cycle-time) etc. — `SUM`/`COUNT`/`AVG` + `GROUP BY` în bază, nu în JS.
- **`GET /budget-codes/usage`** (`parBudgetCodes.ts:139-230`) e deja rezolvat cu 2 agregate
  `GROUP BY` + `Map`, exact ca să evite N cereri de sold. Model bun de urmat în altă parte.
- **`GET /suggestions/line-items`** (`parSuggestions.ts:81-158`): plafonat (`SCAN_LIMIT = 400`),
  grupare cu `Map`, o singură trecere. Corect.
- **`GET /api/par/activity`** (`parActivity.ts:98-138`): `Promise.all` + `limit` pe ambele surse,
  join-uri în SQL. Corect (mai puțin taxa de arie din §4).
- **Cache-ul de sesiune** (`auth/session.ts:57-116`) elimină deja 3 interogări per cerere și scrie
  `last_active_at` cel mult o dată pe minut. E exact tiparul de extins în §4.
- **`getTimeout`** (`middleware/getTimeout.ts`) e o plasă bună, dar plafonează doar `GET`. Rutele
  din §6 și §8 sunt `POST` — nu le acoperă nimic în afară de plafonul Vercel.

---

## Plan de acțiune, ordonat după câștig/efort

| # | Reparație | Efort | Câștig | Risc |
|---|---|---|---|---|
| 1 | Index pe `par_payer_modules(tenant_id, module_key)` (§13) | 10 min | fiecare cerere `/api/par/*` | zero |
| 2 | Scoate `file_url` din `GET /:id` + `GET /:parId/attachments` (§1) | 1 h | −5…20 MB/cerere, elimină „payload too large" | mic (UI folosește deja `/preview`) |
| 3 | `backfillStuckApprovalChains` → 2 interogări (§2) | 1 h | −1…10 s pe inbox | mic (adaugă test: o cerere fără pas primește pasul) |
| 4 | Scoate `proof_url` + plafon + `Map`-uri în `/finance` (§3) | 2 h | −MB, −O(N²) | mic |
| 5 | Notificările pe `void` + trimitere în lot (§7) | 2 h | −1…3.5 s pe submit/approve | mic (sunt deja best-effort) |
| 6 | `Promise.all` + join de etichete în `GET /:id` (§5) | 3 h | 26 → 6 dus-întorsuri | mic |
| 7 | Cache de arie per cerere/proces (§4) | 4 h | −90% din interogările paginii de rapoarte | **mediu — necesită invalidare la schimbarea drepturilor** |
| 8 | `parConfigImport` în loturi (§8) | 1 zi | de la „nu se termină" la ~1 s | mediu (rescrie 6 funcții; testele de import există) |
| 9 | `Map`-uri în `/inbox` + `inArray` (§9) | 2 h | O(P²) → O(P) | mic |
| 10 | `syncEfacturaCandidates` în lot (§10) | 2 h | −8 s la prima încărcare | mic |
| 11 | Cursul BNM persistat + `Promise.all` (§11) | 3 h | elimină până la 12 s pe `usage`/`balance` | mic |
| 12 | Plafoane pe rapoarte/exporturi + endpoint de sumar agregat (§12) | 1 zi | corectitudinea KPI peste 1000 de cereri | mediu (schimbă cifre pe ecran ⇒ verificare separată) |

**Regula de verificare pentru fiecare punct** (CLAUDE.md §3.5.1quater): PGlite local nu poate
demonstra niciunul din câștigurile de mai sus — un query costă 0.1 ms. Măsurarea trebuie făcută pe
prod, autentificat, sau printr-un test care **numără interogările** (spion pe `db`), nu care
cronometrează. Un test de tipul „`GET /api/par/:id` face ≤ 8 interogări" este garda care oprește
regresia; un test de timp, nu.
