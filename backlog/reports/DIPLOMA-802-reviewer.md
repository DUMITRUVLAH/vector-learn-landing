# DIPLOMA-802 Review — canvas-editor

**Cycle 1 — APPROVED**

## Design system compliance
- Semantic tokens only: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, etc. No hardcoded hex in UI (canvas field colors are from user config — permitted per spec).
- Consistent `rounded-md`, `rounded-lg` usage. No arbitrary Tailwind values.
- Dark mode: all surfaces use design tokens; canvas WYSIWYG is explicitly excepted per spec.

## Accessibility
- All buttons have `aria-label` or visible text.
- File upload uses `<label htmlFor>` pattern with `sr-only` class input.
- `role="button"` + `tabIndex={0}` + `onKeyDown` for the label acting as button.
- Color input has `aria-label`.
- Collapsible editor has `aria-expanded` + `aria-controls`.
- Zero `any` in implementation files.

## Integration
- `/app/diplome` route wired in App.tsx.
- `useCertificateTemplate` loads/saves via `/api/certificate-templates` (DIPLOMA-801).
- `listCohorts()` wired for cohort selection.
- `FieldsConfig` type shared between server schema and client API types.

## Tests
- T-DIPLOMA-802-1: normalizeCertificateText — PASS
- T-DIPLOMA-802-2: wrapText — PASS  
- T-DIPLOMA-802-3: template payload contains all fields + qr_code — PASS
- T-DIPLOMA-802-4: update field x/y from panel → onFieldsChange called — PASS

**Verdict: APPROVED**
