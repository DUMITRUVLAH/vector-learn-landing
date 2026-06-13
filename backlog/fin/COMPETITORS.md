# FinDesk — analiză concurenți locali + research tool-uri globale

> Referință pentru scrierea specurilor. Detaliile complete (cu screenshots) au fost extrase 2026-06-13:
> contafirm.md (SPA Inertia, randat cu Playwright headless+scroll) și sirius.expert (WebFetch+curl).
> Screenshots păstrate temporar în `/tmp/cf/shots` + `/tmp/cf/deep` la momentul analizei.

## A. contafirm.md (concurent #1, Moldova)
Poziționare: *„Documente, facturi și plăți — toate conectate automat"*. Scope declarat: *„NU
înlocuiește contabilul — control operațional ÎNAINTE de contabilitate."* Stack: Laravel+Inertia+React.
Flux central: **CLIENT → CONTRACT → FACTURĂ → PLATĂ → RAPORT** (introduci clientul o dată).
7 module: Dashboard (cashflow 3 scenarii/60z), Facturi (aging 0-30/31-60/60+, Draft/Plătit/Restant),
Contracte (recurent vs One-Time, factură generată din contract), Plăți (alocare + **credit nealocat**,
donut), Cheltuieli (categorii Salarii/Taxe/Office/Software/Chirie + top furnizori), e-Factura (SFS,
mediu test/prod, ultimul test, impozit 7%+TVA), Clienți&CRM (segment, top venit, aging/client).
Transversal: onboarding <10min/3 pași, import extrase+reconciliere 1-click, roluri granulare, 2FA,
GDPR EU, catalog public firme (SEO). Tabel poziționare: contafirm vs Excel vs Soft contabil.

## B. sirius.expert (concurent #2, Moldova) — SUITĂ de 3 produse
Founder Traian Chivriga. *„Economisește 20 ore/săptămână."*
- **Sirius Expert** (core): toate băncile într-o aplicație (sync automat), plăți+încasări (link plată,
  card/MIA coming-soon), multi-companie+roluri (până la 20 useri), grafic lunar performanță +
  monitorizare prag TVA.
- **e-Factura**: facturi branded 3 limbi (RO/RU/EN), recurente, **semnătură în aplicație**, conturi de
  plată, conectare SFS, multi-valută.
- **SiriusB2B**: director public 274k+ firme MD (transparență corporativă, SEO).
- **SiriusConta**: marketplace de contabili (calculator cost, filtre industrie/servicii/limbi).
Pricing freemium transparent: €0/9/25/59 (anual −20%).

## C. Ce le lipsește AMBILOR (oportunitatea FinDesk)
- ❌ AI (OCR documente, categorizare, narativ CFO) — niciunul. **Cel mai mare diferențiator.**
- ❌ Contabilitate reală (GL, declarații, salarii payroll, mijloace fixe) — ambii se opresc „înainte".
- ❌ Generare bulk de documente.
- Paritate necesară: flux conectat, e-Factura SFS, reconciliere, recurente, multi-companie+roluri,
  multi-valută, semnătură pe factură, link plată, (opțional) director firme.

## D. Research tool-uri globale (numitor comun)
1C, SAP Business One, QuickBooks, Xero, SAGA → spina dorsală comună: GL + documente primare +
bancă/reconciliere + facturare/AR + AP + TVA/declarații + salarii + mijloace fixe + rapoarte +
period close. Val AI 2026 (QuickBooks/Xero): OCR facturi, auto-categorizare, reconciliere AI,
CFO executive summaries. SAGA (RO): D394/D301, închidere lunară, cote mixte TVA. 1C (MD/CIS):
TVA12, SFS, payroll, plan de conturi predefinit.

## E. Maparea concurenți → module FinDesk (denumiri proprii)
| Concurent | FinDesk |
|-----------|---------|
| Dashboard | INSIGHT (+narativ AI, cashflow 3 scenarii) |
| Facturi | BILL |
| Contracte recurente | AGREEMENT |
| Plăți+alocare | CASH (credit nealocat) |
| Cheltuieli+furnizori | SPEND |
| e-Factura SFS | EINV |
| Clienți&CRM | PARTY |
| (lipsă la ei) | CAPTURE, FISC, PAY, ASSET, MASS = diferențiatorii noștri |
