---
id: CRM-128
slug: empty-states-onboarding
phase: H
depends_on: [CRM-117, CRM-120]
milestone: CRM
---

# CRM-128 — Empty states + onboarding ghid primul lead

## Goal

Make the CRM feel welcoming and helpful to a brand-new user (zero data state). Replace blank/broken-looking
empty areas with encouraging illustrations + clear next-step CTAs. Add a lightweight onboarding
checklist that walks the academy director through adding their first lead, setting up a pipeline
stage, and sending a first message — turning a cold first-login into a quick win.

## User stories

- **US-CRM-128-1**: As a new academy director logging in for the first time I want to see a
  friendly empty state (not a blank table) with a "Add your first lead" CTA, so I know exactly
  what to do next.
- **US-CRM-128-2**: As a user I want an onboarding checklist (floating or sidebar) showing
  3–5 steps to complete setup, with each step checked off as I do it, so I feel progress and reach
  "activation" faster.
- **US-CRM-128-3**: As an existing user with data I want empty states to be invisible (no checklist,
  no "zero leads" banners), so the UI stays clean after onboarding is complete.

## Acceptance criteria

1. **EmptyKanban**: when all pipeline stages have 0 leads, the `LeadsPage` kanban shows a centred
   `EmptyLeads` component (SVG illustration + "Niciun lead încă · Adaugă primul lead" button that opens the create modal).
2. **EmptyListView**: when `LeadListView` (CRM-117) has 0 results *and* no active filters, show `EmptyLeads`. If filters are active and 0 results, show `EmptySearch` ("Niciun rezultat pentru filtrele aplicate · Șterge filtrele").
3. **EmptyToday**: `TodayDashboard` (CRM-120) when 0 tasks and 0 recent activity shows `EmptyToday` ("Totul e la zi! · Adaugă un task" button).
4. **EmptyAuditLog**: `AuditLogPage` (CRM-127) with 0 rows shows `EmptyAuditLog` ("Nicio activitate înregistrată încă").
5. **EmptyCadences**: `CadencesPage` (CRM-126) with 0 cadences shows `EmptyCadences` ("Niciun follow-up sequence · Crează primul").
6. **Onboarding checklist component** `OnboardingChecklist`:
   - Renders a collapsible floating card (bottom-right, above FAB if present) on the `DashboardPage` and `LeadsPage`.
   - 4 steps: (a) "Adaugă primul lead", (b) "Personalizează stadiile pipeline", (c) "Setează un template de mesaj", (d) "Trimite primul mesaj".
   - Each step has a `done` flag stored in `localStorage` key `vl_onboarding_<tenantId>_v1`.
   - Step is auto-marked done when the corresponding action occurs (lead created → step a, stage edited → step b, template created → step c, message sent → step d). Uses simple event emits from existing API calls.
   - When all 4 done, the checklist auto-dismisses (sets `dismissed=true` in localStorage) and never shows again.
   - User can manually dismiss ("Ascunde") at any time (also sets dismissed=true).
7. **Visibility rule**: `OnboardingChecklist` is only visible if: (a) tenant has < 5 leads total AND not dismissed. This prevents experienced users from ever seeing it.
8. **No backend changes required** — onboarding state is localStorage-only (fast, zero migration risk). Checklist step completion is triggered client-side by watching API call results already returned by existing hooks.
9. **Design**: empty state SVGs are inline SVG components (no external images). Use design system tokens (no hardcoded hex). Dark-mode compatible.
10. **A11y**: empty state containers have `role="status"` and `aria-live="polite"`. Onboarding checklist has `role="complementary"` with `aria-label="Ghid de pornire"`.

## Files to create / modify

**Frontend only (no backend / no migration needed):**
- `src/components/crm/EmptyLeads.tsx` — SVG + CTA for empty kanban/list
- `src/components/crm/EmptySearch.tsx` — "no results" for filtered list
- `src/components/crm/EmptyToday.tsx` — today dashboard empty
- `src/components/crm/EmptyAuditLog.tsx` — audit log empty
- `src/components/crm/EmptyCadences.tsx` — cadences page empty
- `src/components/crm/OnboardingChecklist.tsx` — floating checklist
- `src/pages/app/LeadsPage.tsx` — integrate EmptyLeads + EmptySearch + OnboardingChecklist
- `src/pages/app/DashboardPage.tsx` — integrate OnboardingChecklist
- `src/pages/app/AuditLogPage.tsx` — integrate EmptyAuditLog
- `src/pages/app/CadencesPage.tsx` — integrate EmptyCadences

**Tests:**
- `src/__tests__/crm/empty-states.test.tsx` — render tests for empty components + onboarding checklist localStorage logic

## Tests

- T-CRM-128-1 `[blocant]` EmptyLeads renders with correct text and CTA button when leads array is empty.
- T-CRM-128-2 `[blocant]` EmptySearch renders when filtered list is empty (filterActive=true).
- T-CRM-128-3 `[blocant]` OnboardingChecklist shows when tenant has < 5 leads and not dismissed; hidden when dismissed in localStorage.
- T-CRM-128-4 OnboardingChecklist step (a) auto-marks done after lead created event.
- T-CRM-128-5 OnboardingChecklist auto-dismisses when all 4 steps done.
- T-CRM-128-6 Build + typecheck + lint pass.

## DoD

- All acceptance criteria met.
- No migration needed (frontend-only).
- Build + typecheck + lint green.
- Unit tests green.
- Reviewer APPROVED.
- Persona reports saved.
- PR open on `feat/CRM-128-empty-states-onboarding`.
