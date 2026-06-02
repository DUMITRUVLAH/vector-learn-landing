---
id: SET-803
title: Branding — logo upload + culori primare per tenant
milestone: SET
phase: "1"
branch: feat/SET-faza-1-settings
status: pending
attempts: 0
depends_on: [SET-801]
---

## Goal

Directorul poate personaliza aplicația cu logo-ul și culorile centrului său. Logo-ul se
stochează ca URL în coloana `tenants.logo_url`. Culorile se stochează ca JSON în
`tenants.branding_json`. La randare, CSS variables sunt suprascrise din `branding_json` pentru
a colora aplicația conform brandului tenantului.

## User stories

- Ca Owner, vreau să încarc logo-ul centrului meu, pentru că aplicația să arate ca a mea, nu generic.
- Ca Owner, vreau să setez culoarea primară (ex: albastru), pentru că identitatea vizuală a centrului meu e importantă.
- Ca User, vreau să văd preview live când owner-ul schimbă culorile, pentru că altfel e greu de ales.
- Ca Admin, vreau să resetez la default-urile Vector Learn, pentru că dacă clientul pleacă refolosim contul.

## Acceptance criteria

1. **Coloane pe `tenants`**: `logo_url VARCHAR(500)`, `branding_json JSONB` (ex: `{ "primaryColor": "#3B82F6", "accentColor": "#8B5CF6" }`). Migrare comisă.

2. **API `GET /api/settings/branding`** — returnează `{ logoUrl, brandingJson }` ale tenantului curent.

3. **API `PUT /api/settings/branding`** — actualizează `logo_url` și/sau `branding_json`. Validare: `primaryColor` și `accentColor` sunt hex valide (`/^#[0-9A-Fa-f]{6}$/`).

4. **API `POST /api/settings/branding/logo`** — acceptă `multipart/form-data` cu câmpul `file` (PNG/SVG/JPG, max 2MB). Stochează fișierul ca base64 URL în `logo_url` (nu S3 — MVP). Returnează `{ logoUrl }`.

5. **UI `/app/settings/branding`**:
   - Upload zona pentru logo (drag & drop sau click) cu preview.
   - Color picker simplu pentru `primaryColor` și `accentColor` (HTML `<input type="color">`).
   - Preview live — aplică CSS vars pe pagină.
   - Buton "Salvează" + buton "Resetează la default".

6. **AppShell**: dacă `branding_json.primaryColor` e setat, se injectează ca style tag cu `--primary: <hex>`.

## Files

### New
- `server/routes/brandingSettings.ts` — GET, PUT, POST /logo
- `src/pages/app/settings/BrandingPage.tsx` — UI
- `src/__tests__/settings/branding.test.tsx`

### Modified
- `server/db/schema/tenants.ts` — add logo_url + branding_json
- `server/app.ts` — mount brandingSettings routes
- `src/App.tsx` — route /app/settings/branding
- `src/components/app/AppShell.tsx` — link în settings section

## Tests

- **T-SET-803-1** [blocant] Migration: tenants.logo_url and branding_json columns exist.
- **T-SET-803-2** [blocant] PUT /api/settings/branding with invalid hex returns 400.
- **T-SET-803-3** [blocant] BrandingPage renders without crash.
- **T-SET-803-4** [normal] GET /api/settings/branding returns logoUrl and brandingJson fields.
- **T-SET-803-5** [normal] PUT with valid colors returns 200 with updated brandingJson.

## DoD

- [ ] Migration committed
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/SET-faza-1-settings`
