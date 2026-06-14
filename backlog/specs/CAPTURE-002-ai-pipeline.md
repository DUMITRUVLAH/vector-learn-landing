---
id: CAPTURE-002
title: "Pipeline AI OCR — extrage vendor/sumă/TVA/IBAN/categorie cu confidence; PROPUNERE nu adevăr"
milestone: FIN
phase: capture
depends_on: [CAPTURE-001]
branch: feat/FIN-capture
priority: P0
status: pending
spec_version: 1
---

## Goal

Implementează pipeline-ul AI care procesează un bon/factură scanat și extrage câmpurile financiare
cu grad de încredere. REFOLOSEȘTE `callAi` + `aiAuditLog` din `server/lib/ai/`. Regulile FIN-CORE
#4 și #5 sunt ABSOLUTE: AI propune, omul confirmă; AI nu inventează sume sau IBAN-uri. Orice
câmp cu confidence < 0.7 primește flag `"low_confidence": true`.

Aceasta este diferențiatorul față de competiție: niciun competitor local nu are OCR AI integrat
în CRM educațional.

## User stories

- **Ca** Contabil, **vreau să** uploadez o fotografie a bonului, **pentru că** AI extrage câmpurile
  automat și eu doar confirm sau corectez.
- **Ca** Director, **vreau să** văd confidence-ul pentru fiecare câmp extras,
  **pentru că** câmpurile cu confidence < 0.7 le verific manual.
- **Ca** Auditor, **vreau să** văd în ai_audit_log ce input a primit AI-ul și ce a returnat,
  **pentru că** am trasabilitate GDPR completă.
- **Ca** Developer, **vreau să** am mock mode (fără AI_API_KEY) care returnează date plauzibile,
  **pentru că** testele și demo-urile funcționează fără cont Anthropic.

## Acceptance criteria

1. **Route nouă**: `POST /api/fin/captures` — upload fișier (multipart/form-data), creează rând
   `fin_captures` cu status `processing`, declanșează extracția AI async (sau sync în test mode).
2. **Route**: `GET /api/fin/captures/:id` — returnează capture cu `extracted_fields` + status.
3. **Route**: `POST /api/fin/captures/:id/confirm` — marchează confirmed, creează `fin_expense`
   din câmpurile confirmate (cu valorile editate de utilizator dacă au modificat).
4. **Extracție AI** (`server/lib/ai/captureExtractor.ts`):
   - REFOLOSEȘTE `callAi` din `server/lib/ai/client.ts`.
   - Prompt engineering: trimite textul OCR brut (sau descrierea fișierului în mock) + instrucțiuni.
   - Returnează `extracted_fields` cu structura din CAPTURE-001 §2.
   - Orice câmp cu confidence < 0.7 → `low_confidence: true` adăugat în obiect.
   - AI nu inventează: dacă nu găsește IBAN, returnează `{ "value": null, "confidence": 0 }`.
5. **Mock mode**: dacă `AI_API_KEY` lipsește → stub returnat ca în `client.ts` pattern (nu fail, nu mock date inventate).
   Stub extract: `vendor_name.value = "Demo Furnizor SRL"`, `amount_cents.value = 10000`, toate confidence = 0.9.
6. **Audit**: fiecare apel `callAi` pentru extracție logat în `ai_audit_log` cu `action="capture_extract"`,
   `entity_type="fin_capture"`, `entity_id=captureId`.
7. **Tenant safety**: toate rutele filtrează strict după `user.tenantId`. Cross-tenant = 404.
8. **Rute montate** în `server/app.ts` sub `/api/fin`.
9. Route-mount check: `scripts/check-route-mounts.mjs` trece (ruta e montată).
10. Build + typecheck + lint verzi.

## Files

### New files
- `server/lib/ai/captureExtractor.ts` — logica extracție AI
- `server/routes/finCaptures.ts` — routes POST /captures, GET /captures/:id, POST /captures/:id/confirm
- `server/__tests__/finCaptures.api.test.ts` — unit tests cu mock AI

### Modified files
- `server/app.ts` — montează `finCapturesRoutes` la `/api/fin`
- `server/lib/ai/client.ts` — adaugă stub response pentru `action="capture_extract"` în `STUB_RESPONSES`

## Tests

- **T-CAPTURE-002-1** [blocant] Given server pornit, When `POST /api/auth/login` + `POST /api/fin/captures` cu un fișier valid, Then răspuns 201 cu `{ id, status: "processing" | "extracted" }`.
- **T-CAPTURE-002-2** [blocant] Given capture procesat (mock AI), When `GET /api/fin/captures/:id`, Then `extracted_fields` conține `vendor_name`, `amount_cents`, `vat_deductible`, fiecare cu `value` și `confidence`.
- **T-CAPTURE-002-3** [blocant] Given AI fără API_KEY (mock mode), When se extrage, Then stub returnat fără eroare, cu `confidence` valori > 0.
- **T-CAPTURE-002-4** [blocant] Given ruta `/api/fin/captures` e definită, When `check-route-mounts.mjs`, Then ruta e montată (nu 404 la build check).
- **T-CAPTURE-002-5** [normal] Given extracție completă, When `POST /api/fin/captures/:id/confirm`, Then se creează rând în `fin_expenses` cu câmpurile confirmate și status `draft`.
- **T-CAPTURE-002-6** [normal] Given apel AI pentru extracție, When logat în ai_audit_log, Then rândul are `action="capture_extract"` și `entity_type="fin_capture"`.
- **T-CAPTURE-002-7** [normal] Given utilizator din tenant A, When accesează capture din tenant B, Then răspuns 404 (nu 403, nu date cross-tenant).

## Definition of Done

- Build + typecheck + lint verzi.
- T-CAPTURE-002-1, T-CAPTURE-002-2, T-CAPTURE-002-3, T-CAPTURE-002-4 trec.
- Ruta montată în `server/app.ts`.
- `ai_audit_log` populat la fiecare extracție.
- Reviewer APPROVED.
