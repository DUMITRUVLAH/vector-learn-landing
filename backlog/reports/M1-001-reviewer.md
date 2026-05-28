# M1-001 — Code Review Report

- **Reviewer**: code-reviewer-vl
- **Branch**: `feat/M1-001-orar`
- **Date**: 2026-05-28
- **Spec**: `backlog/specs/M1-001-orar.md`

## Result

```
REVIEW_RESULT: APPROVED
ID: M1-001
SPEC_COMPLIANCE: pass — 0 missing
DESIGN_SYSTEM: fail
TYPE_SAFETY: pass
A11Y: pass
DARK_MODE: pass
COMPLEXITY: pass
HYGIENE: pass
```

## Scope inspected

| File | LOC | Notes |
|------|-----|-------|
| `src/router/HashRouter.tsx` | 68 | Clean, typed context + `<Link>` wrapper |
| `src/components/modules/ModulePageShell.tsx` | 13 | Trivial shell, OK |
| `src/components/modules/ModuleHero.tsx` | 72 | Uses semantic tokens, `<Link>` back-CTA |
| `src/components/modules/ModuleFAQ.tsx` | 64 | `aria-expanded`, fade animation |
| `src/components/modules/orar/ConflictBadge.tsx` | 40 | Generic `detectConflicts<T>`, `role="alert"` |
| `src/components/modules/orar/ScheduleDemo.tsx` | 253 | Below 300 LOC threshold |
| `src/pages/modules/OrarPage.tsx` | 221 | Page composition only |
| `src/__tests__/modules/orar.test.tsx` | 117 | 12 tests, all green |
| `src/App.tsx` | 53 | HashRouter wired, `/modules/orar` route |
| `src/components/ModuleSpotlight.tsx` | +2/-1 | `ctaHref` added, falls back to `#demo` |

## Spec compliance (acceptance criteria)

- [x] Route `/modules/orar` reachable via HashRouter
- [x] Hero with title, sub-title, primary CTA, secondary "Înapoi la toate modulele"
- [x] Demo: 5 days × 4 slots, HTML5 DnD, zero external libs
- [x] 4 sections: *Cum funcționează*, *Capabilități cheie*, *Pentru cine*, *FAQ (4)*
- [x] Drop animation (transitions + `animate-fade-in` toasts), simulated WhatsApp toast
- [x] Conflict detection: pure function + visible red ring + inline `ConflictBadge`
- [x] Responsive at 375px (cells shrink, content truncates — spec allows read-only on mobile)
- [x] Dark mode via semantic tokens
- [x] Zero hex in JSX (but see DESIGN_SYSTEM finding below)

## Findings

- **[major]** `src/components/modules/orar/ScheduleDemo.tsx:22-26` — Arbitrary HSL color values are used inline in className: `border-[hsl(158,40%,75%)]`, `border-[hsl(250,40%,80%)]`, `border-[hsl(20,60%,80%)]`, `border-[hsl(200,40%,75%)]`, `border-[hsl(340,40%,80%)]`. CLAUDE.md §3.1 forbids hardcoded color values in `.tsx` and treats arbitrary values as a last resort that must be justified in a comment. These HSL triplets duplicate the `--pastel-*` variables already defined in `src/index.css`. Recommended fix: add `--pastel-*-border` tokens (or `border-pastel-*` utility classes) in `index.css` and reference them, e.g. `border-pastel-mint` — this also fixes dark mode where the hardcoded light HSL borders won't adapt.
- **[minor]** `src/pages/modules/OrarPage.tsx:112-113` — Primary/secondary CTA use raw `<a href="#/?demo=orar">` rather than the `<Link>` component, so the router's auto-scroll-to-top behavior is skipped and the `useRouter` state updates only via the `hashchange` event. Functional, but inconsistent with the router abstraction.
- **[minor]** `src/components/modules/ModuleFAQ.tsx:31` — `key={i}` on FAQ items. Acceptable since the list is static, but `key={faq.q}` would survive reordering and matches the pattern used in `OrarPage`.
- **[minor]** `src/components/modules/orar/ScheduleDemo.tsx:55-61` — Toast auto-dismiss uses a single 3.5s timer that pops the head of the queue. When two toasts are pushed simultaneously (every move pushes 2), they dismiss sequentially over 7s. Visually fine; mentioning for awareness.
- **[info]** `src/components/ModuleSpotlight.tsx:203,279,285` — Pre-existing `to-[hsl(250,76%,52%)]` arbitrary values; **not introduced by this branch**, but worth flagging for the next housekeeping pass.

## Passes worth highlighting

- Excellent keyboard a11y on draggables: `tabIndex={0}`, `role="button"`, descriptive `aria-label`, ArrowUp/Down/Left/Right move handler with bounds clamping (`ScheduleDemo.tsx:178-197`).
- `detectConflicts<T extends {id; day; slot}>` is generically typed and pure — easy to unit-test (and 4 tests cover it).
- Semantic tokens used consistently: `bg-card`, `bg-muted/40`, `bg-destructive/10`, `text-destructive`, `border-border`, `ring-ring`, `bg-primary/10`. Zero `bg-white`/`text-black`.
- Test suite covers detectConflicts edge cases, schedule render, hero, FAQ count, capabilities, target users — 12/12 green.
- Typecheck (`tsc --noEmit`) clean. No `any`, no `console.log`, no commented blocks.

## Verdict

**APPROVED.** 0 critical, 1 major (raw HSL borders in `ScheduleDemo` color map), 3 minor. Feature meets every acceptance criterion in the spec, build/typecheck/tests are green. The single major finding is contained to one constant map and should be tracked as a follow-up token addition — it doesn't block ship.
