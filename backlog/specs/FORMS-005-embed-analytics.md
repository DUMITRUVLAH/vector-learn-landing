---
id: FORMS-005
title: "Forms: snippet embed + analytics per formular"
milestone: FORMS
phase: 1
status: pending
depends_on: [FORMS-001, FORMS-002, FORMS-003, FORMS-004]
slug: embed-analytics
---

## Goal

Ultimul item din faza FORMS: permite **embed-ul unui formular pe orice site extern** (iframe inline
sau popup) și oferă **statistici de bază per formular** (views/starts/completions/leadsCreated)
vizibile în builder-ul FORMS-002.

Cheia: snippet-ul se generează per formular cu slug; loader-ul public (`public/embed.js`) injectează
iframe-ul în pagina externă. Analytics-ul nu blochează submit-ul public și nu necesită autentificare
pentru ping-urile de view/start.

## In scope

### Schema `drizzle/0030_forms005_analytics.sql`
- Adaugă coloane pe tabelul `forms` (nu tabel separat — contoarele sunt per-formular, nu per-eveniment):
  ```sql
  ALTER TABLE forms ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE forms ADD COLUMN IF NOT EXISTS starts INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE forms ADD COLUMN IF NOT EXISTS completions INTEGER NOT NULL DEFAULT 0;
  ```
- Nu necesită enum-uri noi.
- `leads_created` se calculează din `form_submissions` la query time (count WHERE leadId IS NOT NULL).

### Schema Drizzle `server/db/schema/forms.ts`
- Adaugă câmpurile `views`, `starts`, `completions` (integer, notNull, default 0) la tabelul `forms`.

### Endpoint-uri publice (fără auth) — montate ÎNAINTE de tagRoutes în `server/app.ts`

**`POST /api/public/forms/:slug/ping`**
- Body: `{ event: "view" | "start" }` (altceva → 400)
- Rate-limit soft: indiferent de câte cereri vin, operația e `UPDATE forms SET views = views + 1` —
  lightweight, nu face query suplimentar, nu returnează date sensibile.
- Nu verifică dacă slug-ul există (să nu facă DB round-trip pentru fiecare view bot) — face UPDATE
  și returnează `{ ok: true }` indiferent (0 rânduri afectate = slug inexistent → ignorat silențios).
- Răspuns: `{ ok: true }`

### Endpoint admin (cu auth)

**`GET /api/forms/:id/analytics`** (adăugat în `server/routes/forms.ts`)
- Tenant-safe: verifică mai întâi că formularul aparține tenantului.
- Returnează:
  ```json
  {
    "views": 120,
    "starts": 45,
    "completions": 30,
    "completionRate": 0.667,
    "leadsCreated": 28
  }
  ```
- `completionRate` = completions / starts (0 dacă starts == 0).
- `leadsCreated` = `SELECT count(*) FROM form_submissions WHERE form_id=:id AND lead_id IS NOT NULL`

### Renderer public `src/pages/public/FormPublicPage.tsx`
- La mount (după ce formularul e încărcat cu succes): ping `POST /api/public/forms/:slug/ping` cu
  `{ event: "view" }` — fără await, fire-and-forget, eroarea ignorată.
- Când utilizatorul completează primul câmp (prima interacțiune cu un input): ping cu
  `{ event: "start" }` — o singură dată per sesiune (ref bool `startPinged`), fire-and-forget.
- `completions` sunt deja incrementate prin `form_submissions` — NU mai ping-uiesc `completion` —
  serverul numără submisiile cu `leadId IS NOT NULL` în query-ul analytics.

### Builder `src/pages/app/FormBuilderPage.tsx`
- Adaugă tab **"Analitics"** în bara de taburi mobilă și o secțiune în panoul desktop.
- Tab Analytics afișează (cu loading spinner):
  - Views, Starts, Completions (contoare simple)
  - Rată completare (ca procent, ex: 66.7%)
  - Leaduri create
  - Buton Actualizează
- Tab Analytics mai afișează secțiunea **Embed snippet**:
  - Două sub-tab-uri: "Iframe" și "Popup"
  - Iframe snippet (textarea readonly, copy-to-clipboard):
    ```html
    <!-- Vector Learn Forms — iframe embed -->
    <iframe
      src="https://DOMAIN/f/SLUG"
      width="100%"
      height="600"
      frameborder="0"
      allowtransparency="true"
      style="border:none;overflow:hidden"
      title="FORM_TITLE"
    ></iframe>
    ```
  - Popup snippet (textarea readonly, copy-to-clipboard):
    ```html
    <!-- Vector Learn Forms — popup embed -->
    <script>
      (function(){
        var s=document.createElement('script');
        s.src='https://DOMAIN/embed.js';
        s.dataset.formSlug='SLUG';
        s.dataset.mode='popup';
        s.dataset.buttonText='Înscrie-te';
        s.async=true;
        document.head.appendChild(s);
      })();
    </script>
    ```
  - `DOMAIN` = `window.location.origin` (detectat în runtime, nu hardcodat)
  - Buton "Copiază" lângă fiecare snippet

### Loader public `public/embed.js`
- Script-ul este servit static (în `public/`, nu în `src/`).
- La încărcare, citește `data-form-slug`, `data-mode` (iframe|popup), `data-button-text`.
- **Modul iframe** (default): injectează direct un `<iframe>` în locul `<script>` tag-ului.
- **Modul popup**: creează un `<button>` cu `data-button-text` care, la click, deschide un overlay
  modal cu `<iframe>` + buton X de închidere. Overlay e un `<div>` cu `position:fixed; inset:0;
  background:rgba(0,0,0,0.6); z-index:999999` + `<iframe>` centrat.
- Fără dependențe externe. Vanilla JS pur, < 1 KB gzipped.
- Accesibil: butonul popup are `aria-label="Deschide formularul"`, overlay are `role="dialog"`.

### API client `src/lib/api/forms.ts`
- `getFormAnalytics(formId: string): Promise<FormAnalytics>` — `GET /api/forms/:id/analytics`
- `FormAnalytics` interface: `{ views: number; starts: number; completions: number; completionRate: number; leadsCreated: number }`
- `pingFormEvent(slug: string, event: 'view' | 'start'): Promise<void>` — `POST /api/public/forms/:slug/ping`, fire-and-forget wrapper (nu aruncă)

## Out of scope
- Analytics granular (per-eveniment timestamp log, funnel pe câmpuri) — fază viitoare
- A/B testing embed-uri → fază viitoare
- Webhook pe submit → fază viitoare

## User stories
- Ca **manager de centru**, vreau să văd câte persoane au văzut / completat formularul, pentru că
  vreau să știu dacă formularul meu converteşte.
- Ca **manager**, vreau să copiez un snippet de embed pentru a posta formularul pe site-ul școlii,
  pentru că nu vreau să dau linkul raw — prefer un widget integrat.
- Ca **vizitator** pe site-ul extern, vreau să completez formularul în pagina curentă (iframe /
  popup), pentru că nu vreau să fiu redirectat pe o altă pagină.
- Ca **manager**, vreau să văd câte leaduri au fost create din formular, pentru că vreau să
  coroborez statisticile formularului cu pipeline-ul CRM.

## Acceptance criteria
- AC1: Snippet iframe și popup sunt generate corect cu slug-ul + domeniul formularului curent.
  Butonul "Copiază" pune textul în clipboard (cu toast confirmare).
- AC2: `GET /api/forms/:id/analytics` (autentificat) returnează `{ views, starts, completions,
  completionRate, leadsCreated }` cu valori corecte; tenant-safe (alt tenant → 404).
- AC3: `POST /api/public/forms/:slug/ping` (fără auth) cu `event: "view"` incrementează `forms.views`;
  cu `event: "start"` incrementează `forms.starts`. Răspunde `{ ok: true }`.
- AC4: Renderer public (`FormPublicPage`) trimite ping `view` la mount și ping `start` la prima
  interacțiune (o singură dată per sesiune, fire-and-forget, nu blochează UX).
- AC5: `public/embed.js` în mod iframe injectează `<iframe src="/f/SLUG">` funcțional;
  în mod popup creează buton + overlay modal cu iframe + buton de închidere.
- AC6: Tab "Analitics" în builder afișează contoarele și snippet-urile; se actualizează la
  apăsarea butonului Actualizează.
- AC7: Migrarea 0030 e hand-crafted, prefix unic (>0029), idempotentă (`ALTER TABLE ... ADD COLUMN
  IF NOT EXISTS`); `db:reset && db:seed` trec.
- AC8: Zero `any`, dark mode, tokenuri Vector 365, touch targets ≥ 44px.

## Tests (Given/When/Then)

- **T-FORMS-005-1** [blocant] Given migrarea 0030, When `db:reset && db:seed`, Then succes fără
  erori; coloanele `views/starts/completions` există pe tabelul `forms`.
- **T-FORMS-005-2** [blocant] Given serverul pornit + un formular published, When
  `POST /api/public/forms/:slug/ping` cu `{ event: "view" }` (fără auth), Then 200 `{ ok: true }`
  și `forms.views` a crescut cu 1.
- **T-FORMS-005-3** [blocant] Given serverul pornit + login admin, When
  `GET /api/forms/:id/analytics`, Then 200 cu `{ views, starts, completions, completionRate, leadsCreated }`.
- **T-FORMS-005-4** [blocant] Given analytics cerut de alt tenant, When `GET /api/forms/:id/analytics`,
  Then 404 (tenant-safe).
- **T-FORMS-005-5** [blocant] Given `public/embed.js` cu `data-mode="iframe"`, When scriptul
  rulează, Then injectează un element `<iframe>` în DOM.
- **T-FORMS-005-6** [normal] Given `public/embed.js` cu `data-mode="popup"`, When scriptul
  rulează, Then injectează un `<button>` care la click deschide un overlay cu `<iframe>`.
- **T-FORMS-005-7** [normal] Given FormBuilderPage cu tab Analytics, When se dă click pe
  "Actualizează", Then contoarele se reîncarcă din API.
- **T-FORMS-005-8** [normal] Given snippet-ul iframe în builder, When se apasă butonul Copiază,
  Then clipboard-ul conține string-ul cu `<iframe`.

## DoD
Build+typecheck+lint+unit verzi, migrare 0030 committed + idempotentă, live API smoke
(ping endpoint 200 fără auth, analytics endpoint 200 cu auth), reviewer APPROVED, persona
reports salvate, commit pe feat/FORMS-faza-1.
