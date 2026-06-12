---
title: "Hono: mount specific path routers before generic /:id routers"
problem_type: route-shadowing
module: PAR, any Hono module
tags: [hono, routing, par, param-shadow]
symptoms: "GET /api/par/finance returns 404 or wrong response — id='finance' parsed by /:id handler instead of /finance handler"
severity: critical
date: 2026-06-12
---

## Symptom
When `app.route("/api/par", parRoutes)` is registered before `app.route("/api/par", parPaymentsRoutes)`,
a request to `GET /api/par/finance` is handled by `parRoutes.get("/:id")` with `id = "finance"` (a string, not a UUID) instead of `parPaymentsRoutes.get("/finance")`.

## Root cause
Hono evaluates registered routers in registration order. When two routers are both mounted at the same base path (`/api/par`), the first one to match wins. A generic `/:id` param pattern matches ANY string including literal path segments like "finance", "inbox", "me".

## Fix
Register the more-specific (literal-path) router BEFORE the generic one:

```ts
// CORRECT — specific before generic
app.route("/api/par", parPaymentsRoutes);   // has GET /finance
app.route("/api/par", parRoutes);           // has GET /:id  ← would shadow /finance if first
```

OR mount at a specific prefix if the router is fully dedicated to one path:
```ts
app.route("/api/par/finance", parFinanceRoutes);  // fully isolated, order doesn't matter
```

## How to avoid next time
- Any Hono sub-router with a literal path (e.g. `/finance`, `/inbox`, `/me`) MUST be mounted before
  the router with a param pattern (`/:id`).
- Add a comment in app.ts: `// specific paths first, /:id last`
- The `/api/par/me`, `/api/par/inbox` patterns already follow this rule; apply it consistently.
