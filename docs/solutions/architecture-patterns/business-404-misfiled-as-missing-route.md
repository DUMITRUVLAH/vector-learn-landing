---
title: Consola Platformă umplută cu „Rută API lipsă" false — orice 404 pe /api/* era tratat ca rută nemontată
problem_type: architecture_pattern
module: platform-telemetry, error-capture
tags: [telemetry, error-capture, 404, false-positive, noise, par]
symptoms: Consola Platformă arăta zeci de erori „Rută API lipsă" pe rute care EXISTĂ și funcționează (GET /api/par/:id/purchase-order, GET /api/par/:id, GET /api/par/:id/line-items/not-a-uuid)
severity: P2
date: 2026-08-28
---

## Simptom

`GET /api/par/:id/purchase-order` apărea cu 29 apariții / 2 clienți în Consola Platformă,
clasificat „Rută API lipsă", deși ruta există (`server/routes/parPurchaseOrders.ts`) și
funcționează exact cum trebuie: răspunde `404 {error:"not_found"}` când PAR-ul încă nu are
o comandă de achiziție emisă. La fel pentru `GET /api/par/:id` (id necunoscut) și
`GET /api/par/:id/line-items/not-a-uuid` (guard-ul de uuid, funcționând corect).

## Cauza

`server/middleware/errorCapture.ts` clasifica ORICE răspuns cu `status === 404` pe `/api/*`
drept `api_route_missing`, indiferent de conținutul corpului. Asta bypasa complet filtrul de
zgomot din `errorTelemetry.ts` (`recordError` sare peste `isNoise()` special pentru
`kind === "api_route_missing"`), deci fiecare 404 de business — un guard de uuid, o resursă
încă neexistentă, un PAR la care utilizatorul n-are acces — ajungea în listă ca bug real.

Ruta ADEVĂRAT lipsă are un semnal distinct: catch-all-ul de la capătul lui `server/app.ts`
(`app.all("/api/*", (c) => c.json({error:"route_not_found", path}, 404))`) rulează DOAR
când nicio rută reală n-a prins cererea, și e singurul loc care emite exact codul
`route_not_found`. Orice altă rută existentă care alege să răspundă 404 folosește alt cod.

## Fix

`errorCapture` citește corpul răspunsului și clasifică drept `api_route_missing` DOAR când
mesajul e `"route_not_found"` (sau, ca plasă pentru medii fără catch-all, corpul nu e deloc
JSON — 404-ul implicit, text, al Hono). Orice alt 404 JSON trece prin filtrul normal de
zgomot (4xx = zgomot, ca oricare altă cerere greșită a clientului).

```ts
const isMissingApiRoute = isApi404 && (message === "route_not_found" || !bodyIsJson);
```

## Lecția

Un heuristic bazat pe STATUS CODE ("404 pe /api/* = rută lipsă") se rupe de îndată ce ruta
reală are un motiv legitim să răspundă 404 chiar ea — ceea ce e foarte comun (guard-uri,
resurse opționale, control de acces „ascunde, nu refuză"). Semnalul corect e MARCAJUL pus
explicit de catch-all-ul care detectează absența reală a rutei, nu statusul HTTP pe care
orice handler îl poate alege liber.

Regresia e blocată de `server/__tests__/platform-telemetry.routes.test.ts` — „un 404 de
business pe o rută care EXISTĂ nu e tratat ca rută lipsă".
