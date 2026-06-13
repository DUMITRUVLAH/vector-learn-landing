# FinDesk — test de logică a flow-ului (înainte de a scrie modulele)

> Owner-ul a cerut: *„testează întâi tot flow-ul dacă e logic"*. Aici simulez un parcurs de date
> end-to-end pe o firmă reală, ca să verific că modulele se înlănțuie corect, fără găuri sau
> dependențe circulare, ÎNAINTE de a le scrie ca backlog. Dacă un pas nu are de unde să-și ia datele,
> flow-ul e greșit și trebuie reparat aici, nu în cod.

## Firma de test: „Studio Vega SRL"
Agenție web din Chișinău, plătitor de TVA, 1 admin (contabil) + 1 owner. Servicii: hosting lunar
(recurent) + proiecte one-time. Clienți: TechCorp, MarketPro, BuildGroup.

---

## Parcursul (numerotat pe pași de produs)

### Pas 0 — Onboarding (Modulul **Companie & Acces**)
- Owner creează workspace „Studio Vega SRL": cod fiscal, regim TVA = plătitor, valută MDL, țară MD.
- Definește **seria de facturare** (VEGA-2026-####) și încarcă logo.
- Invită contabilul cu rol „Contabil".
- ✅ **Verificare logică:** orice entitate de mai jos are nevoie de `workspace_id` + serie + valută.
  Toate vin de aici. **OK** — fundația alimentează tot restul.

### Pas 1 — Adaugă clientul (Modulul **Relații & Clienți**)
- Contabilul creează clientul TechCorp (cod fiscal, contact, segment „IT", valută).
- ✅ **Verificare:** clientul are nevoie de workspace (Pas 0). **OK.**
- ❓ **Întrebare de flow:** de unde vine codul fiscal? → din **Directorul de firme MD** (Modulul
  **Director Firme**) — autocomplete la tastare → completează automat datele oficiale.
  **Decizie:** Directorul de firme trebuie să existe ÎNAINTE de a fi util la crearea clientului, dar
  clientul poate fi creat și manual fără el → Directorul e **enhancement, nu blocant**. Flow OK.

### Pas 2 — Definește contractul (Modulul **Contracte & Servicii Recurente**)
- Contract cu TechCorp: serviciu „Hosting" recurent lunar 1.000 MDL + TVA, perioadă 12 luni.
- ✅ **Verificare:** contractul are nevoie de client (Pas 1) + serie/valută (Pas 0). **OK.**
- 🔗 **Legătură cheie:** contractul reține „ce trebuie facturat lunar" → alimentează Pasul 3.

### Pas 3 — Emite factura (Modulul **Facturare & Încasări**)
- Din contract, sistemul **pre-completează** factura (client, serviciu, sumă, TVA) → contabilul doar
  confirmă. Numerotare automată din serie (Pas 0). Status = Emisă, scadență +15 zile.
- ✅ **Verificare:** factura ia datele din contract (Pas 2) SAU se poate emite ad-hoc fără contract
  (proiect one-time) — ambele căi există. **OK, fără gaură.**
- 🔗 Alimentează: e-Factura (Pas 4), Plăți (Pas 6), Dashboard (Pas 9), aging client (Pas 1).

### Pas 4 — Trimite la SFS (Modulul **e-Factura SFS**)
- Factura plătitoare de TVA → se generează e-factura → se trimite la SFS prin clientul SOAP existent
  (PR #144). Status: În așteptare → Emisă. Mediu test/prod + „ultimul test conexiune".
- ✅ **Verificare:** are nevoie de factură (Pas 3) + credențiale SFS (config în Pas 0/setări).
  Dacă SFS nu e configurat → mock mode (deja în repo). **OK — degradează grațios.**

### Pas 5 — Înregistrează cheltuielile (Modulul **Cheltuieli & Furnizori**)
- Contabilul adaugă cheltuieli: chirie 5.000 MDL (furnizor „Imobil SRL", categoria Chirie),
  software 500 MDL (categoria Software).
- 🤖 **AI (Modulul Captură & Extragere AI):** încarcă PDF factură de la furnizor → AI propune
  furnizor/sumă/TVA/categorie → contabilul confirmă cu 1 click → devine cheltuială.
- ✅ **Verificare:** cheltuiala are nevoie de workspace (Pas 0) + opțional furnizor. Captura AI e un
  *accelerator* deasupra introducerii manuale — nu blochează nimic dacă AI lipsește. **OK.**

### Pas 6 — Încasează & reconciliază (Modulul **Plăți & Reconciliere**)
- TechCorp plătește 1.200 MDL în bancă. Contabilul **importă extrasul** (CSV/MT940) SAU sincronizare
  bancară.
- Motorul de reconciliere potrivește plata cu factura din Pas 3 (sumă+dată+referință). Surplus
  200 MDL → **credit nealocat** pe TechCorp.
- ✅ **Verificare:** are nevoie de facturi emise (Pas 3) + extras bancar. Dacă plata nu se potrivește
  automat → ajunge în „nepotrivite", contabilul alocă manual. **OK — excepțiile au cale.**
- 🔗 Marchează factura „Plătită" → actualizează aging (Pas 1) + dashboard (Pas 9).

### Pas 7 — Taxe & declarații (Modulul **Taxe & Declarații**)
- La sfârșit de lună: motor determinist calculează **TVA de plată** (TVA colectat din facturi −
  TVA deductibil din cheltuieli) + impozit pe venit estimat.
- Generează schița declarației (MD: TVA12).
- ✅ **Verificare:** are nevoie de facturi (Pas 3, TVA colectat) + cheltuieli (Pas 5, TVA deductibil)
  + cote din registrul de cote versionat. **OK — toate sursele există deja în pașii anteriori.**
- ⚠️ **Notă logică:** TVA-ul corect cere ca TVA-ul să fie marcat pe FIECARE factură și cheltuială.
  → Decizie: câmpul TVA e obligatoriu în Pas 3 + Pas 5. Confirmat în acceptance criteria.

### Pas 8 — Salarii (Modulul **Salarizare**)
- Contabilul rulează salariile lunii: brut→net (CAS/CASS/impozit MD), din cote versionate.
- Salariile nete → devin cheltuieli (categoria Salarii, Pas 5) + obligații la buget → calendar (Pas 10).
- ✅ **Verificare:** are nevoie de angajați + cote (registru versionat, partajat cu Pas 7). **OK.**
- 🔗 **Legătură:** salariul calculat **postează automat** o cheltuială → nu se introduce de două ori.

### Pas 9 — Vezi tabloul (Modulul **Tablou de Bord & Analiză**)
- Dashboard: venituri (din facturi Pas 3), cheltuieli (Pas 5+8), profit, TVA de plată (Pas 7),
  **cashflow forecast 60 zile 3 scenarii**, aging, top clienți, top furnizori.
- 🤖 **AI narativ:** „Luna mai: venituri +12%, dar creanțele restante au crescut cu 8% — 3 clienți
  depășesc 60 zile." Cifrele vin din query real (nu din model).
- ✅ **Verificare:** consumă date din TOȚI pașii de mai sus. E ultimul consumator, nu produce date.
  **OK — niciun pas nu depinde de dashboard (fără circularitate).**

### Pas 10 — Nu rata termenele (Modulul **Calendar Fiscal & Conformitate**)
- Calendar cu termene MD (TVA12 până pe 25, salarii, declarații) → remindere in-app + email.
- ✅ **Verificare:** termenele vin din profilul fiscal (Pas 0) + obligațiile generate (Pas 7, 8).
  **OK.**

### Pas 11 — Bulk (Modulul **Operațiuni în Masă**)
- La început de lună: toate contractele recurente active (Pas 2) → **generează N facturi deodată** →
  trimite N e-facturi la SFS (Pas 4) → job async, raport per rând.
- ✅ **Verificare:** are nevoie de contracte (Pas 2) + facturare (Pas 3) + SFS (Pas 4). E o
  *orchestrare* a pașilor existenți la scară. **OK — nu inventează logică nouă, doar repetă.**

### Transversal — Modulul **Securitate, Audit & Date**
- Fiecare acțiune AI (Pas 5, 9) + emitere (Pas 3, 4, 11) → audit log. Anonimizare PII înainte de
  prompt AI. Roluri (Pas 0) gating pe fiecare acțiune.
- ✅ **Verificare:** se aplică peste tot, nu produce/consumă date de business. **OK.**

---

## Concluzia testului de logică
- ✅ **Fără dependențe circulare:** Companie → Clienți → Contracte → Facturi → {e-Factura, Plăți} →
  {Taxe, Salarii} → Dashboard → Calendar. Bulk orchestrează. Securitatea e transversală.
- ✅ **Fiecare modul are de unde să-și ia datele** (sursa e mereu un pas anterior sau input direct).
- ✅ **Fiecare cale are excepție** (factură fără contract, plată nepotrivită, SFS neconfigurat, AI
  absent) → niciun modul nu e blocant dur pentru altul.
- ✅ **AI e mereu accelerator deasupra unei căi manuale** (captură, narativ, reconciliere) — nu
  introduce un singur punct de eșec.
- ⚠️ **Reguli ferme descoperite în test** (intră în acceptance criteria):
  1. TVA obligatoriu pe fiecare factură + cheltuială (altfel Pas 7 e greșit).
  2. Cotele fiscale sunt un registru versionat partajat de Taxe (Pas 7) + Salarii (Pas 8).
  3. Salariul calculat postează automat cheltuială (anti dublă-introducere).
  4. Calculele (TVA, salarii, amortizare) sunt deterministe; AI doar extrage/narrează.

**Flow logic → VALID.** Pot scrie modulele. Vezi `FIN-BACKLOG.md`.
