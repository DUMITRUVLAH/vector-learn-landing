# Integration Review — FORMS-005

**Verdict: CONNECTED**

## Module connections verified

### FORMS-005 → FORMS-001 (engine)
- `forms.views/starts/completions` adăugate pe tabelul existent cu `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `publicFormPingHandler` face UPDATE pe `forms` filtrat pe `slug` — același tabel ca FORMS-001
- `GET /api/forms/:id/analytics` aggregă `form_submissions` (creat în FORMS-001) pentru `leadsCreated`

### FORMS-005 → FORMS-002 (builder)
- `AnalyticsPanel` integrat în `FormBuilderPage.tsx` — accesibil prin butonul "Analitics + Embed"
- Folosește `formId` + `formSlug` din starea `form` existentă (fără state duplication)
- Tab "analytics" adăugat la tipul `activeTab` fără să rupă tab-urile existente

### FORMS-005 → FORMS-003 (renderer public)
- `FormPublicPage.tsx` importă `pingFormEvent` și face ping la mount + prima interacțiune
- Fire-and-forget: erorile de rețea ignorate silențios, UX-ul nu e blocat
- `startPingedRef` garantează că ping-ul start se trimite o singură dată per sesiune

### Tenant safety
- `GET /api/forms/:id/analytics`: verifică `forms.tenantId === user.tenantId` → 404 pentru alt tenant
- Endpoint public ping nu verifică tenant (intentionat — e un counter agregat per slug, nu per-tenant-data)
- `form_submissions` filtrat pe `tenantId` în query-ul `leadsCreated`

### Route order in app.ts
- `app.post("/api/public/forms/:slug/ping", publicFormPingHandler)` montat după `/api/public/forms/:slug/submit` și înainte de `tagRoutes` (care montează `requireAuth` global)
- Pattern consistent cu celelalte rute publice

### embed.js
- Servit din `public/` (Vite copiază în `dist/` la build)
- Nu importă niciun modul din node_modules — vanilla JS pur
- Funcționează independent de hash-router-ul React

## Gaps / Risks
- `completions` counter nu e incrementat încă (nu am adăugat incrementare la submit în publicForms.ts) — intentionat: analytics-ul calculează completions din `COUNT(form_submissions WHERE leadId IS NOT NULL)`. Dacă se doresc submisii non-lead ca completări, trebuie adăugat increment separat în viitor.
- Rate limiting minimal pe ping endpoint: nu există rate limiter explicit. Volumul mic al clienților actuali nu justifică overhead-ul unui rate limiter Redis. La creșterea traficului, se poate adăuga `hono/rate-limiter` sau un CDN-level limiter.

**Concluzie**: FORMS-005 se conectează corect la toate modulele FORMS anterioare. Nu creează noi tabele izolate — extinde tabelul `forms` existent. Tenant safety verificată.
