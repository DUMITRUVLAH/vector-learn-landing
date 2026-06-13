# FinDesk — Backlog de module (denumiri proprii, logică completă, legături)

> SaaS B2B de finanțe + automatizare pentru firme din Moldova/RO. Modul nou în repo-ul Vector Learn,
> sub `/app/fin/*`, lângă PAR și e-Factura.
>
> **Cum a fost construit acest backlog:**
> 1. Research pe 5 tool-uri globale ([FIN-RESEARCH.md](FIN-RESEARCH.md)).
> 2. Analiză detaliată pe 2 concurenți locali: [CONTAFIRM-ANALYSIS.md](CONTAFIRM-ANALYSIS.md) +
>    [SIRIUS-ANALYSIS.md](SIRIUS-ANALYSIS.md).
> 3. **Test de logică a flow-ului end-to-end** ([FIN-FLOW-TEST.md](FIN-FLOW-TEST.md)) — VALIDAT.
> 4. Module scrise cu **denumiri PROPRII** (NU cele ale concurenților — owner-ul nu vrea să pară
>    copiat), fiecare cu logica din spate + ce produce + ce consumă + cu cine se leagă.
>
> **Reguli tehnice:** prefix item `<COD>-xxx`. Migrările pornesc **DUPĂ ITPARK** — ITPARK este
> prioritar și ia primul prefix disponibil (azi `0116`). FIN-BACKLOG pornește de la **`0117`**
> (CORE FIN) și continuă în ordine. Nu hardcoda numerele — verifică `max idx` din `_journal.json`
> pe `origin/main` în momentul build-ului și folosește `max+1`. 1 modul = 1 fază = 1 branch = 1 PR (§0.2).
> Reuse over rebuild — vezi col. „Refolosește din repo". Status: `pending` · `in_progress` · `done` · `blocked`.

## Harta de legături (din testul de flow — fără circularitate)
```
CORE (companie+acces+serie+valută)
 ├─ REGISTRY (cote fiscale versionate) ── partajat de FISC + PAY
 ├─ PARTY (clienți+furnizori)  ←── REGISTRY-firme MD (autocomplete)
 │    └─ AGREEMENT (contracte+servicii recurente)
 │         └─ BILL (facturare+AR)
 │              ├─ EINV (e-Factura SFS)
 │              └─ CASH (plăți+reconciliere) ←── extras bancar
 ├─ SPEND (cheltuieli+furnizori) ←── CAPTURE (OCR AI)
 ├─ FISC (TVA+declarații)  ← consumă BILL(TVA colectat)+SPEND(TVA deductibil)
 ├─ PAY (salarii)  → postează cheltuială în SPEND
 ├─ ASSET (mijloace fixe)  → postează amortizare
 ├─ INSIGHT (dashboard+narativ AI)  ← consumă TOATE (nu produce date)
 ├─ CALENDAR (termene fiscale)  ← FISC + PAY
 ├─ MASS (operațiuni bulk)  → orchestrează AGREEMENT→BILL→EINV
 └─ TRUST (securitate+audit)  ── transversal
```

---

## 1. `CORE` — Spațiu de lucru, companie & acces
> **Denumire UI:** „Compania mea". **Echivalent concurent:** onboarding/multi-companie (ambii).
- **Logica din spate:** rădăcina întregului produs. Un workspace = o firmă (tenant). Ține profilul
  fiscal (țară MD/RO, cod fiscal, **regim TVA**, valută, multi-entitate), **seria de facturare**,
  logo, roluri (Owner / Contabil / CFO / Viewer) cu permisiuni granulare pe resursă+acțiune.
- **Produce:** `workspace_id`, serie, valută, regim TVA → folosite de TOATE celelalte module.
- **Consumă:** nimic (e fundația). **Refolosește din repo:** `tenants`, `users`, `requireAuth`, 2FA.
- **Onboarding <10 min, 3 pași** (de la concurenți): firma → clienți/contracte → prima factură.
- **Status:** `pending` · **Migrare:** 0117 (ITPARK ia 0116 — prioritar)

## 2. `REGISTRY` — Registru de cote fiscale & date oficiale
> **Denumire UI:** „Cote & nomenclatoare". **Oportunitate:** concurenții hardcodează; noi versionăm.
- **Logica din spate:** sursă unică de adevăr pentru cotele care se schimbă în timp: TVA (standard,
  redus, zero), cote salariale (CAS/CASS/impozit), impozit pe venit — fiecare cu `country` +
  `effective_from`. NICIODATĂ hardcodat în `.tsx`. + nomenclator plan de conturi per țară.
- **Produce:** cote → consumate de `FISC` (TVA) și `PAY` (salarii) — regula #2 din flow-test.
- **Consumă:** `CORE` (țara). **Refolosește:** `accounting.ts`, `accountingMappings.ts`.
- **Status:** `pending` · **Migrare:** 0118

## 3. `PARTY` — Clienți & furnizori (CRM financiar)
> **Denumire UI:** „Parteneri". **Echivalent:** „Clienți & CRM" (contafirm) / contacte (Sirius).
- **Logica din spate:** baza de parteneri comerciali (clienți ȘI furnizori într-un model unificat).
  Per client: venit cumulat, segment, **sold restant + aging per partener**, istoric documente.
  Context comun pentru echipă.
- **Produce:** parteneri → folosiți de `AGREEMENT`, `BILL`, `SPEND`, `CASH`.
- **Consumă:** `CORE`; **autocomplete** din `REGISTRY-firme` (cod fiscal → date oficiale).
- **Refolosește:** `leads.ts`/CRM existent, `companyClients.ts`.
- **Status:** `pending` · **Migrare:** 0119

## 4. `AGREEMENT` — Contracte & servicii recurente
> **Denumire UI:** „Acorduri". **Echivalent:** „Contracte recurente" (ambii). *Lipsea în v1.*
- **Logica din spate:** contracte cu clienți, **servicii recurente vs punctuale**, termeni, valoare,
  perioadă, **expirări**. Reține „ce trebuie facturat și când" → motorul de facturare pre-completează.
- **Produce:** șablonul de facturare recurentă → consumat de `BILL` și `MASS` (bulk lunar).
- **Consumă:** `PARTY`, `CORE`. **Refolosește:** `contracts.ts`, `CONTRACT-501` (generator existent).
- **Status:** `pending` · **Migrare:** 0119

## 5. `BILL` — Facturare & creanțe (AR)
> **Denumire UI:** „Facturi". **Echivalent:** „Facturi" (ambii).
- **Logica din spate:** emite factură/proformă/chitanță — **din contract (pre-completat)** SAU ad-hoc.
  Numerotare din serie (`CORE`), **TVA obligatoriu** (regula #1), status Draft/Emisă/Plătită/Restantă,
  **aging 0-30/31-60/60+**, remindere de încasare, semnătură electronică, multi-limbă/valută, PDF.
- **Produce:** facturi → consumate de `EINV`, `CASH`, `FISC` (TVA colectat), `INSIGHT`, aging `PARTY`.
- **Consumă:** `AGREEMENT` (opțional), `PARTY`, `CORE`. **Refolosește:** `invoices.ts`,
  `invoiceReminders.ts`, `parPdf`/`paymentAccountPdf` (PDF).
- **Status:** `pending` · **Migrare:** 0120

## 6. `EINV` — e-Factura SFS Moldova
> **Denumire UI:** „e-Factura". **Diferențiator local** (ambii îl au; noi îl avem deja în repo).
- **Logica din spate:** factura plătitoare TVA → e-factura → trimisă la **SFS** prin client SOAP
  (PR #144). Status În așteptare→Emisă, **mediu test/prod**, „ultimul test conexiune API",
  impozit venit 7% + TVA estimate. Degradează grațios în **mock mode** dacă SFS neconfigurat.
- **Produce:** status e-factură → `INSIGHT`. **Consumă:** `BILL`, credențiale SFS (`CORE`/setări).
- **Refolosește:** integrarea e-Factura existentă (`server/routes/par.ts` SFS, `parPdf`, crypto).
- **Status:** `pending` · **Migrare:** 0121

## 7. `SPEND` — Cheltuieli & furnizori (AP)
> **Denumire UI:** „Cheltuieli". **Echivalent:** „Cheltuieli & furnizori" (contafirm).
- **Logica din spate:** înregistrează cheltuieli pe **categorii** (Salarii/Taxe/Office/Software/
  Chirie/Deplasări...), furnizori, status plată (Plătit/În așteptare), **top furnizori**, TVA
  deductibil (regula #1). Cheltuielile pot fi create manual SAU din `CAPTURE` (OCR AI).
- **Produce:** cheltuieli + TVA deductibil → `FISC`, `INSIGHT`. **Consumă:** `PARTY` (furnizori),
  `CAPTURE`. Primește postări automate din `PAY` (salarii) și `ASSET` (amortizare). 
- **Refolosește:** `payments.ts`, `accountingMappings.ts`.
- **Status:** `pending` · **Migrare:** 0122

## 8. `CAPTURE` — Captură & extragere AI din documente
> **Denumire UI:** „Documente AI". **Oportunitate majoră:** NICIUNUL dintre concurenți nu are AI.
- **Logica din spate:** încarci PDF/poză/CSV (factură furnizor, bon, extras) → AI extrage
  vendor/dată/sumă/TVA/IBAN/categorie → **propunere** confirmată de om (1 click) → devine cheltuială
  (`SPEND`) sau document. Acuratețe + încredere per câmp. Mereu *accelerator peste calea manuală*.
- **Produce:** date structurate → `SPEND`, `BILL`. **Consumă:** `CORE`, `REGISTRY` (categorii/conturi).
- **Refolosește:** `ai.ts`, `aiAuditLog.ts`, `aiFeatureFlags.ts`. AI nu inventează — om confirmă.
- **Status:** `pending` · **Migrare:** 0123

## 9. `CASH` — Plăți, încasări & reconciliere
> **Denumire UI:** „Încasări". **Echivalent:** „Plăți+alocare" (contafirm) / sync bancar (Sirius).
- **Logica din spate:** **import extras (CSV/MT940)** sau sincronizare bancară → motor de
  reconciliere (sumă+dată+referință, determinist + scor) potrivește plăți cu facturi → marchează
  „Plătită". Surplus = **credit nealocat per client**. Excepțiile (nepotrivite) → alocare manuală.
  **Link-uri de plată** (de la Sirius) pentru încasare online.
- **Produce:** alocări → actualizează `BILL` (status) + aging `PARTY` + `INSIGHT`. **Consumă:**
  `BILL` (facturi emise), extras bancar. **Refolosește:** `paymentAccountItems.ts`, `payments.ts`.
- **Status:** `pending` · **Migrare:** 0124

## 10. `FISC` — TVA & declarații fiscale
> **Denumire UI:** „TVA & declarații". **Oportunitate:** concurenții doar *estimează*; noi generăm.
- **Logica din spate:** motor **determinist** (regula #4): TVA de plată = TVA colectat (`BILL`) −
  TVA deductibil (`SPEND`), cu cote din `REGISTRY`. Generează schița declarației (MD: TVA12; RO:
  D394/D301), impozit pe venit. Export. Cifre exacte, NU AI.
- **Produce:** obligații fiscale → `CALENDAR`, `INSIGHT`. **Consumă:** `BILL`, `SPEND`, `REGISTRY`.
- **Status:** `pending` · **Migrare:** 0125

## 11. `PAY` — Salarizare & angajați
> **Denumire UI:** „Salarii". **Oportunitate:** concurenții n-au payroll (doar categorie de cheltuială).
- **Logica din spate:** angajați, calcul **brut↔net** determinist (MD: CAS/CASS/impozit; RO echiv.)
  din `REGISTRY` (regula #2), state de plată, rețineri la buget. Salariul calculat **postează automat
  o cheltuială** în `SPEND` (regula #3, anti dublă-introducere) + obligații → `CALENDAR`.
- **Produce:** cheltuieli salariale → `SPEND`; obligații → `CALENDAR`. **Consumă:** `REGISTRY`, `CORE`.
- **Refolosește:** `payroll.ts`.
- **Status:** `pending` · **Migrare:** 0126

## 12. `ASSET` — Mijloace fixe & amortizare
> **Denumire UI:** „Mijloace fixe". **Oportunitate:** concurenții n-au.
- **Logica din spate:** registru mijloace fixe (achiziție, durată, metodă liniară/degresivă), calcul
  **amortizare lunară determinist** → postează automat cheltuială în `SPEND`. Casare.
- **Produce:** amortizare → `SPEND`, `INSIGHT`. **Consumă:** `CORE`, `REGISTRY`.
- **Status:** `pending` · **Migrare:** 0127

## 13. `INSIGHT` — Tablou de bord & analiză narativă
> **Denumire UI:** „Tablou de bord". **Echivalent:** „Dashboard" (ambii) + narativ AI (noi unic).
- **Logica din spate:** consumatorul final (nu produce date → fără circularitate). Carduri venituri/
  cheltuieli/profit/TVA, **cashflow forecast 60 zile, 3 scenarii** (de la contafirm), aging, **top
  clienți + top furnizori**. **Narativ CFO AI**: cifre din query real → text de management
  (anti-halucinație, regula #4). Vederi salvate.
- **Consumă:** `BILL`, `CASH`, `SPEND`, `FISC`, `PAY`, `ASSET`, `EINV`. **Refolosește:** `analytics.ts`,
  `saved-views.ts`, `ai.ts`.
- **Status:** `pending` · **Migrare:** 0128

## 14. `CALENDAR` — Calendar fiscal & conformitate
> **Denumire UI:** „Calendar fiscal". **Echivalent:** parțial (contafirm n-are explicit).
- **Logica din spate:** termene MD/RO (TVA12 pe 25, salarii, declarații) generate din profilul
  fiscal (`CORE`) + obligațiile reale (`FISC`, `PAY`). Remindere in-app + email, status
  pending/done/overdue, închidere de perioadă (lock postări).
- **Consumă:** `CORE`, `FISC`, `PAY`. **Refolosește:** `notifications`, `inAppNotifications`.
- **Status:** `pending` · **Migrare:** 0129

## 15. `MASS` — Operațiuni în masă (bulk)
> **Denumire UI:** „Operațiuni în masă". **Oportunitate:** concurenții n-au bulk; owner a cerut explicit.
- **Logica din spate:** orchestrare la scară (nu logică nouă, regula din flow-test): toate
  contractele recurente active (`AGREEMENT`) → **N facturi deodată** (`BILL`) → **N e-facturi la SFS**
  (`EINV`). Job async, raport per rând (succes/eșec), re-try. + import bulk clienți/cheltuieli din CSV.
- **Consumă:** `AGREEMENT`, `BILL`, `EINV`. **Refolosește:** pattern job async + SFS existent.
- **Status:** `pending` · **Migrare:** 0130

## 16. `TRUST` — Securitate, audit & date
> **Denumire UI:** „Securitate". **Echivalent:** GDPR/2FA (ambii) + audit AI (noi).
- **Logica din spate:** transversal. **Anonimizare PII** înainte de prompt AI (`CAPTURE`, `INSIGHT`),
  audit complet al acțiunilor AI + emitere, retenție, export GDPR, roluri (`CORE`) aplicate pe fiecare
  acțiune. Secrete AES-256-GCM.
- **Consumă/aplică peste:** tot. **Refolosește:** `auditLog`, `aiAuditLog`, `consent`, `crypto.ts`.
- **Status:** `pending` · **Migrare:** 0131

---

## Director public de firme MD (canal SEO — opțional, ca la ambii concurenți)
> Atât contafirm (`/catalog-firme`) cât și Sirius (`SiriusB2B`, 274k firme) au un director public de
> firme ca motor de achiziție/SEO + autocomplete la `PARTY`. De evaluat ca modul separat `DIR` dacă
> owner-ul vrea canalul de lead-gen. Nu e în fluxul de bază; îl notez aici, nu îl numerotez încă.

## Ordinea de build (din testul de flow)
```
CORE → REGISTRY → PARTY → AGREEMENT → BILL → EINV → SPEND(+CAPTURE) → CASH
     → FISC → PAY → ASSET → INSIGHT → CALENDAR → MASS → TRUST
```
**Recomandare de pornire (valoare rapidă + vizibilă):** CORE → PARTY → AGREEMENT → BILL → EINV
(fluxul „client→contract→factură→SFS", paritate cu concurenții) → CASH (reconciliere) →
CAPTURE+INSIGHT narativ (diferențiatorul AI). Restul completează contabilitatea reală.

## Cum ne diferențiem (rezumat, din ambele analize)
1. **AI-native** (CAPTURE OCR + INSIGHT narativ) — NICIUN concurent local nu are.
2. **Contabilitate reală** (FISC declarații, PAY salarii, ASSET amortizare) — concurenții se opresc
   „înainte de contabilitate".
3. **Bulk** (MASS) — owner a cerut, concurenții n-au.
4. **Paritate** pe ce au ei: flux conectat, e-Factura SFS, reconciliere, recurente, multi-companie/roluri.
