---
id: COURSE-203
title: "Coduri promo cu discount (%) sau sumă fixă"
milestone: COURSE
phase: "2"
status: pending
depends_on: [COURSE-201]
slug: promo-codes
---

## Goal

Managerii pot crea coduri promoționale (e.g. "BACK2SCHOOL" = -20%). La crearea unei plăți,
recepționerul poate introduce codul promo pentru a aplica reducerea automat la suma facturată.
Codul are o dată de expirare și un număr maxim de utilizări.

**Reuse obligatoriu:**
- Tabela `payments` existentă — adaugă `promo_code_id` optional.
- Pattern FIN-601 pentru invoices (dacă reducerea se aplică și acolo).

## In scope

### Schema changes (migrare nouă)
- Tabelă `promo_codes`: `id, tenant_id, code (unique per tenant), discount_type (percent|fixed), discount_value, max_uses, used_count, expires_at, created_at, status`.
- `payments.promo_code_id` nullable FK.

### Backend
- `POST /api/promo-codes` — creare cod. Validare: code alphanumeric max 20, discount 1..100 pentru %, positive integer pentru fix.
- `GET /api/promo-codes` — lista cu used_count și status (active/expired/exhausted).
- `POST /api/promo-codes/:code/validate` — verifică un cod: returnează `{ valid: true, discountType, discountValue, expiresAt }` sau `{ valid: false, reason }`.
- La `POST /api/payments` — dacă `promoCode` e în body, aplică reducerea și salvează `promo_code_id`.

### Frontend
- Pagina `/app/promo-codes` sau tab în Settings: tabel cu coduri + buton creare.
- Form creare: code, discountType (%), discountValue, maxUses, expiresAt.
- La crearea plății (PaymentForm sau InvoiceForm): câmp "Cod promo" cu buton "Aplică" → reduce suma afișată.

## User stories
- Ca **Manager**, vreau să creez codul "BACK2SCHOOL" cu -20% pentru că ofer reducere la reinscrierea din septembrie.
- Ca **Recepționer**, vreau să introduc un cod promo la crearea facturii pentru că clientul l-a primit pe email.
- Ca **Manager**, vreau să văd de câte ori a fost folosit fiecare cod pentru că trebuie să raportez campania.
- Ca **Manager**, vreau ca un cod expirat să fie refuzat automat pentru că nu mai ofer acea promoție.

## Acceptance criteria
- AC1: POST /api/promo-codes creează codul cu discount și limite.
- AC2: POST /api/promo-codes/:code/validate returnează `{ valid: true/false }` cu motivul.
- AC3: Codul expirat sau epuizat returnează `{ valid: false, reason: "expired"|"exhausted" }`.
- AC4: La creare plată cu cod valid, suma e redusă și `promo_code_id` e salvat.
- AC5: Tenant-safe — codul altui tenant nu e accesibil.
- AC6: Build+typecheck+lint curate.

## Tests (Given/When/Then)
- **T-COURSE-203-1** [blocant] Given cod "SUMMER20" cu -20%, When POST validate, Then `{ valid: true, discountType: "percent", discountValue: 20 }`.
- **T-COURSE-203-2** [blocant] Given cod expirat, When POST validate, Then `{ valid: false, reason: "expired" }`.
- **T-COURSE-203-3** [blocant] Given cod cu max_uses=1 și used_count=1, When POST validate, Then `{ valid: false, reason: "exhausted" }`.
- **T-COURSE-203-4** [blocant] Given payment de 100 RON cu cod -20%, When POST /api/payments cu promoCode, Then amountCents = 8000.
- **T-COURSE-203-5** [blocant] Given user tenant B, When validate codul tenant A, Then `{ valid: false }` (nu leak cross-tenant).
- **T-COURSE-203-6** [normal] Given build, When `npm run build`, Then zero erori TypeScript.

## DoD
Build+typecheck+lint curate, tests verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/COURSE-faza-2-edit-archive`.
