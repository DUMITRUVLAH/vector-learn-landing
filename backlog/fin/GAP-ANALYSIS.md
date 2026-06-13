# FinDesk — analiză de goluri (ce lipsește pentru o aplicație COMPLETĂ de contabilitate)

> Analiză 2026-06-14: comparație între backlog-ul FIN actual (17 module) și ce trebuie să aibă o
> aplicație reală pentru contabili/CFO/analiști financiari (research §FIN-RESEARCH + practica MD/RO).
> Modulele lipsă se adaugă mai jos și în BUILD-SEQUENCE/STATE.

## Ce ACOPERĂ deja backlogul (spina dorsală — OK)
CORE, REGISTRY, PARTY, AGREEMENT, BILL, EINV, SPEND, CAPTURE, CASH, FISC, PAY, ASSET, INSIGHT,
CALENDAR, MASS, TRUST + FIN-601..604 (facturi/recurring existente). Asta = facturare→plăți→taxe→
salarii→rapoarte. Solid.

## GOLURI identificate (un contabil real le cere; le adăugăm)

### G1 — `LEDGER` (Registru general / Carte mare) — **CRITIC**
Toate documentele produc venituri/cheltuieli, dar nu există **dubla înregistrare** (debit/credit pe
conturi) — inima contabilității. Fără el, FinDesk e „operațional" (ca concurenții), nu contabilitate
reală. Postări automate din BILL/SPEND/PAY/ASSET → conturi din REGISTRY. Balanță de verificare.
→ Diferențiatorul #1 față de contafirm/sirius (ei NU au GL).

### G2 — `BANKLINK` (Conectare bancară / extrase automate) — important
CASH face import manual de extras. Un contabil vrea **sincronizare automată** (Sirius o are: „toate
băncile"). Conectori bancari MD (MAIB, MICB, Victoriabank) + import OFX/MT940 programat + dedup.

### G3 — `INVENTORY` (Stocuri / gestiune) — mediu
1C/SAP/Xero îl au. Firme cu marfă au nevoie: intrări/ieșiri, stoc curent, cost mediu ponderat,
legătură la BILL (factura scade stocul) și SPEND (achiziția crește stocul).

### G4 — `BUDGET` (Bugetare & prognoză) — mediu
CFO vrea buget vs realizat pe categorii/proiecte, alerte la depășire. Se leagă de INSIGHT (forecast)
și SPEND (cheltuieli reale vs plan).

### G5 — `EXPORT` (Export contabil / interoperabilitate) — important pt MD/RO
Contabilul lucrează și în 1C/SAGA. Export structurat (CSV/XML standard) al jurnalelor, balanței,
facturilor → import în softul lor. + export SAF-T (RO) / format SFS (MD). Reduce blocajul „dar eu
folosesc 1C".

### G6 — `CLIENTPORTAL` (Portal client / self-service) — mediu
Clientul firmei vede facturile lui, le plătește online (link plată — Sirius îl are), încarcă
documente. Reduce munca de follow-up. Reuse pattern portal existent (`studentPortalTokens`).

### G7 — `MULTICURRENCY` (Multi-valută complet) — mediu
CORE pregătește valuta, dar lipsește **revaluarea** și **diferențele de curs** (firme cu EUR/USD).
Curs BNM zilnic, reevaluare sold la închidere de lună → postare diferență în LEDGER.

### G8 — `APPROVAL` (Flux de aprobare plăți) — mic (reuse PAR!)
Cheltuielile/plățile mari ar trebui aprobate înainte de execuție. Repo-ul are deja modulul PAR
(Payment Action Request) complet → **reuse**, nu rebuild: leagă SPEND/CASH de fluxul PAR.

## Decizie de prioritizare (pentru autopilot non-stop)
Construiesc întâi **lanțul de valoare de bază** (deja în backlog, fazele 3-9): PARTY→AGREEMENT→BILL→
EINV→SPEND→CAPTURE→CASH. Apoi **LEDGER (G1)** — fără el nu e contabilitate. Apoi FISC→PAY→ASSET→
INSIGHT. Golurile G2-G8 intră ca module noi DUPĂ ce spina dorsală e funcțională (adăugate în STATE
ca pending, fazele 17-23), ca să nu blocheze fluxul principal.

## Module noi adăugate în STATE (fazele 17-23)
- `LEDGER` (faza 17, 4 items) — registru general + postări auto + balanță
- `BANKLINK` (faza 18, 3 items) — conectori bancari + import auto
- `INVENTORY` (faza 19, 4 items) — stocuri
- `BUDGET` (faza 20, 3 items) — bugetare vs realizat
- `EXPORT` (faza 21, 3 items) — export 1C/SAGA/SAF-T
- `CLIENTPORTAL` (faza 22, 3 items) — portal client + plată online
- `MULTICURRENCY` (faza 23, 2 items) — revaluare + diferențe curs
- `APPROVAL` (faza 24, 2 items) — reuse PAR pentru aprobare plăți

Total nou: ~24 items. FinDesk devine ~80 items / 24 module = aplicație completă de contabilitate.
