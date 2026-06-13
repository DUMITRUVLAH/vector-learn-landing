# ITPARK — Moldova IT Park Audit Toolkit · BACKLOG

> Modul dedicat (prioritar) care ajută contabilii/auditorii să completeze rapid dosarul de verificare
> anuală MITP: **Anexa 2, 3, 4 + scrisori de confirmare + declarație**, cu calcul automat al
> eligibilității (prag 70%), repartiție pe coduri CAEM și export PDF semnabil.
>
> **Sursă de adevăr comportamentală:** [ITPARK-CORE.md](ITPARK-CORE.md).
> **Secvență de build + teste:** [BUILD-SEQUENCE.md](BUILD-SEQUENCE.md) · [TEST-SCENARIOS.md](TEST-SCENARIOS.md).
> **Reguli:** 1 fază = 1 branch = 1 PR (§0.2); migrări pornesc la prefix **> max pe `origin/main`**
> în momentul build-ului (azi `0115_efactura_moldova` e pe `feat/EFMD` nemerged; dacă EFMD se
> merge înainte, ITPARK ia `0116`; dacă nu, ia `0115`). Nu hardcoda în advance. Reuse over rebuild.
> Rute sub `/app/fin/itpark/*`; API sub `/api/itpark/*`.

## Harta de legături (fără circularitate)
```
A. FUNDAȚIE   schema itpark + nomenclator CAEM (seed) + roluri + settings + migrare (prefix > max main)
   └─ B. DOSAR    Engagement CRUD (rezident, perioadă, an, regim TVA, firma audit) + listă
        └─ C. VENIT   Revenue lines (import CSV/lipire/din invoices) + cod CAEM auto-sugestie + lună
             └─ D. CALCUL  motor determinist: total/cod, pondere, eligibil vs total, prag 70%, Anexa 4
                  ├─ E. ANEXE   randare Anexa 2 / 3 / 4 (live, din calcul) + consistență cross-anexă
                  └─ F. SCRISORI scrisori confirmare + declarație (pre-completate) 
                       └─ G. EXPORT  PDF întreg pachet semnabil + status „Ready" + audit
                            └─ H. AI+POLISH  sugestie CAEM AI, OCR factură, dashboard conformitate
```

## Faze și item-uri

### Faza A — FUNDAȚIE (`feat/ITPARK-faza-A-fundatie`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-001 | Schema `itpark.ts` (toate tabelele CORE §2) + enums + migrare (prefix > max main) + index export | pending | [spec](../../specs/ITPARK-001-schema.md) |
| ITPARK-002 | Nomenclator CAEM versionat (`itpark_caem_codes`) + seed listă oficială MITP | pending | [spec](../../specs/ITPARK-002-caem-registry.md) |
| ITPARK-003 | Roluri ITPARK (contabil/auditor/viewer) + `itpark_settings` (prag 70%, toleranță) | pending | [spec](../../specs/ITPARK-003-roles-settings.md) |

### Faza B — DOSAR (`feat/ITPARK-faza-B-dosar`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-101 | API + UI Engagement CRUD (rezident, perioadă, an, TVA, firma audit) + listă dosare | pending | [spec](../../specs/ITPARK-101-engagement-crud.md) |
| ITPARK-102 | Wizard creare dosar (3 pași) + autocomplete date rezident din IDNO | pending | [spec](../../specs/ITPARK-102-engagement-wizard.md) |

### Faza C — VENIT (`feat/ITPARK-faza-C-venit`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-201 | Revenue lines CRUD + tabel editabil (client, documente, obiect, CAEM, sumă, lună) | pending | [spec](../../specs/ITPARK-201-revenue-lines.md) |
| ITPARK-202 | Import linii: lipire din clipboard + CSV + (opțional) din `invoices.ts` | pending | [spec](../../specs/ITPARK-202-revenue-import.md) |
| ITPARK-203 | Auto-sugestie cod CAEM din descrierea serviciului (determinist + override) | pending | [spec](../../specs/ITPARK-203-caem-suggest.md) |

### Faza D — CALCUL (`feat/ITPARK-faza-D-calcul`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-301 | Motor determinist: total/cod CAEM, pondere, eligibil vs total (server, testat) | pending | [spec](../../specs/ITPARK-301-calc-engine.md) |
| ITPARK-302 | Anexa 4 lunară (eligibil/total/cumulativ/pondere) + prag 70% + toleranță alertă | pending | [spec](../../specs/ITPARK-302-monthly-threshold.md) |

### Faza E — ANEXE (`feat/ITPARK-faza-E-anexe`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-401 | Randare live Anexa 2 (rânduri 1–10) din dosar + calcule | pending | [spec](../../specs/ITPARK-401-anexa2.md) |
| ITPARK-402 | Randare live Anexa 3 (linii + footer per cod + total) | pending | [spec](../../specs/ITPARK-402-anexa3.md) |
| ITPARK-403 | Randare live Anexa 4 (tabel lunar) + gate consistență cross-anexă | pending | [spec](../../specs/ITPARK-403-anexa4-consistency.md) |

### Faza F — SCRISORI (`feat/ITPARK-faza-F-scrisori`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-501 | Scrisori de confirmare (solvabilitate, adresă, subdiviziuni, activitate, ajustări) | pending | [spec](../../specs/ITPARK-501-confirmation-letters.md) |
| ITPARK-502 | Declarație pe proprie răspundere (art. 312 CP) pre-completată | pending | [spec](../../specs/ITPARK-502-self-declaration.md) |

### Faza G — EXPORT (`feat/ITPARK-faza-G-export`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-601 | Export PDF întreg pachet (Anexa 2,3,4 + scrisori) semnabil, diacritice corecte | pending | [spec](../../specs/ITPARK-601-pdf-export.md) |
| ITPARK-602 | Status dosar „Ready" (gate consistență) + checklist documente + audit + notificare | pending | [spec](../../specs/ITPARK-602-ready-checklist.md) |

### Faza H — AI & POLISH (`feat/ITPARK-faza-H-ai-polish`)
| ID | Titlu | Status | Spec |
|----|-------|--------|------|
| ITPARK-701 | Sugestie CAEM AI + OCR factură → linie venit (accelerator, confirmat de om) | pending | [spec](../../specs/ITPARK-701-ai-capture.md) |
| ITPARK-702 | Dashboard conformitate MITP (pondere YTD, risc prag, deadline aprilie) | pending | [spec](../../specs/ITPARK-702-compliance-dashboard.md) |

## Ordinea de build
```
A1 → A2 → A3 → B101 → B102 → C201 → C202 → C203 → D301 → D302
   → E401 → E402 → E403 → F501 → F502 → G601 → G602 → H701 → H702
```
Pornire de valoare rapidă (paritate cu munca manuală a contabilului): **A → B → C → D → E** livrează
deja anexele auto-calculate (90% din durere). F+G adaugă scrisorile + exportul. H e diferențiatorul AI.

## Backlog descoperit (de notat, nu de implementat pe furiș)
- DIR — autocomplete date rezident din director public de firme MD (SEO/lead-gen) — opțional.
- Multi-an: comparație pondere eligibilă an-la-an pentru același rezident.
- Import direct din SFS (e-Factura) a tuturor facturilor anului → linii Anexa 3 (când EINV e live).
