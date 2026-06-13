# FinDesk — test de logică a flow-ului

> Owner-ul a cerut: *„testează întâi tot flow-ul dacă e logic"*. Aici simulez un parcurs de date
> end-to-end pe o firmă reală, ca să verific că modulele se înlănțuie corect, fără găuri sau
> dependențe circulare, ÎNAINTE de implementare. Sursa de adevăr: [FIN-CORE.md](FIN-CORE.md).

## Firma de test: „Studio Vega SRL"
Agenție web din Chișinău, plătitor de TVA, 1 admin (contabil) + 1 owner. Servicii: hosting lunar
(recurent) + proiecte one-time. Clienți: TechCorp, MarketPro, BuildGroup.

## Parcursul (pe pași de produs)

- **Pas 0 — Onboarding (CORE):** workspace cu cod fiscal, regim TVA, valută MDL, serie facturare,
  logo, invită contabil. ✅ Produce `workspace_id`+serie+valută → alimentează tot restul.
- **Pas 1 — Client (PARTY):** creează TechCorp (cod fiscal din Director Firme = autocomplete, opțional
  → enhancement, nu blocant). ✅ Are nevoie de workspace. OK.
- **Pas 2 — Contract (AGREEMENT):** Hosting recurent lunar 1.000 MDL+TVA, 12 luni. ✅ Are nevoie de
  client+serie. Reține „ce se facturează lunar" → alimentează Pas 3.
- **Pas 3 — Factură (BILL):** pre-completată din contract → contabilul confirmă; SAU ad-hoc (one-time).
  Numerotare din serie, TVA obligatoriu. ✅ Ambele căi există, fără gaură. Alimentează EINV/CASH/INSIGHT.
- **Pas 4 — SFS (EINV):** factura plătitoare TVA → e-factura → SFS (SOAP, PR #144). Mediu test/prod +
  ultimul test. ✅ SFS neconfigurat → mock mode. Degradează grațios.
- **Pas 5 — Cheltuieli (SPEND) + Captură AI (CAPTURE):** chirie/software pe categorii; SAU upload PDF →
  AI propune furnizor/sumă/TVA/categorie → confirmare 1-click. ✅ AI = accelerator peste manual.
- **Pas 6 — Încasare+reconciliere (CASH):** import extras → matching plată↔factură; surplus = credit
  nealocat. ✅ Nepotrivite → alocare manuală. Marchează factura plătită → aging+dashboard.
- **Pas 7 — Taxe (FISC):** TVA de plată = colectat (BILL) − deductibil (SPEND) + impozit. Declarație
  TVA12. ✅ Sursele există în pașii anteriori. ⚠️ Cere TVA pe fiecare document (regula #1).
- **Pas 8 — Salarii (PAY):** brut→net din cote versionate; **postează automat cheltuială** (regula #3).
  ✅ Cote partajate cu FISC (regula #2).
- **Pas 9 — Dashboard (INSIGHT):** consumă tot; cashflow 60z 3 scenarii; narativ AI (cifre din query
  real). ✅ Ultim consumator, nu produce date → fără circularitate.
- **Pas 10 — Calendar (CALENDAR):** termene MD din profil+obligații (FISC,PAY) + remindere. ✅
- **Pas 11 — Bulk (MASS):** contracte recurente → N facturi → N e-facturi SFS. ✅ Orchestrează pașii
  existenți la scară, nu inventează logică.
- **Transversal — Securitate (TRUST):** audit AI+emitere, anonimizare PII, roluri. ✅ Nu produce/consumă
  date de business.

## Concluzie
- ✅ Fără dependențe circulare: Companie→Clienți→Contracte→Facturi→{e-Factura,Plăți}→{Taxe,Salarii}→
  Dashboard→Calendar. Bulk orchestrează. Securitate transversală.
- ✅ Fiecare modul are de unde să-și ia datele; fiecare cale are excepție; AI mereu accelerator.
- ⚠️ **4 reguli ferme** (intră în acceptance criteria, vezi FIN-CORE §2):
  1. TVA obligatoriu pe fiecare factură + cheltuială.
  2. Cote fiscale = registru versionat partajat FISC+PAY.
  3. Salariul/amortizarea postează automat cheltuială (anti dublă-introducere).
  4. Calcule deterministe în cod; AI doar extrage/narrează.

**Flow logic → VALID.**
