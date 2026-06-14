# FinDesk — Secvența de build (driver pas-cu-pas pentru autopilot)

> **Șoferul autopilotului pentru FinDesk.** Construiești **un singur item odată**, în ordine. NU sări,
> NU comasa item-uri într-un commit, NU trece mai departe cu teste roșii (CLAUDE.md §0.2).
> Sursa de adevăr: [`FIN-CORE.md`](./FIN-CORE.md). Test de flux: [`FIN-FLOW-TEST.md`](./FIN-FLOW-TEST.md).
>
> **1 modul = 1 fază = 1 branch (`feat/FIN-<modul>-<slug>`) = 1 PR.** Commit separat per item
> (`feat(CORE-001): …`). Migrările pornesc de la `0116` (max pe `main` = `0115`); fiecare item care
> atinge schema generează următorul prefix secvențial.
>
> Un item e `done` doar dacă: cod livrat + scenariile lui `[blocant]` trec + reviewer APPROVED +
> integration-architect `CONNECTED` + build/typecheck/lint/test verzi. Altfel → fix; dacă eșuează
> structural → `blocked` cu raport.

## Faza 1 — `CORE` (Compania mea) → branch `feat/FIN-core`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `CORE-001` | Schema `finCore.ts` (fin_org_profile, fin_invoice_series, fin_members, fin_onboarding) + migrare 0116 + index export + seed firmă demo | 0116 | — |
| `CORE-002` | Roluri FinDesk + `requireFinRole` middleware + CRUD membri + invitații | — | CORE-001 |
| `CORE-003` | API profil firmă + serie de facturare (CRUD, numerotare secvențială) | — | CORE-001 |
| `CORE-004` | UI `/app/fin` shell + navigație module + gating pe rol (light/dark) | — | CORE-002 |
| `CORE-005` | Onboarding 3 pași (<10 min): firmă → parteneri → prima factură | — | CORE-003, CORE-004 |

## Faza 2 — `REGISTRY` (Cote & nomenclatoare) → `feat/FIN-registry`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `REGISTRY-001` | Schema `fin_tax_rates` + `fin_chart_of_accounts` + migrare + seed cote MD/RO 2026 | 0117 | CORE-001 |
| `REGISTRY-002` | API cote (read versionat după `effective_from`) + helper `rateAt(country,kind,date)` | — | REGISTRY-001 |
| `REGISTRY-003` | UI cote & plan de conturi (admin) + import plan de conturi per țară | — | REGISTRY-002, CORE-004 |

## Faza 3 — `PARTY` (Parteneri) → `feat/FIN-party`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `PARTY-001` | Schema `fin_parties` + `fin_party_contacts` + migrare + seed | 0118 | CORE-001 |
| `PARTY-002` | API parteneri (CRUD, kind client/supplier/both, validare IDNO/IBAN) | — | PARTY-001 |
| `PARTY-003` | Listă + fișă partener (venit cumulat, sold, aging — derivate) | — | PARTY-002, CORE-004 |
| `PARTY-004` | CRM financiar: segment, top clienți după venit, aging per partener | — | PARTY-003, BILL-001 |

## Faza 4 — `AGREEMENT` (Acorduri) → `feat/FIN-agreement`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `AGREEMENT-001` | Schema `fin_agreements` + `fin_agreement_services` + migrare | 0119 | PARTY-001 |
| `AGREEMENT-002` | API contracte + servicii (recurent/one-time, `next_bill_date`) | — | AGREEMENT-001 |
| `AGREEMENT-003` | UI contracte: listă, status, expirări, servicii recurente | — | AGREEMENT-002, CORE-004 |

## Faza 5 — `BILL` (Facturi) → `feat/FIN-bill`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `BILL-001` | Schema `fin_invoices` + `fin_invoice_lines` + `fin_invoice_reminders` + migrare | 0120 | CORE-001, PARTY-001 |
| `BILL-002` | API factură: emitere (din contract SAU ad-hoc), numerotare, TVA obligatoriu, statusuri | — | BILL-001, REGISTRY-002, AGREEMENT-001 |
| `BILL-003` | Aging 0-30/31-60/60+ + remindere de încasare (in-app+email) | — | BILL-002 |
| `BILL-004` | PDF factură (html2canvas, multi-limbă ro/ru/en, semnătură) + download | — | BILL-002 |
| `BILL-005` | UI facturi: listă (filtre/status/sume), editor, carduri rezumat | — | BILL-002, CORE-004 |

## Faza 6 — `EINV` (e-Factura SFS) → `feat/FIN-einv`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `EINV-001` | Schema `fin_einvoices` + `fin_sfs_settings` (secrete AES-256-GCM) + migrare | 0121 | BILL-001 |
| `EINV-002` | API trimitere SFS (reuse client SOAP existent), status, mock/test/prod, „ultimul test" | — | EINV-001, BILL-002 |
| `EINV-003` | UI e-Factura: listă, status, panou integrare SFS (conectare/mediu/test) | — | EINV-002, CORE-004 |

## Faza 7 — `SPEND` (Cheltuieli) → `feat/FIN-spend`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `SPEND-001` | Schema `fin_expenses` + `fin_expense_attachments` + migrare | 0122 | CORE-001, PARTY-001 |
| `SPEND-002` | API cheltuieli (categorii, TVA deductibil obligatoriu, status, source) | — | SPEND-001, REGISTRY-002 |
| `SPEND-003` | UI cheltuieli: listă, categorii, top furnizori, carduri | — | SPEND-002, CORE-004 |

## Faza 8 — `CAPTURE` (Documente AI) → `feat/FIN-capture`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `CAPTURE-001` | Schema `fin_captures` + migrare | 0123 | SPEND-001 |
| `CAPTURE-002` | Pipeline AI OCR (reuse `ai.ts`+`aiAuditLog`): extragere vendor/sumă/TVA/categorie + confidence | — | CAPTURE-001 |
| `CAPTURE-003` | UI confirmare (câmp↔valoare↔încredere) → 1-click devine cheltuială | — | CAPTURE-002, SPEND-002 |

## Faza 9 — `CASH` (Încasări) → `feat/FIN-cash`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `CASH-001` | Schema `fin_bank_transactions` + `fin_payments` + `fin_payment_allocations` + migrare | 0124 | BILL-001 |
| `CASH-002` | Import extras (CSV/MT940) + motor reconciliere (sumă+dată+ref) | — | CASH-001 |
| `CASH-003` | Alocare plată↔factură + credit nealocat per client + coada „nepotrivite" | — | CASH-002, BILL-002 |
| `CASH-004` | UI încasări: registru, donut alocări, link-uri de plată | — | CASH-003, CORE-004 |

## Faza 10 — `FISC` (TVA & declarații) → `feat/FIN-fisc`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `FISC-001` | Schema `fin_tax_periods` + `fin_tax_declarations` + migrare | 0125 | REGISTRY-001 |
| `FISC-002` | Motor TVA determinist (colectat[BILL] − deductibil[SPEND]) + impozit venit | — | FISC-001, BILL-002, SPEND-002 |
| `FISC-003` | Generare declarații (MD TVA12 / RO D394, D301) + export PDF | — | FISC-002 |
| `FISC-004` | UI TVA & declarații: perioade, breakdown, export | — | FISC-003, CORE-004 |

## Faza 11 — `PAY` (Salarii) → `feat/FIN-pay`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `PAY-001` | Schema `fin_employees` + `fin_payroll_runs` + `fin_payroll_items` + migrare | 0126 | CORE-001 |
| `PAY-002` | Motor salarii determinist brut↔net (cote din REGISTRY) + postare cheltuială auto | — | PAY-001, REGISTRY-002, SPEND-002 |
| `PAY-003` | UI salarizare: angajați, run lunar, state de plată, export | — | PAY-002, CORE-004 |

## Faza 12 — `ASSET` (Mijloace fixe) → `feat/FIN-asset`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `ASSET-001` | Schema `fin_assets` + `fin_depreciation_entries` + migrare | 0127 | CORE-001 |
| `ASSET-002` | Motor amortizare determinist (liniar/degresiv) + postare cheltuială auto | — | ASSET-001, SPEND-002 |
| `ASSET-003` | UI mijloace fixe: registru, amortizare lunară, casare | — | ASSET-002, CORE-004 |

## Faza 13 — `INSIGHT` (Tablou de bord) → `feat/FIN-insight`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `INSIGHT-001` | Schema `fin_saved_views` + `fin_narratives` + migrare | 0128 | CORE-001 |
| `INSIGHT-002` | API metrici (venituri/cheltuieli/profit/TVA/aging) + cashflow forecast 60z 3 scenarii | — | INSIGHT-001, BILL-002, SPEND-002, CASH-003, FISC-002 |
| `INSIGHT-003` | Narativ CFO AI (cifre din query real, anti-halucinație) | — | INSIGHT-002 |
| `INSIGHT-004` | UI dashboard: carduri, charts, top clienți/furnizori, vederi salvate | — | INSIGHT-002, CORE-004 |

## Faza 14 — `CALENDAR` (Calendar fiscal) → `feat/FIN-calendar`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `CALENDAR-001` | Schema `fin_obligations` + `fin_period_locks` + migrare | 0129 | FISC-001 |
| `CALENDAR-002` | Generator obligații (din profil fiscal + FISC + PAY) + remindere | — | CALENDAR-001, FISC-002, PAY-002 |
| `CALENDAR-003` | Period close (lock postări → imutabil) + UI calendar | — | CALENDAR-002, CORE-004 |

## Faza 15 — `MASS` (Operațiuni în masă) → `feat/FIN-mass`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `MASS-001` | Schema `fin_bulk_jobs` + `fin_bulk_rows` + migrare + runner async | 0130 | CORE-001 |
| `MASS-002` | Facturi recurente bulk (contracte active → N facturi → N e-facturi SFS) | — | MASS-001, AGREEMENT-002, BILL-002, EINV-002 |
| `MASS-003` | Import bulk (clienți/cheltuieli din CSV) + raport per rând + re-try | — | MASS-001, PARTY-002, SPEND-002 |
| `MASS-004` | UI operațiuni în masă: lansare job, progres, raport erori | — | MASS-002, CORE-004 |

## Faza 16 — `TRUST` (Securitate) → `feat/FIN-trust`
| Item | Titlu | Migr | Depinde |
|------|-------|------|---------|
| `TRUST-001` | Schema `fin_data_settings` + migrare + anonimizare PII înainte de prompt AI | 0131 | CORE-001, CAPTURE-002 |
| `TRUST-002` | Audit complet acțiuni AI + emitere (reuse aiAuditLog/auditLog) + log acces | — | TRUST-001 |
| `TRUST-003` | Export GDPR + retenție + UI setări securitate | — | TRUST-002, CORE-004 |

---

## Backlog descoperit (de notat, nu de construit pe furiș)
- `DIR` — director public de firme MD (SEO/lead-gen + autocomplete PARTY) — ambii concurenți îl au.
- Open banking (sync bancar automat, fără upload) — Sirius îl are; fază viitoare.
- Plată card/MIA + link de plată online — Sirius îl are.
- Multi-valută complet (revaluare, diferențe de curs).
- Export direct în 1C/SAGA/WinMentor.

## Total: ~58 item-uri în 16 faze. Specuri în `backlog/specs/<COD>-xxx.md`.
