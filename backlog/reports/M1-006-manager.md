# M1-006 Rapoarte și analize — Andreea Mitran (Director Academie)

**Verdict: BUY**

Streak: MAYBE → BUY → BUY → BUY → MAYBE → **BUY**

---

## Ce mi-a plăcut (în sfârșit, ceva care vorbește limba mea)

Asta e prima pagină din serie unde simt că cineva s-a gândit la mine ca **director care semnează cecul**, nu ca user generic. Dashboard-ul live cu toggle 7d/30d/90d/12m e exact reflexul pe care îl am în Excel luni dimineața. Faptul că schimb perioada și se schimbă **și KPI-urile, și line chart-ul, și bar chart-ul, și delta vs. perioada anterioară** — bun, ăsta nu mai e mockup decorativ, e gândire reală despre fluxul meu.

Count-up animation pe KPI cards e drăguț dar nu e ce mă convinge. Ce mă convinge:
- **MRR + LTV + Churn + Elevi activi** în patru cards = exact ce am eu pe whiteboard în birou.
- **Bar chart cu venituri per disciplină** + procent din total — pot vedea în 3 secunde că Engleza face 46% din venit. Asta îmi spune unde investesc anul viitor.
- **Top 5 elevi după LTV cu luni active** — primul tabel din toată suita care arată **clienți reali**, nu doar statistici agregate. Vreau să sun pe Maria Popescu și să-i mulțumesc.

FAQ-ul răspunde inteligent la **trei dintre cele cinci întrebări reale** ale unui director:
1. „De unde vin datele" → drill-down până la tranzacția atomică + audit log 7 ani. **Asta** e ce voiam să aud încă de la M1-001.
2. „Pot face raport custom" → SQL read-only pe Enterprise. Analiștii mei știu SQL, mulțumesc.
3. „Looker / PowerBI / Tableau" → da, cu ODBC + conector nativ Looker Studio + webhook spre Snowflake/BigQuery. Asta deblochează deal-ul cu CFO-ul grupului.

## Ce mă irită (și de ce nu e încă STRONG BUY)

**1. RON nicăieri. A patra pagină la rând.** MRR-ul meu e în lei, nu în euro. Contabilul meu lucrează în RON pentru ANAF. Faptul că tot dashboard-ul afișează `€24.380` în loc de `121.900 RON` mă obligă să fac conversie mental la fiecare review. Asta e **defect recurent de produs**, nu detaliu. Adăugați un toggle EUR/RON sus în dreapta, lângă selectorul de perioadă.

**2. Drill-down promis în FAQ, dar invizibil în UI.** Spui „poți face drill-down de la orice cifră până la tranzacția individuală" — perfect, dar KPI cards nu sunt clickable, rândurile din tabel nu sunt clickable, barele din chart nu sunt clickable. Demo-ul contrazice promisiunea. Măcar un cursor-pointer + un side-panel mock care arată „top 10 tranzacții care compun MRR-ul" ar dovedi că feature-ul există.

**3. Export Excel/PDF: promis în secțiunea „Export & integrări", absent din toolbar-ul dashboard-ului.** Eu, ca director, vreau buton **„Export PDF"** vizibil lângă titlu, nu îngropat într-o secțiune marketing mai jos. Contabilul meu cere raportul lunar până pe 5 — dacă nu văd butonul în 2 secunde, cred că nu există.

**4. Predicția churn cu motive** — descrisă în bullet-uri („risk score 0-100, motive: prezență scăzută, plăți întârziate"), dar fără nicio reprezentare vizuală. Un mini-widget cu 3 elevi „at risk" + scor + motiv ar fi fost killer feature. În forma actuală e doar promisiune.

**5. Sursă pentru cifre.** „112.400 € pe Engleză în 12 luni" — de unde? Sample data? Centru real? Adăugați badge `Date demo` sau citați o filială Vector Learn. Recurența asta din review-urile anterioare începe să mă deranjeze.

## Ce nu mai aduc în discuție (rezolvat sau acceptabil)

- GDPR-minors detail — nu e tema acestei pagini, am notat pentru M2.
- Logos clienți — n/a aici.

## Verdict final

**BUY.** Prima pagină care răspunde efectiv la întrebarea „de ce mi-aș cumpăra eu, directorul, CRM-ul vostru". Trei lucruri o țin departe de STRONG BUY: **RON missing (al patrulea miss consecutiv)**, drill-down promis dar neimplementat în UI, și absența unui buton export vizibil. Fixați RON și drill-down clickable în M1.5 și vă semnez contract pe 6 locații.

— Andreea
