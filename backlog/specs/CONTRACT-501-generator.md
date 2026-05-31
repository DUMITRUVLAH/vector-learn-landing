---
id: CONTRACT-501
title: Generator de contracte — date din CRM + OCR buletin + PDF + număr auto
milestone: CONTRACT
phase: 1
priority: P0
core_ref: [referință UI owner — Generare Contracte]
tests: TEST-SCENARIOS.md#contract-501
depends_on: [CRM-111]
status: pending
---

# CONTRACT-501 — Generator de contracte (din CRM)

## Goal
O academie semnează contracte de prestări servicii cu fiecare client. Acum se fac manual în Word.
Modulul generează contractul **direct din CRM** (lead/student) sau de la zero, cu date pre-completate,
extragere automată din poză de buletin/ID (OCR), număr auto-generat și export PDF — exact ca în
referința de UI a owner-ului (ecranul „Generare Contracte").

## In scope
- **Rută `/app/contracts`** (pagină generator) + **listă „Contracte recente"** (sidebar).
- **Pas 1 — Datele beneficiarului:** tab „Foto Document" (upload poză buletin/ID → OCR extrage
  nume + IDNP/cod fiscal) și tab „Text Manual". OCR via endpoint server (stub configurabil: dacă
  nu e cheie AI, întoarce câmpuri goale + mesaj „completează manual" — nu blochează). Acceptă PF și PJ.
- **Pas 2 — Verifică & editează:** toggle **Persoană Fizică / Juridică**.
  - PF: Nume și Prenume, IDNP (nr. identificare).
  - PJ: Denumire companie, IDNO/cod fiscal, reprezentant + funcție.
  - **Detalii curs** (pre-completate din lead dacă vii din CRM): cursul, nr. ore, orar (text liber
    start/zile/ore), limbă, format (fizic/online), locație, preț, valută (MDL/EUR/RON), nr. persoane.
- **Număr contract auto-generat:** format `{PREFIX}{nr_zilnic}-{DD.MM.YYYY}` (ex. `VA1-31.05.2026`).
  Prefix configurabil per tenant (default din slug). `nr_zilnic` = al N-lea contract din ziua curentă.
- **Previzualizare + Generează PDF:** randează un template de contract (HTML→PDF) cu toate datele.
  Descărcabil. Salvat în `contracts` cu snapshot date.
- **Generare din CRM direct:** buton **„Generează contract"** pe cartonașul lead (`/app/leads/:id`)
  și pe cartonașul student → deschide generatorul pre-completat (nume, telefon, email, curs, valoare).
- Tabel `contracts` (`id, tenant_id, number, beneficiary_type(pf|pj), beneficiary_name, idn,
  company_name, company_idno, rep_name, rep_role, course, hours, schedule_text, language, format,
  location, price_cents, currency, persons, lead_id?, student_id?, pdf_url?, data JSONB, created_by,
  created_at`).
- Endpoints: `GET /api/contracts` (listă recentă, tenant-scoped), `POST /api/contracts` (creează +
  alocă număr), `GET /api/contracts/:id/pdf` (PDF), `POST /api/contracts/ocr` (upload → extrage).

## Out of scope
- Semnătură electronică / e-sign (fază viitoare). Plata legată de contract (rămâne Finanțe).
- Template-uri multiple de contract (un singur template standard acum; configurabil ulterior).

## Acceptance criteria
- [ ] Pagina `/app/contracts` cu Pas 1 (foto/manual) + Pas 2 (PF/PJ + detalii curs) + sidebar recent
- [ ] Număr auto-generat corect (`{prefix}{n}-{dată}`, n resetat zilnic), unic per tenant
- [ ] OCR endpoint: cu cheie → extrage nume+IDN; fără cheie → degradează grațios (nu 500)
- [ ] PDF generat conține toate câmpurile; descărcabil
- [ ] Buton „Generează contract" pe cartonaș lead + student → generator pre-completat
- [ ] `contracts` migrare generată + commisă (§3.5.1); `db:reset`+`db:seed` trec
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows` (§3.5.1)
- [ ] 0 axe critical/serious; dark mode OK; mobil-friendly

## Tests
`TEST-SCENARIOS.md#contract-501` — incl. [blocant]: număr auto unic/zilnic, create+list 200,
migration gate, PF/PJ render; [normal]: OCR degradare grațioasă, PDF conține câmpuri, pre-fill din lead.

## DoD
Standard (vezi BUILD-SEQUENCE). O fază = 1 PR (CLAUDE.md §0.2).
