---
id: FORMS-004
title: "Forms: logică condițională / branching (form_logic)"
milestone: FORMS
phase: 1
status: pending
depends_on: [FORMS-001, FORMS-002, FORMS-003]
slug: conditional-logic-branching
---

## Goal

Adaugă **logică de salt condițional** formularelor: tabelul `form_logic` stochează reguli
"dacă câmpul X satisface condiția C, sari la câmpul Y (sau termină formularul)". Adminul le
configurează din builder-ul FORMS-002. Renderer-ul public FORMS-003 le onorează când avansează
câmp cu câmp.

O migrare nouă (prefix strict > 0028, care e maxul actual pe branch).

**Reuse obligatoriu:**
- Schema existentă: `forms`, `formFields` din `server/db/schema/forms.ts` — `form_logic` e un
  tabel separat, referențiind `form_fields` cu FK cascade.
- Renderer public FORMS-003: `FormPublicPage.tsx` — adaugă hook `useFormLogic(fields, logic, answers)`
  care calculează câmpul următor; nu rescrie componenta.
- API admin FORMS-001/002: extinde `server/routes/forms.ts` cu 3 rute noi pentru logică.
- Client API FORMS-002: extinde `src/lib/api/forms.ts` cu funcții logică.

## In scope

### Migrare
- Fișier: `drizzle/0029_forms004_logic.sql` (prefix 0029 > max 0028).
- Conținut:
  ```sql
  CREATE TABLE IF NOT EXISTS form_logic (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    from_field_id UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    condition JSONB NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('jump_to_field', 'jump_to_end')),
    target_field_id UUID REFERENCES form_fields(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS form_logic_form_idx ON form_logic(form_id);
  CREATE INDEX IF NOT EXISTS form_logic_tenant_idx ON form_logic(tenant_id);
  ```
- `condition` JSONB schema: `{ operator: "eq"|"neq"|"contains"|"gt"|"lt"|"is_empty"|"is_not_empty", value?: string|number }`.
  Exemplu: `{ operator: "eq", value: "Nu" }` (pentru câmp yes_no).
- Nicio enum Postgres nouă (operator rămâne în JSONB, nu enum — mai flexibil).

### `server/db/schema/forms.ts` — extensie
- Adaugă tabelul `formLogic` cu Drizzle ORM (același fișier — secțiune nouă la final):
  - Coloane mapate exact ca SQL-ul de mai sus.
  - FK `fromFieldId` → `formFields.id` cascade delete, `targetFieldId` → `formFields.id` set null.
  - Index pe `(formId)`.
- Export `formLogic`, `FormLogic`, `NewFormLogic` din `server/db/schema/index.ts`.

### `server/routes/forms.ts` — extensie (3 rute noi)
- `GET /api/forms/:id/logic` → returnează toate regulile formularului (filtrate pe tenantId), ordonate `position`.
- `POST /api/forms/:id/logic` body `{ fromFieldId, condition, action, targetFieldId?, position? }`:
  - Validare: `action=jump_to_field` ↔ `targetFieldId` prezent; ambele câmpuri aparțin aceluiași formular+tenant.
  - Insert în `form_logic` → returnează `{ rule: FormLogic }`.
- `DELETE /api/forms/:id/logic/:ruleId` → tenant-safe, returnează `{ ok: true }`.

### `src/lib/api/forms.ts` — extensie
- Tip: `FormLogicCondition = { operator: "eq"|"neq"|"contains"|"gt"|"lt"|"is_empty"|"is_not_empty"; value?: string|number }`.
- Tip: `FormLogicRule = { id, formId, fromFieldId, condition: FormLogicCondition, action: "jump_to_field"|"jump_to_end", targetFieldId: string|null, position: number }`.
- `listLogicRules(formId)` → `GET /api/forms/:id/logic` → `{ rules: FormLogicRule[] }`.
- `addLogicRule(formId, payload)` → `POST /api/forms/:id/logic` → `{ rule: FormLogicRule }`.
- `deleteLogicRule(formId, ruleId)` → `DELETE /api/forms/:id/logic/:ruleId` → `{ ok: boolean }`.

### `src/lib/formLogic.ts` (nou — pur, fără dependențe React)
```typescript
// evaluateCondition(condition, answer) → boolean
// getNextFieldIndex(currentIdx, fields, logic, answers) → number | "end"
//   — iterează regulile `fromFieldId === fields[currentIdx].id`, le evaluează în ordinea `position`
//     și returnează indexul câmpului target (sau "end"); dacă nicio regulă nu se aplică → currentIdx+1
```
Testabil izolat (fără DB, fără fetch).

### `src/pages/app/FormBuilderPage.tsx` — extensie
- Buton "Logic" per câmp în lista stânga: deschide modal/dropdown inline cu regulile existente.
- Formular adăugare regulă:
  - Câmp sursă: afișat (câmpul curent, read-only).
  - Condiție: select operator + input valoare (opțional pentru `is_empty`/`is_not_empty`).
  - Acțiune: "Sari la câmpul..." (select cu câmpurile disponibile, excl. câmpul curent) sau
    "Termină formularul".
  - Buton "Adaugă regulă" → `addLogicRule`.
- Lista regulilor existente cu buton "Șterge" per regulă.
- `listLogicRules(formId)` încărcat la deschiderea builder-ului (sau la click "Logic").

### `src/pages/public/FormPublicPage.tsx` — extensie
- La mount, după `getPublicForm`, fetch și `listLogicRules(form.id)` — dar FĂRĂ autentificare
  (regulile logice sunt incluse în răspunsul `GET /api/public/forms/:slug` — extinde
  `publicForms.ts` să le includă). Modificare server: adaugă `logic` la răspunsul public.
- Importă `getNextFieldIndex` din `src/lib/formLogic.ts`.
- În handler "Continuă"/"Trimite": înlocuiește `currentIndex + 1` cu
  `getNextFieldIndex(currentIdx, fields, logicRules, answers)`.
- Dacă `getNextFieldIndex` returnează `"end"` → skip direct la submit.
- Câmpurile skipped prin logică nu sunt incluse în `answers` (sau incluse cu valoare null) și
  nu sunt validate ca required (omise din validare).

### `server/routes/publicForms.ts` — extensie mică
- La `GET /api/public/forms/:slug`, adaugă query `form_logic` filtrate pe `formId`; incluse
  ca `logic: FormLogicRule[]` în răspuns (clientul public nu face un al doilea request).

## Out of scope
- Logică bazată pe scor calculat (sum of ratings) — viitor.
- Mai mult de un nivel de nesting (reguli pe reguli) — viitor.
- UI de reordonare a regulilor — viitor.

## User stories
- Ca **manager**, vreau că dacă un vizitator răspunde "Nu" la "Ești deja înscris?", să sară
  direct la câmpul "Curs dorit" (omițând câmpuri irelevante), pentru că vreau conversii mai
  mari pe formulare.
- Ca **manager**, vreau să definesc reguli vizual în builder fără să scriu cod, pentru că nu
  am cunoștințe tehnice.
- Ca **vizitator**, vreau să văd doar întrebările relevante pentru răspunsurile mele, pentru
  că un formular personalizat e mai plăcut.
- Ca **manager**, vreau ca logica condițională să funcționeze și pe mobil în renderer-ul
  public, pentru că majoritatea vizitatorilor vin de pe telefon.

## Acceptance criteria
- AC1: Migrarea `0029_forms004_logic.sql` este committed, `db:reset && db:seed` trec.
- AC2: `POST /api/forms/:id/logic` cu `action=jump_to_field` + `targetFieldId` valid → 201 regulă creată.
- AC3: `POST /api/forms/:id/logic` cu `action=jump_to_field` fără `targetFieldId` → 400.
- AC4: `DELETE /api/forms/:id/logic/:ruleId` al unui tenant diferit → 404 (izolare tenant).
- AC5: `evaluateCondition({ operator: "eq", value: "Nu" }, "Nu")` → `true` (unit pur).
- AC6: `getNextFieldIndex` cu o regulă `eq:"Nu"` pe câmpul curent cu answer "Nu" → returnează
  indexul câmpului target (nu currentIdx+1).
- AC7: În renderer public, când o regulă se aplică, câmpul următor afișat este cel din regulă.
- AC8: Câmpurile skipped nu sunt validate ca required și nu blochează submit-ul.
- AC9: `GET /api/public/forms/:slug` include `logic: [...]` în răspuns.
- AC10: Builder afișează buton "Logic" per câmp; modal permite adăugare + ștergere regulă.

## Tests (Given/When/Then)
- **T-FORMS-004-1** [blocant] Given migrarea 0029, When `db:reset && db:seed`, Then succes fără eroare;
  `form_logic` tabelul există cu coloanele `condition` jsonb și `action` varchar cu CHECK.
- **T-FORMS-004-2** [blocant] Given funcția pură `evaluateCondition`, When operator="eq" value="Nu"
  și answer="Nu", Then `true`; când answer="Da", Then `false`.
- **T-FORMS-004-3** [blocant] Given `getNextFieldIndex` cu câmpuri [A,B,C] și regulă pe A:
  eq:"Da"→C, When answer A="Da", Then returnează 2 (index C); când answer A="Nu", Then returnează 1
  (default +1).
- **T-FORMS-004-4** [blocant] Given serverul pornit + user autentificat, When `POST /api/forms/:id/logic`
  cu payload valid, Then 201 + `{ rule: {...} }` (smoke API).
- **T-FORMS-004-5** [blocant] Given `POST /api/forms/:id/logic` cu `action=jump_to_field` și
  `targetFieldId` absent, When request, Then 400 (validare server).
- **T-FORMS-004-6** [blocant] Given un formular cu regulă: câmpul 1 eq:"Nu"→jump_to_end,
  When `GET /api/public/forms/:slug`, Then `logic` prezent în răspuns cu regula.
- **T-FORMS-004-7** [normal] Given `<FormBuilderPage />` cu un câmp, When click "Logic" pe câmp,
  Then modalul se deschide (render test cu mock).
- **T-FORMS-004-8** [blocant] Given tenant B care apelează `DELETE /api/forms/:id/logic/:ruleId`
  al tenantului A, When request, Then 404 (izolare tenant).
- **T-FORMS-004-9** [blocant] Given build + typecheck, When `npm run build`, Then zero erori TS/ESLint.

## DoD
Migrare committed + idempotentă; build+typecheck+lint curate; funcții pure `formLogic.ts` testate;
renderer public onorează regulile; builder permite configurarea regulilor; reviewer APPROVED;
persona reports salvate; commit pe feat/FORMS-faza-1.
