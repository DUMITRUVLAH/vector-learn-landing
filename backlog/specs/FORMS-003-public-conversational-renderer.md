---
id: FORMS-003
title: "Forms: renderer public conversațional la /f/:slug"
milestone: FORMS
phase: 1
status: pending
depends_on: [FORMS-001, FORMS-002]
slug: public-conversational-renderer
---

## Goal

Aduce **UI-ul public** (fără autentificare) al unui formular publicat: o pagină `/f/:slug` care
renderizează câmpurile **unul câte unul** (flow conversațional gen Typeform) cu bară de progres,
navigare cu Enter sau buton "Continuă", buton "Înapoi", capturare automată UTM (`?utm_source=...`)
și parametri hidden din URL, submit la final, ecran thank-you / redirect.

Consumă `GET /api/public/forms/:slug` și `POST /api/public/forms/:slug/submit` din FORMS-001.
Nicio migrare. Nicio modificare server.

**Reuse obligatoriu:**
- `FeedbackPublicPage.tsx` este referința de pattern pentru pagini publice (fără AppShell, fără
  useSession, stilizare proprie cu Vector 365 tokens).
- Tipurile `Form` + `FormField` din `src/lib/api/forms.ts` (FORMS-002). Nu redefinești tipuri.
- `src/lib/api` helpers din FORMS-002 — extinde cu `getPublicForm(slug)` și `submitPublicForm(slug, body)`.

## In scope

### Extensie `src/lib/api/forms.ts`
- `getPublicForm(slug: string)` → `GET /api/public/forms/:slug` → `{ form: Form; fields: FormField[] }`
  (fără autentificare — fără header Authorization; folositești același wrapper `api()` cu
  `credentials: 'include'` omis sau cu opțiune `noAuth: true`).
- `submitPublicForm(slug: string, body: SubmitPayload)` → `POST /api/public/forms/:slug/submit`.
  `SubmitPayload = { answers: Record<string, unknown>; utm?: object; hidden?: Record<string, string> }`.
  Returnează `{ ok: boolean; leadCreated: boolean; leadId: string | null }`.

### `src/pages/public/FormPublicPage.tsx` (nou — fara AppShell)
#### Layout general
- Fundal `bg-background`, centrat, max-w-lg, padding responsive.
- Header mic: logo Vector Learn (importat din `<Logo />` sau SVG inline), titlu formular.
- Bară de progres liniară (0%–100%) sus, actualizată la fiecare pas.
- Footer discret: "Powered by Vector Learn" + link `/` (landing).

#### Flow one-question-at-a-time
- Câmpul curent ocupă centrul ecranului.
- Tipuri de input renderizate:
  - `short_text`: `<input type="text" />` + Enter avansează
  - `long_text`: `<textarea />` + Ctrl+Enter avansează (Enter = newline)
  - `email`: `<input type="email" />` + Enter; validare format email client-side (regex simplu)
    înainte de avansare
  - `phone`: `<input type="tel" />` + Enter
  - `number`: `<input type="number" />` + Enter
  - `single_choice`: lista de butoane radio stilizate (fiecare opțiune = card click → avansare automată)
  - `multiple_choice`: checkboxuri stilizate + buton "Continuă"
  - `dropdown`: `<select />` + buton "Continuă"
  - `rating`: stele 1–5 (click pe stea → setare valoare, buton "Continuă")
  - `yes_no`: două butoane mari "Da" / "Nu" — click → avansare automată
  - `date`: `<input type="date" />` + buton "Continuă"
  - `consent`: checkbox cu label (`field.label` = textul consimțământului) + buton "Continuă";
    câmp `required=true` → nu avansează dacă nebifat
  - `hidden`: nu afișat niciodată; valoarea e populată din URL param (`hiddenSourceParam`)
    la montarea componentei
- Buton "Continuă" (sau Enter):
  - Dacă câmpul e `required` și răspunsul e gol → afișează eroare inline ("Câmp obligatoriu")
  - Altfel → avansează la următorul câmp non-hidden
- Buton "Înapoi" (dezactivat la primul câmp): navighează la câmpul anterior non-hidden.
- Animație simplă de tranziție între câmpuri (fade-in/slide din dreapta) cu CSS transition + key
  React (nu framer-motion — nu adăuga dependențe noi).

#### Captare UTM + hidden params
- La mount, parsează `window.location.search` pentru `utm_source`, `utm_medium`, `utm_campaign`,
  `fbclid`, `gclid` — stocate în state `utm`.
- Câmpurile `hidden=true` cu `hiddenSourceParam` setat: caută param-ul cu același nume în URL și
  populează automat `answers[field.id]`.

#### Submit + ecran thank-you
- La ultimul câmp vizibil, buton "Trimite" în loc de "Continuă".
- La click "Trimite": POST cu `{ answers, utm, hidden: hiddenAnswers }` → `submitPublicForm`.
- **Loading state**: buton disabled + spinner cât timp requestul rulează.
- **Succes**:
  - Dacă `form.redirectUrl` setat → `window.location.href = redirectUrl` după 1s.
  - Altfel → ecran thank-you cu `form.thankYouMessage` (sau fallback "Mulțumim! Am primit
    răspunsul tău.") + buton "Completează un alt formular" (resetează state-ul componentei).
- **Eroare 400 `missing_required`**: afișează mesaj "Unele câmpuri obligatorii lipsesc." +
  revine la primul câmp cu eroare (dacă API-ul returnează lista fieldIds).
- **Eroare rețea / 5xx**: toast sau mesaj inline "Ceva nu a mers. Încearcă din nou." + buton retry.

#### Stare de încărcare + erori la fetch formular
- Loading spinner cât timp `getPublicForm` rulează.
- 404 (draft/closed/inexistent) → pagină "Formularul nu mai este disponibil." (fără AppShell).
- Eroare rețea → "Nu s-a putut încărca formularul. Reîncarcă pagina."

### Routing (src/App.tsx)
- Adaugă import `FormPublicPage`.
- Adaugă rută `/f/:slug` (regex `^\/f\/[^/]+$`) înainte de fallback HomePage,
  DUPĂ rutele `/app/*` și `/feedback/*`.
- Extras `slug = path.split("/")[2]`.

### Accesibilitate + mobile-first
- Touch targets ≥ 44px pentru toate butoanele.
- `aria-label` pe butoanele icon-only.
- `aria-live="polite"` pe zona de eroare (anunț screen-reader).
- Font size ≥ 16px pe mobile (previne zoom iOS).
- Testare la 375px: niciun overflow orizontal.

### Tests
- `src/lib/api/forms.test.ts`: extinde cu `getPublicForm` (fetch mock) și `submitPublicForm`
  (fetch mock cu body).
- `src/pages/public/FormPublicPage.test.tsx`:
  - Render-without-crash cu 1 câmp mock (getPublicForm mock).
  - Câmpul required → nu avansează fără valoare (eroare "Câmp obligatoriu").
  - Submit apelează `submitPublicForm` cu answers corecte.
  - 404 formular → afișează mesajul de "nu mai e disponibil".

## Out of scope
- Logică condițională (salturi de câmpuri) — FORMS-004.
- Analytics de vizualizare per pas (drop-off) — FORMS-005.
- Salvare parțială (partial submission) — viitor.
- File upload — viitor.

## User stories
- Ca **vizitator** (potențial client), vreau să completez formularul fără cont, câmp cu câmp,
  pentru că e mai puțin intimidant decât un formular lung.
- Ca **manager**, vreau că UTM-ul vizitatorului să fie capturat automat, pentru că vreau să știu
  din ce sursă vine lead-ul.
- Ca **vizitator**, vreau să mă pot întoarce la întrebarea anterioară, pentru că uneori greșesc.
- Ca **manager**, vreau să configurez un mesaj de mulțumire sau un redirect după submit, pentru
  că vreau o experiență personalizată pentru fiecare campanie.

## Acceptance criteria
- AC1: `/f/<slug>` cu formular published se încarcă și afișează primul câmp.
- AC2: `/f/<slug>` cu formular draft/inexistent → pagina "Formularul nu mai este disponibil."
- AC3: Câmp required necompletat → eroare inline, nu avansează.
- AC4: La final, click "Trimite" → request POST cu answers + utm → ecran thank-you.
- AC5: UTM din URL (`?utm_source=facebook`) → inclus în payload-ul submit.
- AC6: Câmp hidden cu `hiddenSourceParam=source` și `?source=insta` în URL → populat automat
  în answers, trimis la submit, dar NU afișat vizitatorului.
- AC7: `thankYouMessage` setat → afișat în ecranul de succes.
- AC8: `redirectUrl` setat → redirect după 1s la succes.
- AC9: Mobile 375px: niciun overflow orizontal, touch targets ≥ 44px.
- AC10: Zero `any`, zero hex hardcodat, dark mode funcțional.

## Tests (Given/When/Then)
- **T-FORMS-003-1** [blocant] Given serverul pornit + formular published cu 1 câmp email,
  When `GET /api/public/forms/:slug`, Then 200 + form + fields (smoke API).
- **T-FORMS-003-2** [blocant] Given `<FormPublicPage slug="test" />` cu getPublicForm mock (1 câmp),
  When render, Then componenta se renderizează fără crash și afișează titlul formularului.
- **T-FORMS-003-3** [blocant] Given câmp `required=true` și răspuns gol, When click "Continuă",
  Then eroarea "Câmp obligatoriu" apare și componenta nu avansează la câmpul următor.
- **T-FORMS-003-4** [blocant] Given formular cu 1 câmp completat, When click "Trimite",
  Then `submitPublicForm` e apelat cu `{ answers: { [fieldId]: valoare }, utm: {...} }`.
- **T-FORMS-003-5** [blocant] Given getPublicForm mock care returnează 404,
  When render `<FormPublicPage />`, Then afișează "Formularul nu mai este disponibil."
- **T-FORMS-003-6** [normal] Given URL `?utm_source=facebook&utm_campaign=vara`,
  When mount `<FormPublicPage />`, Then state-ul `utm` = `{ source: "facebook", campaign: "vara" }`.
- **T-FORMS-003-7** [normal] Given câmp hidden cu `hiddenSourceParam="src"` și URL `?src=insta`,
  When mount, Then `answers[fieldId]` = "insta" (populat automat).
- **T-FORMS-003-8** [blocant] Given build + typecheck, When `npm run build`, Then zero erori TS/ESLint.

## DoD
Build+typecheck+lint curate; toate testele verzi; renderer public funcțional end-to-end (load →
completare → submit → thank-you); UTM capturat; câmpuri hidden populate; mobil-first 375px fără
overflow; reviewer APPROVED; persona reports salvate; commit pe feat/FORMS-faza-1.
