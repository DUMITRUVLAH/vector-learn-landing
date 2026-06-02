---
title: Missing imports compile but crash at runtime (white screen / 500)
problem_type: build_error
module: deploy
tags: [import, vite, esbuild, typecheck, ReferenceError, undefined, white-screen, TS2304, TS2552]
symptoms: App builds fine locally and on Vercel, then every page is a white screen or every request 500s in prod
severity: P0
date: 2026-06-02
---

## Symptom
On 2026-06-02 the whole app went down for hours. `vite build` succeeded, deploy succeeded,
then login 500'd and pages white-screened. Caused by dropped imports during a bulk merge
(`Medal`, 19 page imports in `App.tsx`, `z` in `teachers.ts`).

## Root cause
`vite build` uses esbuild, which does **NOT type-check**. A missing import compiles cleanly,
ships, and becomes a runtime `ReferenceError` — white screen on the client, 500 on the server.
`tsc` would catch it but isn't on the build path.

## Fix
`scripts/check-undefined-refs.mjs` runs FIRST in `vercel.json` and fails the deploy on any
TS2304/TS2552 ("Cannot find name"). It gates ONLY undefined refs, not the ~240 pre-existing
type-quality errors (those don't crash at runtime).

## How to avoid next time
- Never remove the check-undefined-refs build step.
- Don't "fix" it by gating all of `tsc` — that would block deploys on harmless type debt.
- After any merge that touches imports: `npm run check-refs` + `vite build` before pushing.
- Never merge N divergent PRs blind — one phase = one PR (CLAUDE.md §0.2).
