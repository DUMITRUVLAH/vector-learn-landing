---
id: CLIENTPORTAL-003
title: Portal client — upload documente + polish UX (logo tenant, mobile-first)
milestone: FIN
phase: "22"
status: pending
depends_on: [CLIENTPORTAL-002]
branch: feat/FIN-clientportal
spec_version: 1
---

## Goal

Completează portalul clientului cu: (1) upload documente de la client (contract semnat, bon fiscal)
stocat local și vizibil adminului; (2) polish UX — logo-ul tenantului din branding settings, loading
states, empty states, mesaje de eroare localizate în română; (3) admin poate vedea documentele
uploadate de client în interfața internă (pagina factură sau client-portal management).

## User stories

- Ca client B2B, vreau să upladez contractul semnat direct în portal, pentru că altfel trebuie să vin fizic sau să trimit prin email.
- Ca Andreea (director), vreau să văd în panoul admin ce documente a uploadat clientul, pentru că azi nu știu dacă le-a trimis sau nu.
- Ca Cristina, vreau ca portalul să arate logo-ul academiei, pentru că altfel pare o pagină dubioasă.
- Ca admin, vreau că portalul să funcționeze elegant pe telefon, pentru că Cristina îl deschide de pe iPhone.

## Acceptance criteria

1. Secțiunea "Documente" în `ClientPortalPage.tsx`:
   - Buton "Încarcă document" → input file (PDF, JPG, PNG, max 10MB)
   - `POST /api/fin/client-portal/documents?token=<uuid>` — public endpoint:
     - Validează token
     - Salvează fișierul în `uploads/client-docs/<tenantId>/<portalTokenId>/` (sau base64 în DB dacă storage FS nu e disponibil)
     - Creează înregistrare `fin_client_portal_documents` (tabel nou): `{id, tenant_id, portal_token_id, original_name, mime_type, size_bytes, storage_path, uploaded_at}`
   - Lista documentelor uploadate anterior (cu data și buton download)
   - `GET /api/fin/client-portal/documents?token=<uuid>` — public endpoint: listează documentele tokenului curent
2. Admin endpoint (cu auth): `GET /api/fin/client-portal/admin/documents?contactId=&companyId=` — listează toate documentele uploadate de un client.
3. Logo tenant: portalul apelează `GET /api/settings/branding` și afișează `logoUrl` dacă există; fallback text "Vector Learn".
4. Loading states pe toate fetch-urile (spinner sau skeleton), empty states cu ilustrație/text dacă nu există facturi/documente.
5. Migrare SQL handwritten pentru `fin_client_portal_documents`; `db:reset && db:seed` verzi.
6. Schema exportată în `server/db/schema/index.ts`.
7. Mesaje de eroare în română (ex: "Fișier prea mare", "Format neacceptat", "Link expirat").

## Files

### New
- `server/db/schema/finClientPortalDocuments.ts` — tabel fin_client_portal_documents
- `drizzle/<next_prefix>_fin_client_portal_documents.sql` — migrare handwritten
- `src/__tests__/fin/clientportal-003.test.tsx` — teste

### Modified
- `src/pages/ClientPortalPage.tsx` — adaugă secțiunea Documente + logo tenant + loading/empty states
- `server/routes/finClientPortal.ts` — adaugă POST /documents, GET /documents, GET /admin/documents
- `server/db/schema/index.ts` — export finClientPortalDocuments
- `drizzle/meta/_journal.json` — append entry nouă

## Tests

- **T-CLIENTPORTAL-003-1** [blocant] Given token valid, When POST /api/fin/client-portal/documents?token=<valid> cu fișier PDF mic, Then status 200 + JSON conține `{id, originalName, uploadedAt}`.
- **T-CLIENTPORTAL-003-2** [blocant] Given schema finClientPortalDocuments importată, When db.query.finClientPortalDocuments, Then nu aruncă TypeError.
- **T-CLIENTPORTAL-003-3** [blocant] Given ClientPortalPage cu documente existente, When render, Then lista documentelor apare fără crash.
- **T-CLIENTPORTAL-003-4** [normal] Given fișier mai mare de 10MB, When POST /documents?token=<valid>, Then status 413 + mesaj "Fișier prea mare".
- **T-CLIENTPORTAL-003-5** [normal] Given ClientPortalPage fără facturi/documente, When render, Then afișează mesaj empty-state, nu array gol/undefined.

## DoD

- [ ] Tabel `fin_client_portal_documents` în schema + migrare commitată
- [ ] Endpoint POST /documents uploadează și salvează fișier
- [ ] Endpoint GET /documents listează fișierele tokenului curent
- [ ] Admin endpoint listează documentele per client
- [ ] Logo tenant apare în portal
- [ ] Loading skeleton + empty states pe toate secțiunile
- [ ] Mesaje eroare în română
- [ ] Build + typecheck + lint fără erori noi
- [ ] db:reset + db:seed verzi
- [ ] Static guards verzi
