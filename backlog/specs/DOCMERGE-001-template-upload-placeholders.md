---
id: DOCMERGE-001
title: "Document Merge — upload template HTML/DOCX + detecție automată placeholdere {{tag}}"
milestone: DOCMERGE
phase: 1
status: pending
depends_on: []
slug: template-upload-placeholders
---

## Goal

Permite unui user (admin/manager) să **încarce un template de document** și sistemul să
**detecteze automat tag-urile / placeholderele** din el (`{{nume}}`, `{{suma}}`, `{{data}}`…),
ca apoi (în DOCMERGE-002/003) să încarce un Excel și să genereze N PDF-uri auto-completate.

Acesta e fundația modulului „Document Merge / Mass-PDF". Item-ul 001 acoperă DOAR:
schema + upload template + parsarea placeholderelor + preview render cu date demo.

**Reuse obligatoriu (NU reimplementa):**
- `extractVariables()` + `renderTemplate()` din `server/db/schema/templates.ts` — regex `{{\w+}}`
  e deja scris și testat (`src/__tests__/crm/templates.test.ts`). Mută/exportă logica într-un
  modul partajat `server/lib/docmerge/placeholders.ts` și refolosește-o; nu rescrie regex-ul.
- Pattern de generare PDF din HTML → Playwright din `server/routes/finInvoiceDoc.ts`
  (`buildInvoiceDocHtml` + rasterizare). Aici doar render-ul preview reia același pattern.
- AES/crypto NU e necesar (template-urile nu sunt secrete financiare).

## In scope

### Schema — `server/db/schema/docmergeTemplates.ts` (nou)

```ts
docmerge_templates (
  id uuid pk,
  tenant_id uuid not null references tenants on delete cascade,
  name varchar(200) not null,
  // formatul sursei: "html" (lipit/încărcat ca text) — DOCX se convertește la HTML la upload (002 extinde)
  source_format varchar(20) not null default 'html',
  // corpul template-ului ca HTML (cu {{placeholdere}} inline)
  body_html text not null,
  // placeholderele detectate, JSON array de string-uri: ["nume","suma","data"]
  placeholders text not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
// index pe tenant_id
```

- **OBLIGATORIU §3.5.1:** adaugă `export * from "./docmergeTemplates";` în
  `server/db/schema/index.ts` în ACELAȘI commit (altfel `db.query.docmergeTemplates` e `undefined` → 500).
- **OBLIGATORIU §3.5.1:** `npm run db:generate` → commit migrarea; prefix `>` max de pe `origin/main`.
  `db:reset && db:seed` trebuie să treacă.

### Lib — `server/lib/docmerge/placeholders.ts` (nou)
- `extractPlaceholders(body: string): string[]` — re-export/wrapper peste `extractVariables`
  (regex `{{\w+}}`, unice, în ordinea apariției).
- `renderWithContext(body: string, context: Record<string,string>): string` — wrapper peste
  `renderTemplate`; tag-urile nelegate rămân vizibile ca `{{tag}}` (nu se șterg).
- `sampleContext(placeholders: string[]): Record<string,string>` — date demo pentru preview
  (ex. `nume → "Maria Popescu"`, `suma → "1 500"`, `data → "2026-06-17"`; fallback `"{tag}"`).

### Routes — `server/routes/docmergeTemplates.ts` (nou), montat în `server/app.ts` (§3.5.1 route-mount)
- `POST /api/docmerge/templates` — body `{ name, bodyHtml }`. Detectează placeholderele,
  salvează, returnează `{ id, name, placeholders }`.
- `GET /api/docmerge/templates` — listă (id, name, placeholders, updatedAt) pentru tenant.
- `GET /api/docmerge/templates/:id` — un template complet (bodyHtml inclus).
- `PUT /api/docmerge/templates/:id` — actualizează `name`/`bodyHtml`, re-detectează placeholderele.
- `DELETE /api/docmerge/templates/:id`.
- `POST /api/docmerge/templates/:id/preview` — body opțional `{ context }`; întoarce
  `{ html }` = template randat cu `context` (sau `sampleContext` dacă lipsește).
- Toate sub tenant guard (același middleware ca celelalte rute `/api/*`).
- Mount: `app.route("/api/docmerge", docmergeTemplatesRoutes)` (rutele definesc `/templates*` intern —
  vezi nota din finCaptures despre dublarea segmentului; mount la `/api/docmerge`, NU `/api/docmerge/templates`).

### Frontend — pagină `src/pages/business/docmerge/DocMergeTemplatesPage.tsx` (nou)
Ancorată sub `/business/docmerge/*` (sidebar business corect — vezi memoria FinDesk: doar sub
`/business/*` apare meniul corect; `/app/*` arată meniul CRM). Wire în `App.tsx`:
`if (path.startsWith("/business/docmerge"))` → `<BusinessGuardPage>…</BusinessGuardPage>` (lazy).

- Listă template-uri (nume + nr. placeholdere detectate + acțiuni Edit/Delete).
- Buton „Template nou" → editor: câmp `name` + textarea mare pentru `bodyHtml`
  (cu hint „folosește `{{nume}}` pentru câmpurile care se completează din Excel").
- La salvare/typing (debounce): afișează chips cu placeholderele detectate live.
- Panou preview (iframe `srcdoc`) randat cu `sampleContext` — vede documentul cu date demo.
- Tokens Vector 365, dark mode, a11y (label pe textarea, `aria-label` pe icon-only buttons). Zero hex în `.tsx`.

### API client — `src/lib/api/docmerge.ts` (nou)
- `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `previewTemplate`.
- DB-portability §3.5.1: zero `.execute().rows` raw; folosește query builder.

## User stories
- Ca **Admin**, vreau să-mi lipesc/încarc un template de document cu `{{placeholdere}}`, pentru că
  vreau să generez ulterior zeci de PDF-uri din el fără să le scriu manual.
- Ca **Manager**, vreau să văd ce câmpuri a detectat sistemul în template, pentru că așa știu ce
  coloane trebuie să aibă Excel-ul meu.
- Ca **Admin**, vreau un preview cu date demo, pentru că vreau să verific layout-ul înainte de batch.

## Acceptance criteria
- AC1: `POST /api/docmerge/templates` cu body ce conține `{{nume}} {{suma}}` → `placeholders` = `["nume","suma"]`.
- AC2: Placeholderele duplicate se dedup (un singur `{{nume}}` în listă chiar dacă apare de 3 ori).
- AC3: Preview randează template-ul cu `sampleContext`; tag-urile nelegate rămân ca `{{tag}}`.
- AC4: Pagina e sub `/business/docmerge` cu sidebar business corect (nu CRM).
- AC5: Schema are migrare committed + `export *` în index.ts + ruta montată în app.ts (§3.5.1).
- AC6: Build+typecheck+lint curate; zero `any`; dark mode OK; zero hex în `.tsx`.

## Tests (Given/When/Then)
- **T-DOCMERGE-001-1** [blocant] Given body `"Salut {{nume}}, ai {{suma}} lei. {{nume}}"`, When `extractPlaceholders`, Then `["nume","suma"]` (dedup, în ordine).
- **T-DOCMERGE-001-2** [blocant] Given `renderWithContext` cu `{nume:"Ana"}` și body cu `{{nume}}` și `{{lipsa}}`, Then „Ana" înlocuit, `{{lipsa}}` rămâne literal.
- **T-DOCMERGE-001-3** [blocant] Given serverul pornit + user autentificat, When `POST /api/docmerge/templates` cu bodyHtml valid, Then 200 + `placeholders` corect (live API smoke).
- **T-DOCMERGE-001-4** [blocant] Given un template salvat, When `POST /api/docmerge/templates/:id/preview` fără context, Then 200 + `html` conține date demo (nu `{{` rămas pentru tag-uri cunoscute).
- **T-DOCMERGE-001-5** [blocant] Given `db:reset && db:seed`, When rulează, Then succes (migrarea aplică tabelul).
- **T-DOCMERGE-001-6** [blocant] Given render `<DocMergeTemplatesPage />`, When mount, Then fără crash + butonul „Template nou" vizibil.
- **T-DOCMERGE-001-7** [blocant] Given `npm run build`, Then zero erori TypeScript + `check-refs` + `check-route-mounts` verzi.

## DoD
Build+typecheck+lint curate, migrare gate verde, live API smoke verde, DB-portability verde,
reviewer APPROVED după review→improve loop, persona reports salvate,
commit pe `feat/DOCMERGE-faza-1-document-merge`.
