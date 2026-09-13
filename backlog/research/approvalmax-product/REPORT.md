# ApprovalMax — research produs (meniul "Product")

Scanare: 2026-08-29. Sursă: https://approvalmax.com/ — doar ramura **Product** din burger/mega-menu
(19 pagini). Fiecare pagină are text integral în `pages/*.md` și screenshot full-page în
`screenshots/*.png` (local, negitat — vezi `.gitignore`). Structura vizuală: `sitemap-tree.md`.

ApprovalMax = software de aprobare a cheltuielilor (AP automation), plug-in peste Xero / QuickBooks
Online / NetSuite. NU e o contabilitate — e "stratul de guvernanță" care stă între cerere și
contabilitate: cine aprobă, în ce ordine, cu ce control bugetar, cu ce urmă de audit.

---

## Approvals

### Multi-level approvals — `/features/approval-workflows`
**Problema**: aprobările pe email se pierd, nu au urmă de audit, nu impun politica de cheltuieli.
**Ce face**: lanțuri de aprobare configurabile (secvențial sau paralel), reguli pe sumă/furnizor/
departament, substituent automat când aprobatorul lipsește, reminder-e automate, raport de audit
atașat la fiecare tranzacție aprobată. Motorul de aprobare e identic indiferent de tipul documentului
(PO, factură, cheltuială) — "multi-level" nu e un feature separat, e cum funcționează orice workflow.
**Diferențiator explicit** (din FAQ): spre deosebire de aprobările native din Xero/QBO, oferă sign-off
multi-nivel nelimitat, rutare condițională, segregation of duties și audit trail complet, pe același
motor peste toate cele 3 platforme contabile.

### Approval channels — `/features/collaboration`
**Problema**: aprobatorul trebuie să fie la birou / logat în sistemul de contabilitate ca să aprobe.
**Ce face**: 4 canale de decizie — email (aprobi din inbox), Slack (din thread), web app, mobil
(iOS/Android, cu OCR încorporat pentru captură rapidă). Toate scriu în aceeași istorie de aprobare
(cine, ce acțiune, timestamp, comentarii). Aprobatorii nu au nevoie de licență în sistemul contabil.

---

## Workflows

### Purchase orders — `/ap-automation/purchase-order-software`
**Problema**: cheltuieli angajate înainte de aprobare; nimeni nu verifică bugetul înainte de comandă.
**Ce face**: solicitanții ridică PO-uri (sau se trag din contabilitate), rutare multi-rol pe
furnizor/sumă/tip produs, verificare buget live înainte de sign-off, matching bill-to-PO ca să nu
plătești ce nu ai comandat, PO aprobat se poate copia direct într-un bill (fără re-tastare).

### Vendors — `/features/approval-workflows/vendor-approvals`
**Problema**: furnizori adăugați direct în contabilitate fără verificare → date murdare, risc de
fraudă (cont bancar schimbat, IBAN greșit).
**Ce face**: workflow separat de onboarding furnizor — solicitantul propune, un alt rol verifică
detalii bancare/cod fiscal/categorii GL, abia apoi intră în Xero/QBO/NetSuite. Segregation of duties
strict (cine propune ≠ cine aprobă). Doar pentru furnizori NOI, nu update la existenți.

### Invoices — `/ap-automation/invoice-approval-software`
**Problema**: facturi urmărite manual prin email, coding greșit descoperit prea târziu.
**Ce face**: facturile intră prin Capture (OCR), creare directă, sau sincronizare din contabilitate;
rutare condițională pe furnizor/sumă/cod GL; flagging automat pentru duplicate, mismatch cu PO,
depășire buget; modificări post-aprobare sunt de asemenea flagate. Distincție utilă din FAQ: "AP
automation" = tot fluxul (captură→plată); "invoice approval" = doar stratul de control (cine
aprobă, în ce ordine, pe ce dovadă).

### Credit notes — `/features/approval-workflows/credit-note-approvals`
**Problema**: notele de credit (AP — de la furnizor, sau AR — către client) expiră necolectate sau
se emit fără aprobare.
**Ce face**: workflow separat pentru credit AP vs AR, OCR dedicat pentru notele de credit primite,
sincronizare cu Xero ca "Authorised" gata de reconciliere. Singura pagină din Product care e legată
explicit DOAR de Xero (nu QBO/NetSuite) — posibil scope limitat al feature-ului.

### Standalone workflows — `/features/approval-workflows/standalone-workflows`
**Problema**: deciziile care nu ating contabilitatea (contracte, concedii, acces IT, onboarding
furnizor) nu au niciun sistem — se pierd pe email.
**Ce face**: workflow-uri complet independente de integrarea contabilă — rulează 100% intern, cu
câmpuri custom (cod proiect, ID angajat, dată expirare) și raport PDF de audit. Practic motorul de
aprobare al ApprovalMax expus ca produs de sine stătător pentru orice tip de cerere, nu doar
financiară. **Cel mai apropiat de ce e deja PAR-ul vostru** — merită comparat direct.

### Expenses — `/ap-automation/expense-approval-software`
**Problema**: cheltuielile angajaților nu trec prin politică înainte să ajungă în contabilitate.
**Ce face**: cheltuieli create direct sau trase din NetSuite/Dext, rutare pe sumă/departament/
categorie, restricție pe ce payee/cont/categorie poate alege fiecare solicitant (relevant pentru
segregation of duties).

---

## Financial Controls

### Bill-to-PO matching — `/ap-automation/po-matching`
**Problema**: plătești ce ți se facturează, nu ce ai comandat — supra-facturări nedescoperite decât
la reconciliere.
**Ce face**: matching automat bill↔PO, auto-aprobare pentru facturi potrivite de la furnizori de
încredere, escaladare pentru cele nepotrivite, PO se închide singur la aprobarea ultimei facturi.
Auto-approve momentan disponibil doar pe QBO/NetSuite, Xero "coming soon" (semnal că integrarea Xero
e mai puțin matură pe acest feature specific).

### Audit readiness — `/features/audit-and-fraud-control`
**Problema**: pregătirea pentru audit e un sprint de reconstituit dovezi retroactiv.
**Ce face**: raport automat per document (cine, ce a văzut, când), rol dedicat "Auditor" read-only
(nu mai dai cont de admin unui auditor extern), detectare "bypass" — dacă cineva aprobă direct în
contabilitate, sistemul marchează gap-ul și alertează adminul, detectare duplicate înainte de
aprobare. Certificare ISO 27001 menționată explicit ca parte din "audit-ready".

### Segregation of duties — `/features/approval-workflows/segregation-of-duties`
**Problema**: "trust" nu e un control financiar — un singur om nu ar trebui să poată cere ȘI aproba.
**Ce face**: regulă hard-codată "requester ≠ approver" (nu bazată pe încredere), roluri cu acces
limitat strict la ce au nevoie (auditor/admin/requester), escaladare pentru decizii mari, condiție
"Requester" disponibilă direct în matricea de aprobare (poți ruta pe lângă cine a cerut).

### Platform security — `/features/security`
**Problema**: echipa financiară cere dovezi de securitate, nu doar promisiuni.
**Ce face**: ISO 27001, SSO (Xero/Intuit/Google/Microsoft), 2FA (obligatoriu implicit pentru org
conectate la Xero), auto-logout după 15 min inactivitate, date procesate în Azure Irlanda + backup
Olanda (fără transfer cross-border), Trust Center public cu rezultate pentest.

### Budget controls — `/ap-automation/budget-checking-software`
**Problema**: bugetele "alunecă" fără ca nimeni să observe până la raportarea de final de lună.
**Ce face**: fiecare linie de cheltuială mapată pe buget după cod cont/dată/categorie; sold rămas
calculat live (dedus la aprobare sau chiar în timpul aprobării); perioade flexibile (lunar/
trimestrial/anual/YTD, net sau brut); status buget NU poate fi condiție de rutare — doar informativ,
decizia rămâne a aprobatorului (limitare explicită din FAQ).

---

## Payments

### ApprovalMax Pay — `/features/approvalmax-pay`
**Problema**: plata aprobată tot trebuie procesată manual în alt sistem (banking portal separat).
**Ce face**: plătește facturi aprobate direct din ApprovalMax, în 30+ valute, prin Wallets
(conversie valutară, powered by Currencycloud/Visa) sau Open Banking (cont UK conectat, gratuit).
Batch până la 200 plăți într-un click. Permisiuni granulare (cine convertește valută vs cine aprobă
plata vs cine eliberează fondurile) — fără expunerea datelor bancare. **Limitare majoră**: doar
business-uri cu entitate/cont bancar UK, doar pe Xero. E un produs de plăți reglementat (nu e bancă,
dar mișcă bani reali) — cel mai riscant/costisitor feature de replicat.

## OCR

### ApprovalMax Capture — `/features/approvalmax-capture`
**Problema**: introducerea manuală a datelor din facturi e lentă și predispusă la erori.
**Ce face**: OCR nativ — extrage furnizor, număr factură, sume, taxe din documente trimise pe email
dedicat sau upload bulk; suportă 40+ limbi; documentele capturate intră automat în workflow-ul de
aprobare (fără pas manual între captură și aprobare). Ce procesează diferă pe platformă: Xero
(bills, PO, credit notes, facturi de vânzare), QBO (bills, expenses), NetSuite (doar bills).

---

## Integrations

### Xero / QuickBooks Online / NetSuite (`/integrations/xero`, `/integrations/quickbooks-online`,
`/integrations/netsuite`) + `/integrations` (all)
**Problema poziționată identic pe toate 3**: sistemul contabil nu are un strat de guvernanță — cine
aprobă, cu ce dovadă, înainte ca banii să iasă. ApprovalMax se poziționează explicit ca "the
approval layer your Xero/QBO/NetSuite business is missing", nu ca înlocuitor de contabilitate.
Structura mesajului e identică pe cele 3 pagini (Capture → Approve → Detect risk → Fraud/audit),
cu diferențe mici: pagina NetSuite pune accent pe reducerea costului de licențe adiționale +
viteză de aprobare (25% în 2h, 50% în 1 zi); pagina Xero e cea mai bogată în features Xero-native
(XPM, Tracking Categories); pagina QBO insistă pe "nu ai nevoie de licență QBO ca aprobator".
Pagina generică `/integrations` listează și integrări secundare: **Airwallex** (plăți UK/AU/NZ),
**Dext** (captură alternativă), **Slack** (aprobare din thread), plus API public.

---

## Ce înseamnă asta pentru PAR (modulul vostru de aprobare plăți)

PAR e deja conceptual foarte aproape de "Standalone workflows" + "Multi-level approvals" din
ApprovalMax — cerere → rutare pe aprobatori → audit trail → plată. Diferența structurală majoră:
ApprovalMax vinde motorul de aprobare ca STRAT peste un sistem contabil extern (Xero/QBO/NetSuite),
nu ca sistem contabil el însuși. Gap-uri vizibile față de PAR, în ordinea impactului:

1. **Bill-to-PO matching + budget checking live la momentul aprobării** — PAR nu are (după ce știu)
   verificare de buget vizibilă aprobatorului în momentul deciziei, nici matching automat bill↔PO.
2. **Rol Auditor read-only dedicat** — separat de admin, fără risc de modificare.
3. **Canal de aprobare prin Slack/email reply** — PAR are UI web; aprobare directă din email/Slack
   reduce fricțiunea pentru aprobatori ocazionali.
4. **"Bypass detection"** — dacă cineva schimbă ceva direct în sistemul financiar în afara fluxului,
   flag automat către admin. Un pattern de securitate reutilizabil.
5. **OCR/Capture ca produs separat, multi-limbă** — PAR/FinDesk au deja extractor AI; diferența e
   poziționarea ca feature de sine stătător, cu volum mare (email dedicat, upload bulk).
6. **ApprovalMax Pay** — cel mai complex de replicat (necesită parteneriat de plăți reglementat,
   gen Currencycloud); probabil ultimul pe listă, nu un gap de arhitectură ci de business.

Nu am făcut modificări de cod pe baza acestui research — e doar research, gata de folosit când
decideți ce construiți în PAR/FinDesk.
