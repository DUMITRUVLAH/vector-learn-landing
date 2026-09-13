# Audit de performanță frontend — modulul PAR (FinFlow)

Metodă: citire directă a codului sursă (`src/pages/par/*.tsx`, `src/components/par/*`,
`src/lib/api*`, `src/hooks/*`, `src/App.tsx`) + inspecția artefactului real din `dist/assets`
(dimensiuni raw/gzip, urmărirea `import` static vs `import()` dinamic în chunk-urile compilate).
Zero speculații — fiecare afirmație are `fișier:linie` sau o comandă care o reproduce.

Context important găsit din prima: modulul are deja o infrastructură de perf serioasă
(`src/lib/apiCache.ts` — dedup în zbor + micro-cache 1,5s + cache de identitate 5 min;
`src/lib/lazyWithTimeout.ts` + `React.lazy` per pagină în `App.tsx`). Comentariul din
`apiCache.ts:5-8` documentează că înainte de acest strat, `/business/par` făcea **34 de cereri**,
dintre care `/api/business/auth/me` de 6 ori. Deci multe din problemele "clasice" (identity
re-fetch la fiecare remontare) sunt deja rezolvate. Găsirile de mai jos sunt ce a rămas.

---

## 1. TOP — impact mare, frecvență mare, fix clar

### 1.1 `ParDetail.tsx:72` — html2canvas (174 KB gzip) + jsPDF se încarcă EAGER pe orice pagină de detaliu PAR, deși codul ARE deja calea lazy corectă la 3 rânduri mai jos

`ParDetail.tsx:72`:
```ts
import { downloadParPdf } from "@/lib/parPdf";
```
`parPdf.ts:21-22` importă static `jsPDF` și `html2canvas` la nivelul modulului. Pentru că
`downloadParPdf` e importat STATIC în `ParDetail.tsx` (nu `await import(...)`), modulul
`parPdf.ts` (și deci html2canvas+jsPDF) intră în graful STATIC al chunk-ului `ParDetail`.

Verificat direct în artefactul compilat (`dist/assets/ParDetail-DlI-Dgx7.js`):
```
import{...}from"./parEfactura-DMMSVVKq.js";import{h as Ea,E as Pa}from"./html2canvas.esm-DeMt7VRO.js";import{o as ya}from"./parFiles-Cryu3B9w.js";...
```
— un `import` static, plasat lângă celelalte importuri de sus ale chunk-ului, ÎNAINTE de orice
funcție. Asta înseamnă că html2canvas se descarcă + parsează + execută **de fiecare dată când
cineva deschide orice `/business/par/:id`** (cea mai vizitată pagină din modul — orice aprobator,
orice solicitant care verifică statusul), indiferent dacă apasă vreodată "Descarcă PDF".

Dimensiune reală (`dist/assets/`, `gzip -9`):
```
html2canvas.esm-DeMt7VRO.js   raw=593 432   gzip=174 373
```
174 KB gzip pe lângă cei ~139 KB gzip deja plătiți de orice pagină (§7) — aproape **313 KB gzip**
de JS descărcat doar ca să afișezi o pagină de detaliu, fără ca utilizatorul să fi cerut PDF-ul.

**Contradicția e chiar în același fișier**: `ParDetail.tsx:250-252`, în `handleDownload` (butonul
real de download), developerul a scris CORECT importuri dinamice pentru exact aceleași module:
```ts
const { jsPDF } = await import("jspdf");
const html2canvas = (await import("html2canvas")).default;
const { buildParHtml } = await import("@/lib/parPdf");
```
Deci pattern-ul lazy corect există deja la 178 de linii distanță — dar importul static de la
linia 72 anulează beneficiul, pentru că orice import static forțează evaluarea eager a
modulului, indiferent câte importuri dinamice suplimentare există în altă parte.

**Bonus găsit citind acest cod**: `ParDetail.tsx:248` cheamă `await downloadParPdf(par)` — care
INTERN rulează `html2canvas(node,...)` + construiește PDF-ul (`parPdf.ts:369-410`) — și IMEDIAT
după (liniile 250-283) codul reconstruiește manual, cu import dinamic, **exact același proces**
(`buildParHtml` → `html2canvas` → `jsPDF` → felii A4) doar ca să obțină un `dataUrl` de atașat pe
server (`uploadAttachment(..., kind: "par_pdf")`, PAR-115). Rezultat: **rasterizarea html2canvas
rulează de DOUĂ ORI la un singur click pe "Descarcă"** — o dată pentru fișierul de pe disc, o
dată pentru atașamentul de pe server — cu costul de CPU dublat (html2canvas la `scale: 2` pe un
document A4 nu e ieftin, tipic sute de ms) și spinner-ul "Se generează…" vizibil dublu timp.

**Fix**:
1. Fă importul de la `ParDetail.tsx:72` dinamic (mută-l în `handleDownload`, ca restul) — elimină
   cei 174 KB gzip din calea eager a fiecărei pagini de detaliu.
2. Refactorizează ca `downloadParPdf`/rasterizarea să ruleze O SINGURĂ DATĂ per click: generează
   `dataUrl`/`Blob` o dată, apoi (a) declanșează `pdf.save()` local ȘI (b) trimite-l la
   `uploadAttachment`, în loc de două rulări independente ale html2canvas+jsPDF.

---

### 1.2 `ParDashboard.tsx` — căutarea din listă (`searchQ`) NU e debounced: o cerere API pe literă + race condition + flicker de loading

`ParDashboard.tsx:145`: `const [searchQ, setSearchQ] = useState(saved.q ?? "");`
`ParDashboard.tsx:384-385`:
```tsx
value={searchQ}
onChange={(e) => setSearchQ(e.target.value)}
```
`ParDashboard.tsx:231-258` — efectul care încarcă lista depinde direct de `searchQ`:
```ts
}, [statusFilter, purposeFilter, searchQ, dateFrom, dateTo, minTotal, maxTotal, listKey, setRequests]);
```
și în interior cheamă `await listPar({ ..., q: searchQ || undefined, ... })`.

Efect concret: a tasta „vendor” (7 litere) declanșează **7 cereri `GET /api/par?q=...`**
distincte, fiecare cu un URL diferit (`v`, `ve`, `ven`, …) — deci micro-cache-ul de 1,5 s din
`apiCache.ts` (cheiat pe URL) **nu prinde niciuna** dintre ele, pentru că fiecare literă produce
un URL nou (`listPar` din `src/lib/api/par.ts:484-499` pune `q` direct în querystring).

Două probleme suplimentare, nu doar volumul de cereri:
- **Race condition**: nu există `AbortController` și nici vreun steag „alive"/id de cerere în
  acest `useEffect` (spre deosebire de, de ex., `AttachmentsModal` din `ParFinanceQueue.tsx:496-504`,
  care folosește corect `let cancelled = false`). Dacă răspunsul pentru „ven" ajunge DUPĂ cel
  pentru „vendor" (perfect posibil pe rețea reală), `setRequests(res.requests)` suprascrie lista
  corectă cu una veche, mai puțin filtrată.
- **Flicker de loading la fiecare literă**: `listKey` (linia 154) include `searchQ` —
  `par.list:${JSON.stringify({ statusFilter, ..., searchQ, ... })}` — deci fiecare literă produce
  o cheie de `useKeepAliveState` nouă, niciodată văzută (`hasKeepAlive(listKey)` = false), ceea ce
  face ca `setLoading(true)` (linia 235) să se declanșeze la FIECARE tastă — lista clipește la
  „Se încarcă…" de 7 ori cât tastezi 7 litere.

Repo-ul ARE deja un hook gata făcut pentru exact acest caz — `src/hooks/useDebouncedValue.ts`
(folosit deja în alte pagini, comentat „CRM-139") — dar nu e folosit în niciuna dintre paginile
PAR.

**Fix**: `const debouncedQ = useDebouncedValue(searchQ, 300);` și folosește `debouncedQ` atât în
`listKey`, cât și în parametrul trimis la `listPar`. Elimină ~85% din cereri la o căutare tipică
și rezolvă și race condition-ul (mai puține cereri concurente) — pentru robustețe completă,
adaugă și un `alive`/`AbortController` guard în `load()`.

---

### 1.3 Upload de atașamente ca base64 JSON — payload cu ~33% mai mare decât fișierul + risc real de limită de platformă (Vercel ~4,5 MB body) sub pragul de validare (10 MB)

`ParCreateForm.tsx:166-173`:
```ts
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    ...
    reader.readAsDataURL(file);
  });
}
```
`ParCreateForm.tsx:1176-1179`:
```ts
if (file.size > 10 * 1024 * 1024) { setError(`${file.name}: depășește 10 MB.`); continue; }
const dataUrl = await fileToDataUrl(file);
const att = await uploadAttachment(draftId, {
  file_name: file.name, file_url: dataUrl, mime: file.type, ...
});
```
Aceeași schemă la `ParFinanceQueue.tsx:268-274` (dovada plății).

`uploadAttachment` (`src/lib/api/par.ts:667-675`) trimite acest `dataUrl` ca **JSON**:
```ts
export async function uploadAttachment(parId, payload) {
  return api(`/api/par/${parId}/attachments`, { method: "POST", body: JSON.stringify(payload) });
}
```
Un fișier de 10 MB devine ~13,3 MB în base64, plus overhead-ul JSON — trimis într-un singur
`fetch` sincron `JSON.stringify`, către o funcție **Vercel Node.js Serverless** confirmată în
`server/vercel-entry.ts` (`getRequestListener(app.fetch)`, comentariu explicit „Vercel Node
launcher") și `scripts/build-vercel.mjs:70` (`runtime: "nodejs20.x", launcherType: "Nodejs"`).

Funcțiile Node Serverless de pe Vercel au un plafon documentat de platformă de **~4,5 MB** pentru
corpul cererii. Cu inflația de ~33% a base64, orice fișier de peste ~3,3 MB — deci mult sub cei
10 MB pe care validarea din `ParCreateForm.tsx:1176` îi acceptă ca „ok" — riscă un `413` de
platformă (nu eroarea prietenoasă din `catch`), tipic exact genul de eroare „nu explică nimic
omului" pe care regulile proiectului (§3.5.1quater din CLAUDE.md) cer să fie eliminată din start.
Nu am putut testa live un upload de 8 MB în acest audit (fără server pornit) — recomand o
verificare explicită cu un fișier de 6-8 MB înainte de a considera asta „doar teoretic".

Pentru comparație, `prefillParFromDocument` (`src/lib/api/par.ts:1800-1813`, folosit pentru
AI-prefill) face deja CORECT acest lucru cu `FormData`/multipart:
```ts
const formData = new FormData();
formData.append("file", file);
await fetch("/api/par/ai-prefill", { method: "POST", body: formData, credentials: "include" });
```

**Fix**: trece `uploadAttachment` pe `FormData`/multipart (elimină minim inflația de 33%); pentru
a onora cu adevărat limita de 10 MB anunțată utilizatorului, mută uploadul pe o cale
direct-to-storage (URL semnat) care ocolește complet body-ul funcției serverless.

**Bonus, tot din același cod** — `ParCreateForm.tsx:1170`, `for (const file of picked) { ... await fileToDataUrl(file); await uploadAttachment(...); ... }` — bucla de upload multi-fișier e **secvențială**: dacă cineva atașează 3 documente odată, al doilea așteaptă ca primul să termine complet (citire + upload + analiza AI declanșată separat), în loc să se facă în paralel (sau cu o concurență limitată, gen 2-3 simultan). Pentru 3 fișiere de câte 1-2 MB pe o conexiune lentă, asta înseamnă de 3x timpul de așteptare perceput.

---

## 2. Waterfall-uri (măsurate din cod, nu presupuse)

| Loc | Lanț | Impact |
|---|---|---|
| `ParCreateForm.tsx:568-577` | `Promise.all([7 cereri])` → **apoi** `Promise.all([listPayers, getMyParProfile])` — a doua rundă nu depinde de nimic din prima | 1 dus-întors în plus irosit la FIECARE deschidere de formular (nou sau editare) — le poți uni într-un singur `Promise.all` de 9 |
| `ParDashboard.tsx:195-227` | `getParMe()` → (dacă `par_admin`) `getParSettings()` → (dacă onboarding incomplet) `Promise.all([listDepartments, listBudgetCodes])`; separat, `getParMe()` → (dacă finance/admin) `getBudgetCodesUsage()` | pentru un admin/finance, ~450-600 ms secvențiali doar pentru verificarea de onboarding + alerte de buget, pe FIECARE vizită a dashboard-ului (nu doar prima) |
| `ParDetail.tsx:186-192` (`PoButton`) | `getPurchaseOrder(par.id)` pornește abia după ce `par` (din `getPar`) există | structural greu de evitat (are nevoie de `par.id`); dacă serverul poate include un flag „are PO" direct în răspunsul `GET /api/par/:id`, se elimină al doilea dus-întors |

Toate celelalte pagini verificate (`ParInbox`, `ParFolders`, `ParFinanceQueue`, `ParEfacturaQueue`, `ParOnboarding`) își încarcă datele independente în `Promise.all` sau efecte paralele — NU am găsit waterfall-uri reale acolo.

---

## 3. Lipsă de cache / cereri redundante

- **Nu există react-query/SWR** — totul e `useState` + `useEffect` + `src/lib/apiCache.ts`
  (dedup + micro-cache 1,5s + cache de identitate 5 min pentru o listă fixă de căi:
  `/api/business/auth/me`, `/api/par/me`, `/api/modules`, `/api/fin/members/me`,
  `/api/platform/catalog`, `/api/impersonation/status` — `apiCache.ts:40-49`). Design conștient
  și documentat (comentariul din `apiCache.ts:5-31` explică de ce fereastra nu poate fi mai
  mare), nu un gol de arhitectură.
- **`ParInbox.tsx:511-515`** cere direct `GET /api/auth/me` (endpoint-ul CRM, nu cel de Business)
  doar ca să pre-completeze numele de semnătură — deși pagina rulează deja sub `AppShell` care
  (la rândul lui, `AppShell.tsx:222`) apelează `useSession()` → același `/api/auth/me`. Practic nu
  costă un dus-întors real (ambele lovesc cheia de cache de identitate de 5 min din
  `apiCache.ts`), dar arhitectural e endpoint-ul greșit pentru o pagină Business — `useBusinessSession()`
  (deja disponibil, `src/hooks/useBusinessSession.ts`) are `data.user.name` gata calculat, fără
  să atingă deloc suprafața CRM.
- **`AppShell.tsx:196-222`** apelează necondiționat `useSession()` (CRM) chiar și pentru pagini
  Business (`isBusiness === true`, unde componenta oricum delegă la `BusinessShell` de la linia
  272 și datele CRM nu mai sunt folosite după acel punct) — cost real doar de cod/un abonat în
  plus la state, nu de rețea (deduplicat).
- **Ce s-ar putea cache-ui mai agresiv, cu ce invalidare**: liste de referință per tenant
  (proiecte, departamente, coduri bugetare, plătitori, evenimente, furnizori) sunt re-cerute la
  fiecare pagină care are nevoie de ele — `listProjects`/`listDepartments`/`listEvents`/`listBudgetCodes`/
  `listPayers`/`listVendors` apar independent în `ParDashboard`, `ParCreateForm`, `ParInbox`,
  `ParFolders`, `ParReports`, `ParAdmin`. Toate sunt date „lente" (se schimbă rar — un admin le
  editează ocazional din `ParAdmin`). Ar fi candidați perfecți pentru intrarea în
  `IDENTITY_PATHS`/un TTL de câteva minute în `apiCache.ts` (invalidare explicită din mutațiile
  din `ParAdmin` — pattern deja existent acolo, `invalidateApiCache`), în loc de re-fetch complet
  la fiecare navigare între pagini PAR diferite.

---

## 4. Cereri irosite / race conditions

- **`ParDashboard.tsx:231-258`** — vezi §1.2: fără `AbortController`/steag de „alive", răspunsuri
  vechi pot suprascrie unul nou. Singurul loc din PAR cu acest gol confirmat.
- Restul paginilor verificate care fac fetch cu `parId`/`id` ca dependență
  (`ParDetail.tsx:829`, `ParComments.tsx:38`, `QuotesSection.tsx:38`, `ParEfacturaQueue.tsx:251-253`)
  fie au un steag de tip `alive`/`cancelled` (`ParDetail.tsx` — verificat la linia ~810-829,
  `ParGuardPage.tsx:40-58`, `ParFinanceQueue.tsx:496-504`), fie sunt idempotente prin natura
  datelor (GET simplu, ultima rescriere câștigă fără pericol de regresie vizibilă). Nu am găsit
  fetch-uri care scriu în state DUPĂ unmount fără gardă, în afară de cazul de mai sus.
- Nu există `setInterval`/polling în paginile PAR în sine — singurul polling e cel documentat și
  intenționat din `BusinessShell.tsx:507-516` (bagdge-uri de inbox/finanțe, 60s, cu refresh
  imediat pe eveniment via `badgeBus.ts` după orice decizie) — design corect, nu o problemă.

---

## 5. Randare

- **`ParCreateForm.tsx`**: 2530 de linii, **53 `useState`**, **0 `React.memo`**. Un singur
  component monolitic — orice tastare în orice câmp re-randează tot subarborele (tabelul de
  articole, lista de atașamente, dropdown-ul de sugestii, widget-ul de sold buget etc.). Pentru
  cereri cu multe articole (10+ rânduri), asta poate produce lag vizibil la tastare pe telefoane
  slabe. Căutările/autocomplete-urile din acest fișier (registru companii — linia 749-764, sugestii
  de articole — linia 1014-1025) SUNT corect debounced (400 ms, respectiv 220 ms), deci nu e o
  problemă de rețea, ci una de re-randare pură.
- **`ParAdmin.tsx`**: 3896 de linii, **57 `useState`**, doar **3 `useMemo`/`useCallback`** în tot
  fișierul. Atenuat parțial de randare condiționată pe tab (`ParAdmin.tsx:3883-3889`,
  `{tab === "doa" && <DoaMatrixEditor .../>}` etc.) — deci NU toate cele ~15-20 sub-secțiuni își
  declanșează `useEffect`-ul simultan, doar tab-ul activ. Cost real: schimbarea între tab-uri
  re-fetch-uiește integral de fiecare dată (fără cache între tab-uri), acceptabil pentru o pagină
  de admin folosită ocazional.
- **`ParInbox.tsx:687-711`**: `sortFilterInbox(...)` + un lanț de `.filter()` pe 8 criterii rulează
  inline într-un IIFE în JSX, necache-uit prin `useMemo` — se recalculează la FIECARE randare,
  inclusiv la fiecare schimbare de `cursor` din navigarea j/k (linia 574/576), care nu are nicio
  legătură cu filtrarea. Pentru dimensiuni realiste de inbox (zeci de rânduri), costul e sub 1 ms
  — semnalez ca nit ieftin de reparat (`useMemo` cu deps pe `items, projectFilter, sort, payerFilter, ...`),
  NU ca o problemă de performanță reală la scara curentă.
- Nicio listă din PAR nu pare virtualizată (`react-window`/`react-virtual`) — dar nici una din
  listele văzute (inbox, finance queue, dashboard) nu pare să depășească câteva sute de rânduri în
  practică; fără date reale de volum per tenant nu pot confirma că virtualizarea ar aduce beneficiu
  măsurabil azi. Semnalez ca „de urmărit dacă un tenant ajunge la mii de cereri simultan pe ecran",
  nu ca fix imediat.

---

## 6. Bundle

- **Toate paginile PAR sunt `React.lazy` per rută** (`App.tsx:32-43`), cu un comentariu explicit
  (PERF-003, `App.tsx:9-22`) despre bug-ul anterior (bundle unic de 669 KB gzip). Bine.
- **Baseline comun pe orice pagină** (chiar înainte de codul specific rutei):
  ```
  react-vendor-CtmO325t.js   raw=327 906   gzip= 99 188
  index-CeF2wyM4.js          raw=213 924   gzip= 40 195
  ```
  ≈ **139 KB gzip** doar pentru shell + React, pe orice rută — deja peste bugetul de 100 KB
  gzip/rută din CLAUDE.md §3.4, înainte de a adăuga vreun chunk de pagină. Nu e o regresie
  specifică PAR (e costul întregii aplicații), dar orice pagină PAR îl moștenește integral.
- Chunk-uri per pagină PAR (raw / gzip, din `dist/assets`):

  | Pagină | raw | gzip |
  |---|---:|---:|
  | ParAdmin | 229 502 | 34 803 |
  | ParCreateForm | 134 804 | 24 784 |
  | ParDetail | 118 800 | 21 776 (**+html2canvas 174 373 gzip, eager — vezi §1.1**) |
  | ParReports | 58 156 | 10 726 |
  | ParFinanceQueue | 45 491 | 7 390 |
  | ParExchange | 30 146 | 6 519 (**+recharts ~102 356 gzip, eager — vezi mai jos**) |
  | ParDashboard | 29 280 | 5 927 |

- **`ParExchange.tsx:31`**: `import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";`
  — import STATIC. Confirmat în chunk-ul compilat (`dist/assets/ParExchange-DLv1RyPr.js`):
  `import{m as ve,u as Ee}from"./CategoricalChart-CEz2fIhJ.js"` — tot static, nu `import()`.
  `CategoricalChart-CEz2fIhJ.js` singur = **329 068 raw / 102 356 gzip**, plus `LineChart`/
  `CartesianChart` alături. Comentariul din `App.tsx:14-15` (PERF-003) spune că recharts era
  problema pe ParReports „înainte" — verificat, **`ParReports.tsx` nu mai importă deloc
  `recharts` azi** (probabil re-scris ca tabel), dar problema a reapărut, pe altă pagină:
  `ParExchange` (accesibilă oricărui rol PAR, `App.tsx:265`). Fix: `React.lazy` pe componenta de
  grafic din `ParExchange.tsx` sau `await import("recharts")` la cerere, nu la mount.

---

## 7. Percepția vitezei

- Upload-urile de atașamente (§1.3) arată doar un spinner generic (`uploadingFile`/`saving`),
  fără procent — pentru un payload care poate ajunge la ~13 MB de JSON, pe 3G asta înseamnă
  minute de „Se încarcă…" fără niciun semnal de progres.
- AI-prefill (`ParCreateForm.tsx:790`, `prefillParFromDocument`) are aceeași lipsă de progres, dar
  acolo timpul e dominat de inferența LLM pe server — o bară de % n-ar avea ce reprezenta corect;
  prioritate mai mică decât uploadul brut.
- `ParFinanceQueue.tsx:288-292` — o pauză deliberată de 2 secunde DUPĂ ce plata s-a înregistrat cu
  succes, doar când vendorul a fost auto-salvat, ca omul să apuce să citească indicatorul înainte
  să se închidă modalul. E o alegere UX intenționată, nu un bug de performanță — nu blochează
  mutația, doar întârzie închiderea modalului.
- `ParDetail.tsx:1176-1180` — jurnalul de activitate (`ParTimeline`) e corect din spatele unui
  accordion (`showTimeline`), deci nu se cere niciodată dacă utilizatorul nu-l deschide. Bun exemplu
  de progressive disclosure aplicat corect, spre deosebire de comentariile atașate (§1) mereu eager.

---

## Tabel: pagină → nr. cereri API proprii la deschidere (sesiune rece, prima navigare)

„Proprii" = cereri declanșate de codul PAGINII înseși (nu numără din nou infrastructura de
identitate comună — `business/auth/me`, `par/me`, `modules`, `platform/catalog`, ~4 cereri —
care se plătește o singură dată per sesiune datorită cache-ului de 5 min din `apiCache.ts`, deci
e reală doar la PRIMA pagină PAR vizitată după login, nu la fiecare navigare).

| Pagină | Cereri proprii (necondiționat) | Cereri proprii (condiționat, ex. rol) | Waterfall real? |
|---|---:|---:|---|
| ParInbox | 4 (`inbox`, `auth/me`, `payers`, `events` — ultimele 2 în `Promise.all`) | — | Nu |
| ParDashboard | 5 (`events`,`projects`,`inbox`,`me`,`list`) | +4 pt. finance/par_admin (`settings`,`departments`,`budget-codes`,`budget-usage`) | Da, §2 — pt. admin/finance |
| ParCreateForm | 9, în 2 valuri `Promise.all` (7 + 2) | — | Da, §2 — 1 dus-întors irosit |
| ParDetail | 2 (`par`+`me`, un singur `Promise.all`) + `comments` | + `purchase-order` (dacă e afișat butonul PO) + `three-way-match`/`receipts` (doar `in_finance` + rol finance/admin) | Structural minor, §2 |
| ParFinanceQueue | 1 (`finance-queue`) | — | Nu |
| ParFolders | 3, un singur `Promise.all` (`list`,`projects`,`events`) | — | Nu |
| ParReports | 13, toate în paralel (8 rapoarte + 2 aging/cycle + 3 liste de referință) | — | Nu (dar fan-out mare — vezi risc de pool mai jos) |
| ParExchange | 1-2 (`fx-rates`/`fx-series`) | — | Nu |
| ParEfacturaQueue | 1 (`queue`) | +1 dacă utilizatorul comută pe tab-ul „Facturi" (`invoices`, lazy corect) | Nu |
| ParOnboarding | 1 (`settings`) | — | Nu |
| ParAdmin | 1-3, DAR doar pentru tab-ul activ (randare condiționată, `ParAdmin.tsx:3883-3889`) | — | Nu (per tab) |

**Notă de risc, nu doar de numărătoare**: `ParReports` trimite 13 cereri GET concurente către
API — toate ating baza de date. Acest repo are deja un incident documentat de epuizare a pool-ului
Postgres pe Vercel (`idle_timeout` + `max:1` conexiuni per instanță — vezi memoria de proiect
"Blocaj de pool Postgres pe Vercel"). Nu am rulat un test de sarcină în acest audit, dar un
fan-out de 13 cereri simultane dintr-o singură deschidere de pagină e exact tipul de tipar care
ar agrava acel gât de sticlă sub concurență reală (mai mulți useri de finanțe deschid Rapoarte
în același interval). Recomand fie un endpoint combinat de sumar (server agregă cele 8+2 query-uri
într-un singur răspuns), fie cel puțin o limitare a concurenței client-side dacă un endpoint unic
nu e fezabil pe termen scurt.

---

## Prioritizare finală (impact perceput de utilizator, descrescător)

1. **§1.1** — html2canvas eager pe ParDetail (313 KB gzip pe cea mai vizitată pagină + PDF generat de 2 ori la fiecare click de download).
2. **§1.2** — căutare fără debounce pe ParDashboard (N cereri/literă + race condition + flicker de loading, fix de 10 minute cu hook-ul deja existent în repo).
3. **§1.3** — upload de atașamente base64 peste limita probabilă de platformă Vercel (risc de eșec silențios pentru fișiere „valide" client-side).
4. **§2** — waterfall dublu-Promise.all pe ParCreateForm (1 dus-întors irosit la fiecare deschidere de formular, cea mai frecventă acțiune din modul).
5. **§6** — recharts eager pe ParExchange (regresia aceleiași probleme deja rezolvate pe ParReports).
6. **§2 / tabel** — lanțul secvențial de 3 cereri pentru verificarea de onboarding pe ParDashboard, la fiecare vizită de admin/finance.
7. **§5** — monolit de stare fără memo pe ParCreateForm/ParAdmin (lag de tastare pe cereri mari, doar pe device-uri slabe).
8. **§6 tabel ParReports** — fan-out de 13 cereri concurente, risc de contenție pe pool-ul Postgres deja fragil.
9. Restul (§3-4-5 nits) — corecte arhitectural cum sunt, cu observații minore de curățenie a codului, fără impact măsurabil la scara curentă.
