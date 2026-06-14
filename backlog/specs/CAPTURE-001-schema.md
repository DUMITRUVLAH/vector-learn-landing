---
id: CAPTURE-001
title: "Schema fin_captures + migration 0120 + seed — infrastructura OCR AI"
milestone: FIN
phase: capture
depends_on: [SPEND-001]
branch: feat/FIN-capture
priority: P0
status: pending
spec_version: 1
---

## Goal

Creează schema `fin_captures` — tabelul care stochează propunerile AI extrase din bonuri/facturi
scanate (OCR). Fiecare câmp extras are confidence score [0..1]. Regulile FIN-CORE #4 și #5 sunt
lege: AI PROPUNE, omul CONFIRMĂ. AI nu inventează niciodată sume sau IBAN-uri.

Aceasta este fundația fazei CAPTURE. CAPTURE-002 (pipeline AI) se construiește pe această schemă.

## User stories

- **Ca** Contabil, **vreau să** încarc un bon/factură foto, **pentru că** nu vreau să tastez manual.
- **Ca** Director, **vreau să** văd câmpurile extrase de AI cu gradul de încredere,
  **pentru că** știu când să verific manual (confidence < 0.8).
- **Ca** Auditor, **vreau să** știu ce a propus AI-ul față de ce a confirmat omul,
  **pentru că** am trasabilitate completă pentru fiecare cheltuială.
- **Ca** Developer, **vreau să** am schema jsonb cu `extracted_fields` cu confidence per câmp,
  **pentru că** pot extinde câmpurile fără migrări viitoare.

## Acceptance criteria

1. Tabelul `fin_captures` conține:
   - `id` UUID PK
   - `tenant_id` UUID FK → tenants.id CASCADE
   - `expense_id` UUID FK → fin_expenses.id NULLABLE (null = neconfirmat încă)
   - `file_key` VARCHAR(500) — cheia fișierului original în storage
   - `file_name` VARCHAR(255)
   - `mime_type` VARCHAR(100)
   - `size_bytes` INTEGER
   - `status` ENUM('pending','processing','extracted','confirmed','failed')
   - `extracted_fields` JSONB — câmpuri extrase cu confidence
   - `raw_text` TEXT — text OCR brut (pentru debugging)
   - `error_message` TEXT NULLABLE — motivul eșecului
   - `confirmed_by` UUID FK → users.id NULLABLE
   - `confirmed_at` TIMESTAMPTZ NULLABLE
   - `created_by` UUID FK → users.id NOT NULL
   - `created_at`, `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
2. `extracted_fields` JSONB are structura:
   ```json
   {
     "vendor_name":    { "value": "Lidl SRL", "confidence": 0.92 },
     "amount_cents":   { "value": 15400,      "confidence": 0.97 },
     "vat_amount_cents":{ "value": 2567,      "confidence": 0.85 },
     "vat_deductible": { "value": true,       "confidence": 0.70 },
     "expense_date":   { "value": "2026-06-10","confidence": 0.95 },
     "iban":           { "value": "MD24AG...", "confidence": 0.60 },
     "category":       { "value": "supplies", "confidence": 0.78 }
   }
   ```
3. Migration `0120_fin_captures.sql` — with statement-breakpoints, IF NOT EXISTS guards.
4. `server/db/schema/finCaptures.ts` — exportat din `server/db/schema/index.ts`.
5. TypeScript types: `FinCapture`, `InsertFinCapture`, `CapturedField<T>` generic.
6. Seed: adaugă 2 capture-uri demonstrative cu status `extracted` în `server/db/seed.ts`.
7. `db:reset && db:seed` trec fără erori.

## Files

### New files
- `server/db/schema/finCaptures.ts`
- `drizzle/0120_fin_captures.sql`
- `server/__tests__/finCaptures.schema.test.ts`

### Modified files
- `server/db/schema/index.ts` — adaugă `export * from "./finCaptures";`
- `server/db/seed.ts` — adaugă 2 capture demo

## Tests

- **T-CAPTURE-001-1** [blocant] Given migration 0120 se rulează, When `db:reset && db:seed`, Then tabelul `fin_captures` există și seed-ul inserează 2 rânduri fără erori.
- **T-CAPTURE-001-2** [blocant] Given schema `finCaptures` e exportată din index.ts, When serverul pornește, Then `db.query.finCaptures` nu e undefined.
- **T-CAPTURE-001-3** [blocant] Given DB portability check, When query SELECT pe finCaptures, Then nu se folosește raw `.execute().rows` — se folosește query builder.
- **T-CAPTURE-001-4** [normal] Given `extracted_fields` JSONB, When inserez un capture cu toate câmpurile de confidence, Then citesc înapoi exact aceeași structură.
- **T-CAPTURE-001-5** [normal] Given enum `fin_capture_status`, When inserez status='confirmed', Then rândul se salvează corect.

## Definition of Done

- Migration 0120 committed și fără breakpoint errors.
- `server/db/schema/finCaptures.ts` exportat din index.
- `db:reset && db:seed` verzi.
- Branch `feat/FIN-capture` creat din `origin/main`.
