# contafirm.md — analiză detaliată (referință prioritară #1)

> **Sursă:** https://contafirm.md — SaaS din Republica Moldova. Poziționare:
> *„Documente, facturi și plăți — toate conectate automat"* / *„Finanțe și CRM pentru echipe
> profesioniste"*.
> **Metodă:** SPA Inertia.js (Laravel + React + Vite + Tailwind). WebFetch → 403, deci `curl`
> (UA browser) + **Playwright headless cu scroll** pentru a randa conținutul lazy și a extrage
> textul leaf-level (etichete de carduri, stat-uri, FAQ). Screenshots: `/tmp/cf/shots/`,
> `/tmp/cf/deep/`. Date complete: `/tmp/cf/deep/leaf-text.json`. Data: 2026-06-13.

---

## 1. Poziționarea (citate exacte, de reținut)
- **Scope declarat:** *„Nu înlocuiește contabilul — îți oferă controlul operațional ÎNAINTE ca
  datele să ajungă la contabilitate."* → NU e soft de contabilitate full.
- **Promisiunea de bază:** *„Introduci clientul o singură dată. Contractele, facturile și plățile se
  leagă automat — fiecare pas preia informațiile anterioare, fără să completezi aceleași date de
  două ori."*
- **Cele 3 zone:** **Vânzări** (clienți, contracte, servicii) · **Bani** (facturi, plăți, restanțe,
  cashflow) · **Control** (rapoarte, taxe estimate, statusuri).
- **Statistici afișate (social proof):** 10.000+ facturi procesate · 98% rată de colectare ·
  500+ companii active · 4.9/5 satisfacție. Brand-uri citate: Moldtelecom, Franzeluța,
  Moldindconbank, Energocom (din catalogul de firme, nu neapărat clienți).

## 2. Fluxul central (cele 5 etape, verbatim)
```
CLIENT      → CONTRACT     → FACTURĂ      → PLATĂ          → RAPORT
Centralizezi  Definești      Emiți          Urmărești        Iei
relația       serviciile     documentul     încasarea        decizii
(dosar:       (servicii      (din datele    (plătit/restant/ (dashboard
date,         recurente,     deja           nealocat,        = indicatori
contacte,     termeni,       completate,    închizi          pt
istoric,      perioadă)      fără rescriere) diferențele)    management)
documente)
```

## 3. Tabelul lor de comparație (cum se poziționează vs alternative)
| Funcție | contafirm.md | Excel | Soft contabil |
|---------|:---:|:---:|:---:|
| Facturare automată din contracte | ✓ | ✗ | Limitat |
| CRM clienți integrat | ✓ | ✗ | ✗ |
| Contracte & addendumuri | ✓ | ✗ | ✗ |
| Reconciliere bancară | ✓ | Manual | Parțial |
| Guvernanță echipă & roluri | ✓ | ✗ | ✗ |
| Rapoarte în timp real | ✓ | Manual | Limitat |
| e-Factura & integrare SFS | ✓ | ✗ | ✓ |
| Cost | Gratuit acum | Abonament Office | Abonament lunar |
> Mesaj: *„Mai mult decât un simplu soft de facturare."* Se diferențiază de Excel prin conectare și
> de softul contabil prin CRM + contracte + UX modern. **Punctul lor slab declarat: nu fac
> contabilitate reală** (vezi §11).

## 4–10. Cele 7 module (structură identică: Vedere de ansamblu / Ce conține / Când / Ce câștigi / Module conexe)

### MODULUL 1 — Dashboard și rapoarte financiare („VEDERE DE ANSAMBLU")
- Carduri: **venituri, cheltuieli, profit estimat, TVA de plată** (+ evoluție vs luna anterioară).
- **Cashflow Forecast — 3 scenarii (Bun / Bază / Slab)** pentru încasări, plăți, **sold estimat 60 zile**.
- Context rapid fără navigare: **Aging · Top clienți · e-Factura · Contracte & Servicii**.
- Mockup real (home): Revenue €48.320 (+12%), Creanțe €12.400 (−8%), Clienți activi 127 (+5).

### MODULUL 2 — Facturi și urmărirea încasărilor („FACTURARE CLARĂ")
- Carduri: nr. total, valoare totală, **încasat, restant, scadență depășită**.
- Listă: număr, client, dată, **status, sumă** — filtrabilă/sortabilă.
- Panou lateral: status **Draft / Plătite / Restante**, **scadențe 0–30 / 31–60 / 60+ zile**, link rapoarte.
- Mockup: TechCorp LLC €3.200 *Plătită* · MarketPro Agency €1.800 *Emisă* · BuildGroup €950 *Restantă*.

### MODULUL 3 — Contracte și servicii recurente („DOCUMENTE COMERCIALE")
- Carduri: contracte active, valoare contractată, **servicii recurente active**.
- Listă: client, **tip (Hosting / One Time)**, **status (Activ / On Hold)**, valoare.
- Panou lateral: distribuție status, valori (activă/încasată/cumulată), **contracte cu expirare apropiată**.
- **Cheia:** factura se generează din contract → *„datele din contract deja completate, nu rescrii nimic"*.

### MODULUL 4 — Plăți și alocarea încasărilor („ÎNCASĂRI CONTROLATE")
- Carduri: nr. plăți, sumă primită, **sumă alocată la facturi, credit nealocat**.
- Registru: client, dată, **cont**, sumă, **status alocare** — filtrabil.
- Panou lateral: **distribuție alocări (donut)** + clienți cu **cel mai mare credit nealocat**.
- **Cheia:** reconciliere plată↔factură; conceptul „credit nealocat per client".

### MODULUL 5 — Cheltuieli și furnizori („COSTURI SUB CONTROL")
- Carduri: total cheltuieli, valoare, **plătite, în așteptare, nr. furnizori activi**.
- Categorii: **Salarii · Taxe · Office · Software · Chirie · Deplasări · Transfer intern**.
- **Top furnizori** (cu cine cheltuiești cel mai mult + valoare per furnizor).

### MODULUL 6 — e-Factura și integrarea SFS („DOCUMENTE ELECTRONICE") — *diferențiatorul local*
- Carduri: total e-facturi, **în așteptare, emise**, **impozit pe venit estimat (7%), TVA de plată**.
- Listă: companie, **serviciu prestat, perioadă facturare, nr. contract**, sumă.
- Panou lateral: status (donut) + **status integrare SFS (conectare API, mediu, ultimul test)** + activitate.
- **Cheia:** e-facturile se **generează DIN contracte**; noțiune de **mediu (test/prod)** + „ultimul test".

### MODULUL 7 — Clienți și CRM financiar („RELAȚII COMERCIALE")
- Carduri: total clienți, **activi**, sumă facturată, **sold restant cumulat**.
- Listă: nume, **contracte active**, sumă facturată, **sold** — sortabil pe orice coloană.
- Panou lateral: **segment (donut)**, **top clienți după venit**, **aging facturi neachitate per client**.
- **Cheia:** context comun pentru echipă; *„nu mai întrebi sau cauți în e-mailuri"*.

## 11. Funcții transversale & onboarding
- **Onboarding 3 pași, <10 min:** Configurează compania (logo + **serie facturare**) → Adaugă clienți
  & contracte → Emite/încasează/raportează. *„Fără training sau implementare."*
- **Import extrase bancare + reconciliere „cu un singur click"** (declarat, fără mențiune de AI).
- **Roluri & permisiuni granulare pe fiecare resursă și acțiune.**
- **Contracte & addendumuri**, **Export PDF**, **Facturare nelimitată**.
- **Securitate:** servere EU/GDPR, backup zilnic, 99.9% uptime, **2FA** pe toate conturile.
- **Catalog public firme MD** (`/catalog-firme`, mii de pagini SEO) — canal de achiziție/lead-gen.
- **Model:** gratuit în lansare, fără card. FAQ: import din Excel/alt soft, „construit special pentru
  Moldova", multi-user, ce se întâmplă cu datele la închidere cont.

## 12. Ce le LIPSEȘTE (oportunitatea noastră — confirmat din scope-ul declarat)
- ❌ **Registru general / contabilitate dublă** (postări în conturi) — se opresc „înainte de contabilitate".
- ❌ **Declarații fiscale** reale (TVA12/D394) — doar *estimează* TVA + impozit 7%.
- ❌ **Salarizare** (payroll) — „Salarii" e doar o categorie de cheltuială.
- ❌ **Mijloace fixe / amortizare.**
- ❌ **OCR pe documente primare** — datele se introduc manual.
- ❌ **AI** (zero mențiuni: nici narativ, nici categorizare, nici extragere). Stack non-AI.
- ❌ **Generare bulk** de documente.
- ~ Reconciliere „1-click" pe import — există, dar pe reguli, nu AI-matching.

## 13. Puncte tari de adoptat (fără a copia denumirile/structura lor)
1. **Fluxul conectat client→contract→factură→plată→raport** (introduci datele o dată).
2. **Cashflow forecast cu 3 scenarii pe 60 zile.**
3. **Credit nealocat per client** (concept de reconciliere clar).
4. **Aging pe intervale 0-30/31-60/60+** la facturi și per client.
5. **Onboarding <10 min, 3 pași**, serie de facturare la setup.
6. **Tabel de comparație vs Excel/soft contabil** (poziționare clară pe landing).
7. **Top furnizori / top clienți** ca insight imediat.
