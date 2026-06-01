---
id: FORMS-002
title: "Forms: builder vizual (/app/forms + /app/forms/:id/edit)"
milestone: FORMS
phase: 1
status: pending
depends_on: [FORMS-001]
slug: visual-builder-ui
---

## Goal

Aduce **UI-ul de admin** pentru motorul de formulare din FORMS-001: o pagină listă `/app/forms` și un
builder vizual `/app/forms/:id/edit` cu panou de câmpuri reordonabile (drag-and-drop sau butoane
sus/jos), panou de configurare per câmp (tip, label, required, options, lead-mapping dropdown,
hidden + sourceParam), toggle publish, link de share și preview live.

Consumă **exclusiv** API-ul admin deja construit în FORMS-001. Nu modifică schema DB sau rutele
server. Nicio migrare nouă.

**Reuse obligatoriu (nu reinventa):**
- Clientul API: extinde `src/lib/api/forms.ts` (nou fișier — nu există încă); nu duplica fetch-uri
  manual în componente.
- Pattern AppShell + useSession + toast: identic cu `FeedbackPage.tsx`, `ContractsPage.tsx`.
- Icoane: Lucide React (deja instalat). Nu importa icon libraries noi.
- Design tokens Vector 365: `bg-card`, `border-border`, `text-foreground`, etc. — zero hex hardcodat.
- Drag-and-drop reorder: folosește lista de butoane sus/jos (simplu, fără @dnd-kit — nu adăuga
  dependențe noi). `PUT /api/forms/:id/fields/reorder` există deja.

## In scope

### `src/lib/api/forms.ts` (nou)
Tipuri TypeScript + funcții `fetch`-wrapper pentru toată suprafața admin FORMS-001:
- `listForms()` → `GET /api/forms` → `{ items: Form[] }`
- `createForm(payload)` → `POST /api/forms` → `{ form: Form }`
- `getForm(id)` → `GET /api/forms/:id` → `{ form: Form; fields: FormField[] }`
- `updateForm(id, patch)` → `PATCH /api/forms/:id` → `{ form: Form }`
- `deleteForm(id)` → `DELETE /api/forms/:id` → `{ ok: boolean }`
- `addField(formId, payload)` → `POST /api/forms/:id/fields` → `{ field: FormField }`
- `updateField(formId, fieldId, patch)` → `PATCH /api/forms/:id/fields/:fieldId` → `{ field: FormField }`
- `deleteField(formId, fieldId)` → `DELETE /api/forms/:id/fields/:fieldId` → `{ ok: boolean }`
- `reorderFields(formId, ids)` → `PUT /api/forms/:id/fields/reorder` → `{ ok: boolean }`
- `publishForm(formId)` → `POST /api/forms/:id/publish` → `{ form: Form }`
- `listSubmissions(formId)` → `GET /api/forms/:id/submissions` → `{ items: FormSubmission[] }`

Exportă tipurile: `Form`, `FormField`, `FormSubmission`, `FormFieldType`, `FormStatus`, `LeadMapping`.

### `src/pages/app/FormsPage.tsx` (nou)
- Lista formularelor tenantului (card grid sau tabel).
- Fiecare card: titlu, slug, status badge (draft/published/closed), nr. câmpuri, nr. submisii, data creat.
- Buton "Formular nou": deschide modal inline cu câmpurile `title` + `slug` (auto-generat din titlu,
  editabil), `description` opțional → `createForm` → navighează la `/app/forms/:id/edit`.
- Buton "Editează" pe card → navighează la `/app/forms/:id/edit`.
- Buton "Șterge" cu confirmare (modal sau inline confirm).
- Stare goală: ilustrație + text "Niciun formular creat. Creează primul." + buton.
- Sesiune neautentificată → redirect `/app/login`.

### `src/pages/app/FormBuilderPage.tsx` (nou)
- Layout 3-panouri (pe desktop):
  - **Stânga** (1/4): lista câmpurilor existente, reordonabile cu butoane ↑/↓; buton "Adaugă câmp"
    → dropdown cu tipurile disponibile (short_text, long_text, email, phone, number, single_choice,
    multiple_choice, dropdown, rating, yes_no, date, consent, hidden).
  - **Centru** (2/4): preview live (renderizează câmpurile ca le-ar vedea un vizitator — fără
    interacțiune, doar aspect; folosește aceleași componente de intrare Tailwind pentru fidelitate).
  - **Dreapta** (1/4): panou configurare câmpul selectat:
    - Label (text input)
    - Tip (select — editabil post-creare)
    - Required (checkbox)
    - Placeholder (text input, opțional)
    - Options (textarea CSV, vizibil doar pentru single_choice/multiple_choice/dropdown — split pe
      virgulă/newline, salvat ca `string[]`)
    - Lead Mapping (select: Fără mapare / Nume complet / Telefon / Email / Curs dorit / Tag / -)
    - Hidden (checkbox)
    - URL param (text input, vizibil doar când hidden=true)
    - Buton "Salvează câmp" → `updateField` → reload câmp în stânga

- **Header** formular:
  - Titlu editabil inline (click → input, blur/Enter → `updateForm`)
  - Slug afișat read-only (e.g. `#/f/inscriere-curs`)
  - Status badge
  - Buton "Publică" (activ doar când status=draft, dezactivat dacă 0 câmpuri) → `publishForm` →
    badge devine "publicat"
  - Buton "Link share" (copie URL public `#/f/:slug` în clipboard, cu toast confirmare)
  - Buton "← Înapoi" → navighează la `/app/forms`

- Pe mobil: o singura coloana, tab-uri "Câmpuri" | "Preview" | "Config câmp".

- Thank-you message + Redirect URL: secțiune "Setări submisie" în panoul dreapta când niciun câmp
  nu e selectat (sau buton "Setări formular" în header). Editabil, salvat cu `updateForm`.

### Routing (src/App.tsx)
- Adaugă import `FormsPage` și `FormBuilderPage`.
- Adaugă rute:
  - `/app/forms/:id/edit` (înainte de `/app/forms`) — `FormBuilderPage` cu `id` din path
  - `/app/forms` → `FormsPage`

### Nav (src/components/app/AppShell.tsx)
- Adaugă `{ label: "Formulare", href: "/app/forms", icon: ClipboardCheck }` (sau `FormInput` —
  orice Lucide disponibil) înainte de "Automatizări".

### Tests
- `src/lib/api/forms.test.ts`: unit-test `listForms` și `createForm` cu fetch mock — verifică URL
  și method corect.
- `src/pages/app/FormsPage.test.tsx`: render-without-crash cu fetch mock (listForms → `[]`);
  render-without-crash cu 2 forme mock.
- `src/pages/app/FormBuilderPage.test.tsx`: render-without-crash cu getForm mock; buton "Publică"
  este disabled când câmpuri = 0; click "↑" pe câmpul 2 apelează reorderFields cu ordinea inversată.

## Out of scope
- Drag-and-drop real (mouse/touch) cu @dnd-kit sau similar — butonele ↑/↓ sunt suficiente.
- Preview interactiv (cu submit) — doar render vizual.
- Analytics per formular (vizualizare submisii) — item separat FORMS-005.
- Logică condițională — FORMS-004.
- Embed code snippet — FORMS-005.

## User stories
- Ca **manager**, vreau să văd toate formularele mele într-o pagină `/app/forms`, pentru că vreau
  să le gestionez fără să caut prin meniuri.
- Ca **manager**, vreau să configurez câmpurile unui formular vizual (tip, label, mapare lead),
  pentru că vreau să construiesc formulare diferite pentru campanii diferite fără să scriu cod.
- Ca **manager**, vreau să public un formular cu un singur click și să copiez link-ul direct,
  pentru că vreau să-l trimit pe WhatsApp sau Instagram imediat.
- Ca **manager**, vreau să ordonez câmpurile formularului cu butoane ↑/↓, pentru că ordinea
  întrebărilor contează pentru rata de completare.

## Acceptance criteria
- AC1: `/app/forms` listează formularele tenantului autentificat; neautentificat → redirect login.
- AC2: "Formular nou" creează formularul și navighează la builder.
- AC3: În builder, pot adăuga un câmp tip `email` cu label "Adresa ta de email" și lead-mapping
  "Email" — câmpul apare în preview și în lista stânga.
- AC4: Butonele ↑/↓ reordonează câmpurile (apelează reorderFields); ordinea se reflectă în preview.
- AC5: Buton "Publică" activ doar când formularul are ≥ 1 câmp; după publish, badge = "publicat".
- AC6: Buton "Link share" copiază `window.location.origin + '/#/f/<slug>'` în clipboard + toast.
- AC7: Câmpul selectat în stânga populează panoul dreapta; modificările se salvează la click
  "Salvează câmp" sau blur (nu auto-save continuous care ar bate requesturi).
- AC8: Nav stânga afișează "Formulare" cu link funcțional.
- AC9: Zero `any` TypeScript, zero hex hardcodat, build + typecheck + lint curate.
- AC10: Pe mobil (375px) pagina e utilizabilă (tab-uri, niciun overflow orizontal).

## Tests (Given/When/Then)
- **T-FORMS-002-1** [blocant] Given serverul pornit + user autentificat, When `GET /api/forms`,
  Then 200 + `{ items: [] }` (smoke API care demonstrează că clientul API e corect wired).
- **T-FORMS-002-2** [blocant] Given `<FormsPage />` cu fetch mock care returnează `{ items: [] }`,
  When render, Then componenta se renderizează fără crash și afișează textul "Niciun formular".
- **T-FORMS-002-3** [blocant] Given `<FormsPage />` cu 2 forme mock, When render, Then 2 carduri
  vizibile cu titlurile corecte.
- **T-FORMS-002-4** [blocant] Given `<FormBuilderPage />` cu getForm mock (formular cu 0 câmpuri),
  When render, Then butonul "Publică" este disabled.
- **T-FORMS-002-5** [blocant] Given `<FormBuilderPage />` cu 2 câmpuri în getForm mock, When click
  "↑" pe câmpul cu position=1 (al doilea), Then `reorderFields` e apelat cu ordinea inversată.
- **T-FORMS-002-6** [normal] Given `<FormBuilderPage />` cu un câmp selectat tip single_choice,
  When render panoul dreapta, Then câmpul "Options" e vizibil; la tip short_text nu e vizibil.
- **T-FORMS-002-7** [normal] Given buton "Link share", When click, Then `navigator.clipboard.writeText`
  e apelat cu URL-ul corect (`/#/f/<slug>`).
- **T-FORMS-002-8** [blocant] Given typecheck + build, When `npm run build`, Then zero erori TypeScript
  și zero erori ESLint pe fișierele noi.

## DoD
Build+typecheck+lint curate; toate testele verzi; nav link funcțional; builder permite creare +
configurare câmp complet + publish + share link; reviewer APPROVED; persona reports salvate; commit
pe feat/FORMS-faza-1.
