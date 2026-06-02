---
title: Hono route built + frontend wired but never mounted in app.ts → page shows "Unexpected token '<'"
problem_type: architecture_pattern
module: deploy
tags: [hono, app.ts, route, mount, orphan, SPA, fallback, unexpected-token, check-route-mounts]
symptoms: A page renders "Unexpected token '<'" or a red error; the API call returns 200 text/html instead of JSON
severity: P0
date: 2026-06-02
---

## Symptom
A page (e.g. `/app/settings/api-keys`, `/app/settings/webhooks`) crashes with `Unexpected token '<', "<!doctype "...`. The endpoint it calls returns `200 text/html` (the SPA `index.html`) instead of JSON, so `JSON.parse` chokes. Unit tests pass because they import the route module directly.

## Root cause
The route file exports a Hono router (`export const xxxRoutes = new Hono()`) and the frontend has a typed api module calling it, but **no `app.route(...)` in `server/app.ts` mounts it**. Unmounted `/api/*` paths fall through to the static + SPA fallback → HTML, not JSON. At one point **44 routers were orphaned** (whole verticals: School/K-12, messages, accounting, AI, branches, settings, 2FA, …) — built end-to-end on feature branches but never added to the central mount list, which the autopilot treated as "contested".

## Fix
Mount the router with the correct prefix, derived from the route file's internal paths + the frontend api module's full path (NOT guessed — several share a base, e.g. `timetable`→`/api/school/timetable`, `grades`→`/api/school`). Register more-specific prefixes before general ones. Then **boot the server** (`tsx server/index.ts`) — a route with a bad import (e.g. `mobile.ts` importing a non-existent `homework` schema export) crashes boot, so the boot itself is a gate. Verify each endpoint returns JSON with a live login + GET sweep.

## How to avoid next time
- **`scripts/check-route-mounts.mjs`** (build + `prod-safety.yml` CI): fails if any `export const X = new Hono` is not referenced in `app.ts`. Intentionally-unmounted routers carry a `// mount-exempt: <reason>` annotation.
- **`scripts/e2e-smoke.mjs`** now flags `"Unexpected token"` in page text — catches the UI symptom of a recurrence.
- When adding a schema file or a page that fetches a new endpoint, grep `server/app.ts` for the `app.route(...)` mount.
