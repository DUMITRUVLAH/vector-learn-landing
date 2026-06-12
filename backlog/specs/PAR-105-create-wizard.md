---
id: PAR-105
title: "Wizard UI /app/par/new (header→clasificare→linii→end-use→payee→atașamente→review→submit)"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-102, PAR-103, PAR-104]
spec: backlog/specs/PAR-105-create-wizard.md
core: backlog/par/PAR-CORE.md
---

## Goal

Interfața de creare a unui PAR: un wizard pe pași care colectează toate datele secțiunilor 1–13 și la
final face submit (→ `pending_approval` prin motorul de rutare PAR-107). Vector 365, light + dark, WCAG AA,
folosibil pe telefon.

## User stories

- **Ca** requestor, **vreau** un formular ghidat pe pași, **pentru că** formularul are multe câmpuri și nu vreau să mă pierd.
- **Ca** requestor, **vreau** un pas de „review" înainte de submit, **pentru că** vreau să verific suma și beneficiarul.
- **Ca** requestor pe telefon, **vreau** ca wizardul să fie folosibil cu o mână, **pentru că** lucrez din teren.

## Acceptance criteria

- [ ] Ruta `/app/par/new` în `src/App.tsx`; pași: Antet (1–7) → Clasificare (8–9) → Linii (10) → End-use (11) → Payee (12) → Atașamente (13) → Review → Submit
- [ ] Selectoarele pentru department/project/budget code/vendor populate din API-urile PAR-003
- [ ] Editorul de linii cu auto-sumă live + afișarea „TOTAL ESTIMATED COST" + nota 10% când e peste prag
- [ ] Validare client + server-side error surfacing (IBAN/IDNP, end_use obligatoriu la execute_payment)
- [ ] Salvare draft în orice pas (`PATCH /api/par/:id`); Submit → `POST /api/par/:id/submit` → redirect `/app/par/:id`
- [ ] Doar tokens semantici Vector 365 (fără hex în .tsx); light + dark
- [ ] a11y: fiecare input cu `<label>`, butoane icon cu `aria-label`, touch targets ≥44px, 0 violări axe critical/serious
- [ ] Smoke test de randare + un test de interacțiune (completare → submit)

## Files

**New:**
- `src/pages/par/ParCreateWizard.tsx` (+ subcomponente: `ParHeaderStep`, `ParLineItemsStep`, `ParPayeeStep`, `ParReviewStep`)
- `src/lib/api/par.ts` — client API (create/get/patch/submit/line-items/attachments)
- `src/pages/par/__tests__/ParCreateWizard.test.tsx`

**Modified:**
- `src/App.tsx` — rută `/app/par/new`

## Tests

- **T-PAR-105-1** [blocant] Given `/app/par/new`, When randare, Then fără crash; pașii navigabili
- **T-PAR-105-2** [normal] Given completare + Submit, Then PAR → pending_approval + redirect
- **T-PAR-105-3** [blocant] a11y: labels + aria + 0 axe critical/serious
- **T-PAR-105-4** [normal] Dark mode lizibil; fără hex hardcodat

## DoD

- Build/typecheck verzi · reviewer APPROVED (design-system + a11y + dark) · persona-manager + persona-student salvate
