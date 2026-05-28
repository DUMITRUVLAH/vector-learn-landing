```
REVIEW_RESULT: CHANGES_REQUESTED
ID: M1-005
SPEC_COMPLIANCE: pass
DESIGN_SYSTEM: fail
TYPE_SAFETY: pass
A11Y: pass
DARK_MODE: pass
COMPLEXITY: pass
HYGIENE: pass

FINDINGS:
- [High] src/components/modules/mobile/AppScreen.tsx:25,32 — Arbitrary HSL `from-[hsl(250,76%,52%)]` violates CLAUDE.md sec 3.1 ("NO hardcoded hex codes... semantic tokens only"). Use `from-primary to-primary/80` or define a `--primary-deep` token.
- [High] src/components/modules/mobile/AppScreen.tsx:78,81 — `bg-[hsl(158,64%,40%)]` and `bg-[hsl(38,92%,50%)]` are raw colors mid-tsx. Replace with `bg-success`/`bg-warning` (both tokens exist in index.css) or a dedicated course-accent token.
- [Med] src/components/modules/mobile/AppScreen.tsx:36 — `text-white` and `bg-white/20` inside gradient card bypass tokens. Prefer `text-primary-foreground` and `bg-primary-foreground/20` for theme correctness.
- [Med] Spec acceptance "Badge XP & streak animate" — current cards (DashboardScreen lines 42-52) render static values. No animation utility (transition/count-up/pulse) applied. Add `animate-pulse` on the Flame icon or a CSS count-up to satisfy criterion literally.
- [Low] src/components/modules/mobile/PhoneMockup.tsx:42,112 — Two `role="tablist"` without `aria-controls`/`tabpanel` linkage. Phone container is the de-facto panel; add `id` + `aria-controls` on indicator tabs, and `role="tabpanel"` + matching `id` on the AppScreen wrapper for full WAI-ARIA tabs pattern.
- [Low] src/components/modules/mobile/PhoneMockup.tsx:73-76 — `rounded-[2.5rem]` on the base then overridden with `rounded-[2.75rem]` / `rounded-[1.75rem]` — the base value is dead. Drop the first `rounded-[2.5rem]` to avoid confusion.
- [Low] src/components/modules/mobile/PhoneMockup.tsx:88 — Android punch-hole uses `bg-background/80` on top of `bg-foreground` phone body — in dark mode this becomes dark-on-dark and the camera dot disappears. Consider `bg-muted` or `bg-background` solid.
- [Low] src/components/modules/mobile/AppScreen.tsx:23 — Emoji in source string ("Salut, Maria 👋") — CLAUDE.md discourages emojis in files unless asked; acceptable as UX copy but worth noting.
- [Info] src/__tests__/modules/mobile.test.tsx — 17 tests cover navigation, OS toggle, indicator, and page render. Solid coverage; no swipe/touch test though handlers are present.

VERDICT: Strong implementation and tests, but multiple arbitrary HSL color literals in AppScreen break the design-system contract and the XP/streak "animate" criterion is unmet — fix tokens and add a minimal animation to land APPROVED.
```
