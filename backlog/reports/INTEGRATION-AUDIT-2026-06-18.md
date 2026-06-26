# Business Suite — Audit de integrare între module

**Data:** 2026-06-18
**Scop:** harta tuturor combinațiilor posibile de comunicare între modulele din sidebar,
ce există deja, ce lipsește, și un plan prioritizat de implementare.
**Cerut de owner:** „vezi cum pot lega modulele între ele … analiză toate combinațiile posibile …
după setezi cum poate comunica între ele … implementezi tot cap-coadă."

---

## 0. Realitatea de bază (înainte de orice implementare)

| Metric | Valoare | Implicație |
|---|---|---|
| Rute `/business/*` | 52 | suprafață mare de UI |
| Routere API (`server/routes/*.ts`) | 71 | suprafață mare de backend |
| Tabele schema | 62 | model de date bogat |
| Fișiere de test | 253 | dar… |
| **Test files care PICĂ pe `main`** | **117 / 253** | baseline roșu — vezi §6 |
| Teste roșii | 58 | |
| Schema-drift gate | **roșu permanent** | `tenants.app_kind` + ~54 tabele fin/itpark lipsesc din migrări |

> ⚠️ **Concluzie de siguranță:** nu se pot face merge-uri automate nesupravegheate la `main`
> (= deploy la clientul plătitor) cu acest baseline. Un agent care merge „până trec testele"
> fie se blochează la roșul preexistent, fie maschează erori reale. Orice deploy se face
> supravegheat (cum s-au făcut PR #195/#196 azi). Vezi §6 pentru remedierea baseline-ului.

---

## 1. Modulele (din sidebar) și starea lor

| Modul | Rute principale | Date proprii | Comunică deja cu |
|---|---|---|---|
| **FinDesk — Facturi** | `/business/fin/invoices` | `fin_invoices`, `fin_invoice_lines` | Parteneri, Acorduri, e-Factura, Încasări |
| **FinDesk — e-Factura** | `/business/fin/einvoices` | `fin_einvoices` (1:1 cu factura) | Facturi (via `finInvoiceId`), SFS Moldova |
| **FinDesk — Cheltuieli** | `/business/fin/expenses` | `fin_expenses` | **PAR (via `parRequestId`)**, Captures, Mijloace fixe |
| **FinDesk — Încasări** | `/business/fin/payments` | `fin_payments`, `fin_payment_allocations` | Facturi, Bancă, **PAR (link-par)** |
| **FinDesk — Parteneri** | `/business/fin/parties` | `fin_parties`, `fin_party_contacts` | Facturi, Acorduri, Încasări |
| **FinDesk — Acorduri** | `/business/fin/agreements` | `fin_agreements`, `fin_agreement_services` | Parteneri, Facturi (recurring) |
| **FinDesk — Invoice Reporting (Captures)** | `/business/fin/captures` | `fin_captures`, `fin_capture_lines` | Cheltuieli, **AI captureExtractor** |
| **FinDesk — Reconciliere/Bancă** | `/business/fin/reconcile`, `/banklink` | `fin_bank_transactions` | Încasări, Facturi (matching) |
| **FinDesk — Registru/Buget/Stocuri/Active/Salarii/TVA** | `/business/fin/*` | ledger, budgets, inventory, assets, payroll, tax | parțial între ele |
| **PAR — Cereri de plată** | `/business/par` | `par_requests`, `par_*` | **Cheltuieli, Încasări** (link existent) |
| **ITPark — Rezidenți** | `/business/fin/itpark` | `itpark_*` | Parteneri (via `fin_party_id`) |
| **Document Merge** | `/business/docmerge` | docmerge templates | — (insulă, dar potențial mare) |

---

## 2. Integrări care EXISTĂ deja (nu se reconstruiesc)

1. **PAR → Cheltuieli (parțial):** `fin_expenses.parRequestId` + `LinkParDialog` + `finPaymentApproval`.
   O plată care necesită autorizare poate fi legată de un PAR aprobat.
2. **Factură → e-Factura:** `POST /api/fin/einvoices/:invoiceId/submit` trimite o factură FinDesk la SFS.
3. **Factură ↔ Parteneri/Acorduri:** `fin_invoices.partyId`, `agreementId`.
4. **Încasare ↔ Factură ↔ Bancă:** `fin_payment_allocations`, `bankTxId`, matching reconciliere.
5. **Captures → Cheltuieli (AI):** document urcat → `captureExtractor` extrage furnizor/sumă/IBAN/dată/clasă → cheltuială.
6. **Captures → Invoice matching:** `matchInvoiceToLines` (invoiceLineMatch.ts).
7. **ITPark ↔ Parteneri:** `itpark_engagements.fin_party_id`.

---

## 3. Matricea TUTUROR combinațiilor posibile (sursă → țintă)

Legendă: ✅ există · 🟡 parțial · ⭐ propus (valoare mare) · ➖ irelevant

| Sursă \ Țintă | Facturi | e-Factura | Cheltuieli | Încasări | Parteneri | Acorduri | Captures | Bancă | Stocuri | Active | DocMerge | Registru |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **PAR** | ⭐1 | ⭐2 | 🟡3 | ✅ | ⭐4 | ➖ | ⭐5 | ➖ | ⭐6 | ⭐7 | ⭐8 | 🟡 |
| **Captures** | 🟡 | ➖ | ✅ | ➖ | ⭐9 | ➖ | — | 🟡 | ➖ | ➖ | ➖ | 🟡 |
| **Facturi** | — | ✅ | ➖ | ✅ | ✅ | ✅ | ➖ | ✅ | ⭐10 | ➖ | ⭐11 | 🟡 |
| **Acorduri** | ⭐12 | ➖ | ➖ | ➖ | ✅ | — | ➖ | ➖ | ➖ | ➖ | ⭐ | ➖ |
| **Parteneri** | ✅ | ➖ | ⭐ | ✅ | — | ✅ | ⭐9 | ➖ | ➖ | ➖ | ⭐ | ➖ |
| **Bancă** | 🟡 | ➖ | ⭐ | ✅ | ➖ | ➖ | 🟡 | — | ➖ | ➖ | ➖ | 🟡 |
| **Stocuri** | ➖ | ➖ | ⭐ | ➖ | ➖ | ➖ | ➖ | ➖ | — | ⭐ | ➖ | 🟡 |

### Combinațiile ⭐ explicate (cele cu valoare reală):

- **⭐1 PAR → Factură:** dintr-un PAR aprobat (execute_payment), generează o factură FinDesk
  pre-completată (beneficiar→party, sumă, descriere din end_use). Pas necesar înainte de e-Factura.
- **⭐2 PAR → e-Factura:** după ⭐1, butonul „Trimite la e-Factura" pe PAR → creează factura → submit la SFS.
- **🟡3 PAR → Cheltuială:** există `parRequestId`; de completat: creare automată a cheltuielii la marcarea PAR „plătit".
- **⭐4 PAR → Partener:** la introducerea beneficiarului inline, oferă „Salvează ca partener" (reuse `fin_parties`),
  nu doar `par_vendors`. Unifică registrul de furnizori.
- **⭐5 PAR ← Captures (AUTO-COMPLETE):** urci un act de predare-primire / contract / factură pe PAR →
  `captureExtractor` extrage beneficiar+IBAN+sumă+dată → **pre-completează formularul PAR**.
  PAR are deja attachment kinds `act_of_receipt` și `contract`. **Acesta e exemplul 2 al owner-ului.**
- **⭐6 PAR → Stocuri:** dacă PAR e pentru bunuri, la recepție (`par_receipts`) → mișcare de stoc.
- **⭐7 PAR → Active:** dacă PAR e pentru un mijloc fix, creează `fin_assets` la plată.
- **⭐8 PAR → DocMerge:** generează automat actul de predare-primire / ordin de plată din datele PAR
  (template DocMerge + {{beneficiar}}, {{suma}}, {{iban}}). **Reverse al lui ⭐5.**
- **⭐9 Captures/Parteneri → Partener:** la extragerea unui furnizor nou dintr-un document, creează partenerul.
- **⭐10 Factură → Stoc:** factură de achiziție bunuri → intrare în stoc.
- **⭐11 Factură → DocMerge:** generează documente în masă din facturi.
- **⭐12 Acord → Factură:** facturare recurentă din serviciile acordului (menționat ca BILL-003 în cod).

---

## 4. Cele 2 fluxuri PAR prioritare (cerute explicit de owner)

### Flux A — PAR → e-Factura (⭐1 + ⭐2)
```
PAR aprobat (execute_payment)
  └─ buton "Generează factură" →  POST /api/fin/invoices  (party din beneficiar, 1 linie din total+end_use)
       └─ buton "Trimite la e-Factura" →  POST /api/fin/einvoices/:invoiceId/submit  → SFS Moldova
```
**Reuse:** `createInvoiceSchema`, `finEinvoices submit`, beneficiar PAR → `fin_parties` (find-or-create).
**Nou:** endpoint `POST /api/par/:id/to-invoice`, buton în ParDetail, mapping beneficiar→party.

### Flux B — Auto-complete PAR din document (⭐5)
```
ParCreateForm: "Încarcă document (contract / act predare-primire / factură)"
  └─ POST /api/par/extract  (reuse captureExtractor)
       └─ extrage: payeeName, payeeIban, amount, date, document_class
            └─ pre-completează câmpurile formularului (cu confidence + confirmare user)
```
**Reuse:** `captureExtractor` (deja extrage exact aceste câmpuri), PAR attachments.
**Nou:** endpoint `POST /api/par/extract`, UI de upload+preview în ParCreateForm, mapping câmpuri.

---

## 5. Plan de implementare prioritizat (cap-coadă)

| # | Item | Valoare | Efort | Risc | Reuse |
|---|---|---|---|---|---|
| 1 | **Flux B: auto-complete PAR din document** | 🔥 mare | mediu | mic | captureExtractor existent |
| 2 | **Flux A: PAR → factură → e-Factura** | 🔥 mare | mediu | mediu | invoice+einvoice existente |
| 3 | PAR → Partener unificat (⭐4) | mare | mic | mic | fin_parties |
| 4 | PAR → Cheltuială auto la „plătit" (🟡3) | mediu | mic | mic | parRequestId există |
| 5 | PAR → DocMerge act predare-primire (⭐8) | mediu | mediu | mic | docmerge templates |
| 6 | Acord → Factură recurentă (⭐12) | mediu | mediu | mediu | agreement services |
| 7 | Restul ⭐ (stocuri/active) | mic-mediu | variabil | mediu | — |

**Ordine recomandată:** 1 → 2 → 3 → 4 (acoperă exact cele 2 exemple ale owner-ului + unificarea
furnizorilor), fiecare = 1 branch + 1 PR + teste, livrat supravegheat.

---

## 6. Blocant de calitate: baseline roșu (de rezolvat ÎNAINTE de „testezi e2e tot")

Owner a cerut „testezi e2e fiecare buton … fixezi". Realitate: 117 test files pică deja. NU toate
sunt bug-uri reale — multe sunt:
- teste care ating `db` în jsdom (PGlite URL-scheme issue) — infra de test, nu prod
- schema-drift (cod are tabele pe care migrările nu le creează) — un task mare, separat

**Recomandare:** înainte de „fix every error", separă:
1. **Erori reale de runtime** (ce vede userul — butoane care dau 500/eroare) → fix prioritar
2. **Eșecuri de harness de test** (PGlite/jsdom) → fix de infra, nu de feature
3. **Schema-drift** → migrări reale, task dedicat (mare)

Un audit e2e „pe fiecare buton" trebuie rulat împotriva **aplicației reale** (real-browser smoke,
`scripts/e2e-*.mjs`), nu a suite-ului unit roșu.

---

## 7. Securitate & performanță (audit separat, după integrări)

Puncte de verificat (din CLAUDE.md §3.5.1 + practici):
- **Tenant isolation** pe fiecare nou endpoint de integrare (PAR→invoice nu trebuie să scurgă cross-tenant)
- **Webhook/callback financiar** (SFS) — verificare criptografică, AES-256-GCM la secrete (există `server/lib/crypto.ts`)
- **GDPR payee** — datele beneficiarului PAR sunt deja restricționate; păstrează la PAR→party
- **N+1 queries** pe noile join-uri cross-modul
- **Bundle** deja 2.8MB (warning la build) — code-splitting recomandat
- **Rate-limiting** pe endpoint-urile AI (captureExtractor costă bani per apel)

---

## 8. Ce se livrează diseară (supravegheat) vs. ce intră în plan

**Diseară, cât owner-ul e treaz (deploy supravegheat):** Item 1 (auto-complete PAR din document)
și/sau Item 2 (PAR→e-Factura), fiecare branch+PR, verificat în prod + smoke.

**În plan (PR-uri de revizuit):** Items 3-7, audit e2e pe aplicația reală, audit securitate+performanță,
remedierea baseline-ului de teste (§6).

**NU peste noapte nesupravegheat:** merge-uri la `main`. Motiv: §0 + istoricul din CLAUDE.md §3.5.1ter
(2026-06-02 prod-outage din merge-uri oarbe).
