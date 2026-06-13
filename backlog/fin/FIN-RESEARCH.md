# FinDesk — Deep research pe tool-uri reale de contabilitate/ERP → mapare pe module

> **Scop.** Nu pornim de la workshop, ci de la ce fac **produsele reale** de pe piață. Am studiat
> **5 produse** (1C, SAP Business One, QuickBooks Online, Xero, SAGA) + valul de feature-uri AI
> 2026, plus stratul regional **Moldova/SFS e-Factura**. Din ce au ELE în comun + ce face un
> contabil zilnic, am derulat **modulele** produsului nostru: **FinDesk**, SaaS B2B în repo-ul
> Vector Learn, sub `/app/fin/*`, lângă PAR și e-Factura. Prefix item `FIN-Mxx-yyy`.
> Backlog: [FIN-BACKLOG.md](FIN-BACKLOG.md).

---

## 1. Cele 5 produse studiate — ce module / funcții au

### 1.1 **1C: Accounting / Finance & Accounting** (dominant în MD/CIS, RO)
Construit ca soft de contabilitate, dezvoltat în jurul modulului de finanțe. Are:
- Plan de conturi **predefinit** + structură analitică predefinită; motor de postări (registre).
- Documente primare: comenzi, facturi de intrare/ieșire; registre de acumulare (creanțe, bancă).
- **Multi-entitate** într-o singură bază (contabilitate per persoană juridică).
- Cash management, vânzări/creanțe, achiziții/datorii, stocuri+BOM, **mijloace fixe**, costing.
- **Salarii & HR** (1C:Payroll), calcul salariu net, rețineri la buget, documente de personal.
- TVA + **Declarația TVA** (în MD: TVA12; integrare **SFS / e-Factura**), rapoarte fiscale reglementate.
- Contabilitate pe departamente; rapoarte standard + IFRS; CRM + evidență contracte.
> Sursă: [1c-dn.com](https://1c-dn.com/1c_enterprise/what_is_1c_enterprise/), [1c.com.vn](https://1c.com.vn/en/products/1c_finance_accounting), [1cmd.md](https://www.1cmd.md/ro/).

### 1.2 **SAP Business One** (ERP SMB, 15 module funcționale)
- **Finance & Accounting** (postări, registre, conformitate), **Banking** (încasări/plăți, Payment Engine).
- **Sales** (lead→post-vânzare), **Purchase & Procurement** (PO, recepție, retururi).
- **Inventory** (stocuri, loturi/serii, liste de preț), **Production + MRP** (BOM, planificare materiale).
- **Business Partners** (clienți/furnizori), **CRM**, **Opportunities**, **Service** (SLA).
- **Project Management** (buget, etape, documente), **HR** (date angajați, costuri salariale).
- **Reports + Business Intelligence** (KPI, drill-down, drag-drop, alerte pe workflow), **Administration**.
> Sursă: [uneecops](https://www.uneecops.com/blog/top-sap-business-one-modules-list-2024-update/), [TEC](https://www3.technologyevaluation.com/selection-tools/features-list/31760/sap-business-one).

### 1.3 **QuickBooks Online** (cloud, SMB)
- Bank feeds + **auto-categorizare AI**, expense categorization, **invoicing**, bill management.
- **Sales tax**, reconciliere (drag-drop extras bancar cu **AI matching** pe Plus+).
- Receipt capture (mobil/email → bill), reguli de categorizare automată.
- Rapoarte: aged receivables, general ledger, P&L, trial balance; **CFO executive summaries** (AI, Advanced).
- 2026: anomaly detection, **AI chat** pe întrebări financiare, forecasting, fixed-asset depreciation,
  revenue recognition, batch transactions, raportare pe departament/locație. 800+ integrări.
> Sursă: [business.com](https://www.business.com/reviews/quickbooks-online/), [irvinebookkeeping](https://www.irvinebookkeeping.com/post/quickbooks-online-complete-workflow-guide-2026), [firmofthefuture](https://www.firmofthefuture.com/product-update/june-2026-mpu/).

### 1.4 **Xero** (cloud, SMB)
- Chart of accounts, general ledger, **bank reconciliation automată**, cashflow.
- Invoicing (cu remindere), accounts receivable, quotes, purchase orders, order management.
- **Bill capture & receipts (Hubdoc)** — OCR pe documente primare.
- Payroll (regional), expense tracking, **inventory**, multi-currency, **Projects** (timp+cost+profit).
- Rapoarte financiare, dashboard; sute de integrări prin App Store (nu module proprii, ci ecosistem).
> Sursă: [theknowledgeacademy](https://www.theknowledgeacademy.com/blog/xero-features/), [tipalti](https://tipalti.com/resources/learn/xero-accounting-software/), [TEC](https://www3.technologyevaluation.com/features-list/xero-55149).

### 1.5 **SAGA** (local RO, foarte răspândit la firme de contabilitate)
- Contabilitate în partidă simplă ȘI dublă, evidență stocuri, **facturare**, salarii.
- **Generare automată declarații fiscale** (D394, D301 etc.), import electronic de facturi.
- **Închidere lunară automată**, calcul TVA (inclusiv facturi cu cote mixte), balanțe, jurnale.
- Operațiuni în valută cu actualizare automată curs; conformitate fiscală în prim-plan; cost mic.
> Sursă: [sagasoft.ro](https://www.sagasoft.ro/), [sagasoftware.ro/d394](https://www.sagasoftware.ro/d394-detalii/), [taxdome](https://taxdome.com/ro-ro/blog/top-programe-de-contabilitate).

### 1.6 Valul AI 2026 (ce adaugă toate, peste funcțiile clasice)
- **OCR pe facturi/bonuri** → extragere vendor/sumă/TVA/IBAN, acuratețe 98-99% (Dext, Koncile).
- **Auto-categorizare** care învață planul de conturi → -80-90% muncă manuală.
- **Reconciliere AI** cu mii de conexiuni bancare → închidere de la săptămâni la zile (15-30 min).
- Anomaly detection, AI chat financiar, **CFO executive summaries** narative.
> Sursă: [ramp](https://ramp.com/blog/ai-accounting-software), [koncile](https://www.koncile.ai/en/ressources/accounting-ocr-top-10-solutions-comparison), [dualentry](https://www.dualentry.com/blog/ai-in-accounting).

---

## 2. Numitorul comun — capabilitățile pe care orice tool serios le are

Cruce pe cele 5 produse (✓ = îl are nativ ca modul/funcție de bază):

| Capabilitate | 1C | SAP B1 | QuickBooks | Xero | SAGA |
|--------------|:--:|:------:|:----------:|:----:|:----:|
| Plan de conturi + Registru general (GL) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Documente primare (facturi intrare/ieșire) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bancă: încasări/plăți + **reconciliere** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Facturare** (emitere) + creanțe (AR) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Furnizori / datorii (AP) + bills | ✓ | ✓ | ✓ | ✓ | ✓ |
| **TVA + declarații fiscale** | ✓ | ✓ | ✓ | ~ | ✓ |
| **Salarii / payroll** | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stocuri / inventar | ✓ | ✓ | ~ | ✓ | ✓ |
| **Mijloace fixe** (amortizare) | ✓ | ~ | ✓ | ~ | ~ |
| Clienți/furnizori (Business Partners / CRM) | ✓ | ✓ | ✓ | ✓ | ~ |
| **Rapoarte** (P&L, balanță, aging) + dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Multi-entitate / multi-valută | ✓ | ✓ | ~ | ✓ | ✓ |
| **Închidere de perioadă** (period close) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Strat AI 2026 (OCR, auto-cat, recon, narativ) | nou | nou | ✓ | ✓ | ~ |

**Concluzie:** spina dorsală a oricărui produs este **GL + documente primare + bancă/reconciliere +
facturare + AR/AP + TVA/declarații + salarii + rapoarte + period close**. Diferențiatorul 2026 e
**stratul AI** (OCR, auto-categorizare, reconciliere asistată, narativ CFO). FinDesk = exact acest
schelet, **AI-native din start** + integrarea **e-Factura SFS Moldova** (avantaj local pe care
QuickBooks/Xero nu-l au, iar 1C/SAGA îl fac greoi).

---

## 3. Ce REFOLOSIM din repo (reuse over rebuild — CLAUDE.md §3.7)

| Capabilitate FinDesk | Există în repo | Cum |
|----------------------|----------------|-----|
| Multi-tenant (firma = tenant) | `tenants.ts` | fiecare rând FIN poartă `tenant_id` |
| Auth / roluri / 2FA | `requireAuth`, `users`, `sessions` | roluri FIN peste cele existente |
| Facturi / AR | `invoices.ts`, `invoiceReminders.ts` | bază pentru facturare; nu redublăm |
| Bancă / plăți | `payments.ts`, `paymentAccounts.ts`, `paymentAccountItems.ts` | reconcilierea se leagă aici |
| Salarii | `payroll.ts` | calculatorul de salarii extinde |
| Plan de conturi / mapări | `accounting.ts`, `accountingMappings.ts` | GL + categorizare AI propune de aici |
| **e-Factura Moldova (SFS)** | PR #144 (`par.ts` + `parPdf`, SOAP mock) | emiterea trimite la SFS |
| AI + audit + flags | `ai.ts`, `aiAuditLog.ts`, `aiFeatureFlags.ts`, `aiSettings.ts` | tot AI prin acest strat |
| PDF | `paymentAccountPdf.ts`, `parPdf.ts` (html2canvas) | documente cu diacritice corecte |
| Notificări | `notifications`, `inAppNotifications` | remindere fiscale, „document gata" |
| Audit | `auditLog.ts` | orice acțiune AI/emitere auditată |

---

## 4. Principii de produs (diferențiatorul față de „încă un soft de contabilitate")
1. **AI-native, dar cu cifre deterministe.** OCR și categorizarea sunt *propuneri* confirmate de om;
   calculele (TVA, salarii, amortizare) rulează în cod determinist — AI-ul **nu inventează cifre**,
   doar extrage și narrează. (1C/SAGA n-au AI nativ; QuickBooks/Xero au, dar noi îl punem din start.)
2. **e-Factura SFS Moldova built-in** — avantaj de piață locală (deja integrat în repo).
3. **B2B multi-tenant self-serve** — orice firmă, izolată.
4. **Confidențialitate by design** — anonimizare PII spre AI, audit, retenție.

Maparea exactă produs→modul în [FIN-BACKLOG.md](FIN-BACKLOG.md).
