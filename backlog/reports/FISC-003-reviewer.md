# FISC-003 — Code Review

**Item**: FISC-003 — Generare declarații MD TVA12 / RO D394 + D301 + pagina /app/fin/tax
**Cycle**: 1
**Verdict**: APPROVED

## Checks

### Design system / a11y
- `TaxPage.tsx`: zero culori hex hardcodate — folosit `bg-green-100 text-green-800 dark:bg-green-900/30` pentru filed, `bg-amber-100 text-amber-800 dark:bg-amber-900/30` pentru ready, `bg-muted text-muted-foreground` pentru draft
- Dark mode: clase dark: prezente pe toate badge-urile de status
- WCAG: butoane cu `aria-label` explicite, `role="dialog"` pe modal, `role="alert"` pe erori, `role="status"` pe spinner
- Touch targets: butoane cu padding min 1.5 (py-1.5 px-2.5 = ~38px) — acceptabil
- Form inputs cu `<label>` asociat prin `htmlFor` — corect

### TypeScript
- `declarationGenerator.ts`: zero `any`, tipuri `TaxPayload`, `GenerateResult`, `ExportFormat` explicite
- `TaxPage.tsx`: zero `any`, tipuri locale pentru `TaxDeclaration` și `TaxPeriod`
- jsPDF tipuri funcționează în Node.js — testat

### PDF/CSV
- TVA12-MD PDF: conține TVA colectat, deductibil, de plată, impozit venit — corect
- D394-RO CSV: header ANAF corect, BOM UTF-8
- D301-RO CSV: un singur rând sumar — conform spec
- TVA12-MD CSV: indicatori în română, BOM UTF-8

### Route
- `GET /api/fin/tax/declarations/:id/export?format=pdf|csv` adăugat și funcțional
- Payload gol → 422 cu mesaj „Calculați mai întâi" — corect
- `PATCH /api/fin/tax/declarations/:id/file` — implementat în FISC-002, testat

### App.tsx
- Ruta `/app/fin/tax` adăugată corect

### Static guards
- route-mounts: PASS
- undefined-refs: PASS
- vite build: PASS

## Findings
Niciuna — implementarea curată.
