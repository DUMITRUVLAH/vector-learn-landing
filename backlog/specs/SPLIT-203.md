---
id: SPLIT-203
title: "ITPark → FinDesk: rezident/companie ITPark leagă fin_parties; dosarul arată facturile FinDesk"
milestone: SPLIT
phase: "3"
depends_on: ["SPLIT-201"]
spec: "backlog/specs/SPLIT-203.md"
status: pending
attempts: 0
blockers: []
---

# SPLIT-203 — ITPark → FinDesk: legătură rezident ↔ partener FinDesk + facturile în dosar

## Goal
Un rezident/companie ITPark (dosar `itpark_engagements`) este legat la un `fin_parties` (coloana `fin_party_id` adăugată în SPLIT-201). Această legătură permite:
1. Dosarul ITPark să afișeze facturile FinDesk (`fin_invoices`) emise pentru acel partener.
2. Creare/asociere rapidă a partenerului FinDesk direct din dosarul ITPark.
Fără rescriere — se refolosesc paginile FinDesk existente (liste/detaliu facturi).

## Reguli critice
- Coloana `fin_party_id` pe `itpark_engagements` e deja adăugată prin SPLIT-201 — nu re-migra.
- Fără migrare nouă în acest item (dacă apare nevoia, prefix > 147).
- Reuse API-uri existente `GET /api/fin/invoices?party_id=<id>` dacă există, sau adaugă filtru.

## User stories
- Ca auditor ITPark, vreau să văd facturile emise rezidentului direct în dosarul lui ITPark, pentru că trebuie să verific venituri declarate vs facturi.
- Ca contabil, vreau să creez automat un partener FinDesk dintr-un dosar ITPark (IDNO + denumire precompletate), pentru că nu vreau să copiez datele manual.
- Ca CFO, vreau ca un rezident ITPark să aibă același profil în FinDesk, pentru că rapoartele financiare trebuie să fie coerente.
- Ca director, vreau ca dosarul ITPark să afișeze cheltuielile și facturile legate, pentru că ITPark și finanțele sunt același business.

## Acceptance criteria

### AC-1 API: facturi FinDesk pentru un partener ITPark
- `GET /api/fin/invoices?party_id=<fin_party_id>` returnează facturile tenantului pentru acel partener.
- Dacă ruta există deja → verificat că funcționează cu `party_id` filtru.
- Dacă nu există filtru `party_id` → adăugat în query handler (fără a rupe comportamentul existent fără filtru).
- Răspuns: array de `{ id, invoice_no, date, amount_cents, currency, status }`.

### AC-2 API: creare/asociere partener FinDesk din dosarul ITPark
- `POST /api/itpark/engagements/:id/link-party` — dacă nu există `fin_party_id`:
  - Creează `fin_parties` cu `name=engagement.residentName, idno=engagement.idno, kind='both', country='MD', tenant_id`.
  - Setează `itpark_engagements.fin_party_id = <new_party_id>`.
  - Răspuns: `{ fin_party_id, created: true }`.
- Dacă `fin_party_id` există deja → returnează `{ fin_party_id, created: false }` (nu duplica).

### AC-3 UI: secțiunea „FinDesk" în dosarul ITPark
- Pagina dosar ITPark (`/business/itpark/engagements/:id`) afișează o secțiune „FinDesk":
  - Dacă `fin_party_id` setat: afișează „Partener: <nume>" (link → `/business/fin/parties/:id`) + lista primelor 5 facturi (`fin_invoices`) pentru acel partener cu total + status.
  - Dacă `fin_party_id` null: buton „Creează/Asociere partener FinDesk" care declanșează `POST /link-party`.
  - Link „Vezi toate facturile →" → `/business/fin/invoices?party_id=<id>` (filtrare FinDesk).

### AC-4 UI: indicator ITPark în FinDesk
- Pagina detaliu partener FinDesk (`/business/fin/parties/:id`) — câmp opțional „Dosar ITPark":
  - Dacă `itpark_engagements` are `fin_party_id = <id>`: afișează link „Dosar ITPark: <resident_name> <year>" → `/business/itpark/engagements/:id`.
  - Implementat printr-un query simplu (`SELECT id, resident_name, reporting_year FROM itpark_engagements WHERE fin_party_id = $1 AND tenant_id = $2 LIMIT 1`).

### AC-5 Tenant isolation
- Toate query-urile filtrează `tenant_id` — un tenant nu vede partenerii/facturile altuia.

### AC-6 Date precompletate la creare partener
- Când `POST /link-party` creează un `fin_parties`, câmpurile `name` și `idno` vin din engagement, nu din request body — previne GDPR-leak prin body injection.

## Files to touch
- `server/routes/fin.ts` (sau fin-invoices route) — add/verify `party_id` query filter
- `server/routes/itpark.ts` (sau echivalent) — add `POST /engagements/:id/link-party`
- `server/routes/fin.ts` sau `server/routes/finParties.ts` — add ITPark back-link in party GET
- `src/pages/business/itpark/EngagementDetailPage.tsx` (sau echivalent) — add FinDesk section
- `src/pages/business/fin/PartyDetailPage.tsx` (sau echivalent) — add ITPark indicator

## Tests
- **T-203-1** [blocant] Given engagement cu `fin_party_id=null`, When `POST /api/itpark/engagements/:id/link-party`, Then `fin_parties` creat cu IDNO + name, `itpark_engagements.fin_party_id` setat, răspuns `{ created: true }`.
- **T-203-2** [blocant] Given engagement deja legat, When `POST /link-party` din nou, Then `{ created: false }` și niciun duplicat în `fin_parties`.
- **T-203-3** [blocant] Given partener cu `fin_party_id` setat, When `GET /api/fin/invoices?party_id=<id>`, Then returnează lista facturilor (poate fi goală dar status 200, nu 500).
- **T-203-4** [blocant] Given tenant_id diferit, When request la engagement altui tenant, Then 403/404.
- **T-203-5** [normal] Given engagement legat la un partener cu 2 facturi FinDesk, When pagina dosar ITPark, Then secțiunea „FinDesk" afișează cele 2 facturi.
- **T-203-6** [normal] Given pagina detaliu partener FinDesk legat la un engagement, When render, Then „Dosar ITPark: <name>" link vizibil.

## DoD
- [ ] API `POST /link-party` implementat (creare idempotentă partener)
- [ ] Filtru `party_id` pe GET invoices verificat/adăugat
- [ ] UI dosar ITPark: secțiunea FinDesk cu facturi + buton asociere
- [ ] UI partener FinDesk: indicator dosar ITPark
- [ ] Tenant isolation verificat
- [ ] `db:reset && db:seed` ✓ (fără migrare nouă dacă SPLIT-201 adusă)
- [ ] Reviewer APPROVED, integration-architect CONNECTED
- [ ] Persona reports salvate
