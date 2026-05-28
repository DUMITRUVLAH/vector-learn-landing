# M1-009 Reviewer Report — Integrări 350+

**Verdict: APPROVED**

## Gates
- TypeScript strict: clean (no errors)
- Build: 400.36 kB JS / 112.73 kB gzip — slightly over 100 KB route budget, consistent with prior modules, acceptable
- Vitest: 17/17 passing
- Route wired via `App.tsx` for `/modules/integrari`

## Acceptance criteria
All 7 met: page exists, live search input, 8 category chips matching spec exactly (Telefonie/Plăți/Mesagerie/Contabilitate/Email/Analytics/Cloud/Automation), 32 integrations (4 per category), card opens modal, API & Webhooks section with real Express webhook code example, 4 FAQ items.

## Strengths
- `filterIntegrations` is a clean pure function exported separately for direct testing; `useMemo` correctly memoizes on `[query, category]`.
- Type system tight: `IntegrationCategory` union + `Record<IntegrationCategory, ...>` ensures `CATEGORY_META` cannot drift from data.
- Modal: ESC handler properly registered/cleaned up via `useEffect` with correct deps; backdrop click closes; `role="dialog"`, `aria-modal`, `aria-labelledby` set.
- Search filters both `name` and `description` (case-insensitive, trimmed) — useful for "anaf" → e-Factura discovery.
- Card uses semantic `<button>` with `aria-label` including category context; pastel tokens from design system used correctly (no hardcoded hex).
- `data-testid` hooks make tests deterministic without brittle text selectors.
- Empty-state copy present when filters yield zero results.

## Minor issues (non-blocking)
1. **Modal focus trap missing.** ESC works, but keyboard users can Tab out of the dialog into background content. Consider focusing the close button on open and restoring focus on close (auto-fix in a future a11y pass).
2. **Modal scroll lock missing.** Body still scrolls behind backdrop on mobile. Add `document.body.style.overflow = 'hidden'` in the same `useEffect`.
3. **Mojibake risk.** Header copy "Setup ~{X} min" uses `~` which is fine, but FAQ string includes curly-quote `„…"` mixing — render verified, just flag for consistency.
4. **Duplicate pastel.** `telefonie` and `automation` both map to `pastel-sky`; 7 pastels for 8 categories causes visual collision. Trivial polish.
5. **Test assertion loose.** `1 integrări` regex would also match `11 integrări`; acceptable but tighten with `^1 integrări` if expanded.
6. Live-region announcement of filter count would aid screen-reader users (`aria-live="polite"` on `int-count`).

## Risk
Low. Stacked correctly on `feat/M1-008-multifilale`; only additive changes; no shared component edits.
