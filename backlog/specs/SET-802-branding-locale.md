---
id: SET-802
title: "Tenant branding + locale/timezone settings"
milestone: SET
phase: "1 — Settings Foundation"
priority: P0
slug: branding-locale
depends_on: [SET-801]
status: pending
---

# SET-802 — Tenant branding, locale, and timezone settings

## Goal

Give each tenant control over their visual identity (logo, primary color) and
regional settings (language, timezone). Logo appears in AppShell header; color
token `--primary` updates globally via CSS variable. Locale/timezone is saved per
user and used for date/time display across all modules.

## User stories

- Ca Owner, vreau să încarc logo-ul academiei și să setez culoarea primară, pentru că
  brandul meu trebuie să apară în UI când demonstrez clienților.
- Ca Admin, vreau să setez fusul orar al organizației (Europe/Bucharest default),
  pentru că orele lecțiilor trebuie să fie corecte pentru profesori și elevi.
- Ca User, vreau să schimb limba interfeței (ro/en), pentru că am colegi care preferă
  engleza.
- Ca Owner, vreau să previzualizez modificările de branding live, înainte să salvez,
  pentru că nu vreau surprize.

## Acceptance criteria

- [ ] `GET /api/settings/branding` — returnează `{ logoUrl, primaryColor, tenantName }`
- [ ] `PATCH /api/settings/branding` — body: `{ primaryColor, tenantName }`;
      actualizează tenant row; răspuns 200 cu datele noi
- [ ] `POST /api/settings/branding/logo` — multipart upload PNG/SVG max 2MB; stochează
      în `/public/uploads/logos/<tenantId>.<ext>` (sau stub local); returnează `logoUrl`
- [ ] `GET /api/settings/locale` — returnează `{ language: 'ro'|'en', timezone: string }`
      pentru userul curent
- [ ] `PATCH /api/settings/locale` — salvează `language` și `timezone` pe user row
- [ ] DB: adaugă coloanele `primary_color VARCHAR(7)` și `logo_url TEXT` la tabelul
      `tenants`; adaugă `language VARCHAR(5) DEFAULT 'ro'` și `timezone VARCHAR(50) DEFAULT
      'Europe/Bucharest'` la tabelul `users`; migrare comisă
- [ ] Pagina `/app/settings/branding`:
      - Upload logo (drag & drop sau click, preview imediat)
      - Color picker pentru culoarea primară (hex input + swatch)
      - Preview live: logo + culoare aplicată pe un mini-mockup (header simulat)
      - Input tenant name
      - Buton "Salvează"
- [ ] Pagina `/app/settings/locale` (sau tab pe aceeași pagină Settings):
      - Dropdown limbă (Română / English)
      - Dropdown timezone (lista principalelor TZ europene + UTC)
      - Buton "Salvează"
- [ ] După salvarea culorii primare, CSS variable `--color-primary` se actualizează în
      document (fără reload complet al paginii)
- [ ] Logo apare în AppShell header (înlocuiește textul "Vector Learn")
- [ ] Dark mode parity, zero hardcoded colors, semantic tokens only

## Files

### New files
- `server/routes/settings/branding.ts` — endpointuri branding + logo upload
- `server/routes/settings/locale.ts` — endpointuri locale/timezone
- `src/pages/settings/BrandingPage.tsx`
- `src/components/settings/LogoUploader.tsx`
- `src/components/settings/ColorPicker.tsx`
- `src/__tests__/settings/branding.test.ts`

### Modified files
- `server/db/schema/index.ts` — adaugă coloane la tenants + users (sau schema separată)
- `server/index.ts` — mount `/api/settings/branding` și `/api/settings/locale`
- `src/App.tsx` — ruta `/app/settings/branding`
- `src/components/layout/AppShell.tsx` — afișează logo tenant dacă există

## Tests

- **T-SET-802-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes
- **T-SET-802-2** [blocant] Given: admin logat, When: PATCH /api/settings/branding cu
  `{ primaryColor: "#2563EB", tenantName: "Test" }`, Then: 200 + datele actualizate în DB
- **T-SET-802-3** [blocant] Given: server pornit, When: POST /api/auth/login + GET
  /api/settings/branding, Then: 200 cu `{ logoUrl, primaryColor, tenantName }`
- **T-SET-802-4** [blocant] Given: rezultat DB, When: query `SELECT primary_color FROM
  tenants WHERE id = :tenantId`, Then: valoare string nu null (portabilitate Postgres/PGlite)
- **T-SET-802-5** [normal] Given: BrandingPage randată, When: user schimbă culoarea, Then:
  preview live actualizează culoarea fără submit
- **T-SET-802-6** [normal] Given: locale salvat "en", When: pagina se reîncarcă, Then:
  GET /api/settings/locale returnează `language: "en"`

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-SET-802-x trec
- [ ] Migration comisă (`drizzle/0035_set802_branding_locale.sql`)
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + GET /api/settings/branding → 200
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/SET-faza-1-settings`
