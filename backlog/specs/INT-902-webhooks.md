---
id: INT-902
title: "Integrări: outbound webhooks — înregistrare endpoint + livrare eveniment"
milestone: INT
phase: "1"
status: pending
depends_on: [INT-901]
slug: webhooks
---

## Goal

Permite tenanților să înregistreze URL-uri externe care primesc evenimentele Vector Learn
(lead creat, student înscris, plată procesată). Baza pentru Zapier/Make integrations și
notificări externe.

## In scope

- Schema `webhook_endpoints`: `id, tenant_id, url, secret (for HMAC), events (jsonb array),
  active bool, created_at`.
- `POST /api/settings/webhooks` — înregistrează endpoint.
- `GET /api/settings/webhooks` — listează endpoints.
- `DELETE /api/settings/webhooks/:id` — șterge.
- Schema `webhook_deliveries`: `id, endpoint_id, event_type, payload(jsonb), status_code, 
  response_body, delivered_at, error`.
- Dispatcher `server/lib/webhookDispatch.ts`: POST cu signature `X-VL-Signature: sha256=<hmac>`,
  salvează delivery record (success/fail).
- Evenimentele integrate: `lead.created`, `student.enrolled`, `payment.received`.
- Pagina `/app/settings/webhooks` — tabel endpoints + history deliveries.

## Out of scope

- Retry cu backoff (viitor — acum: best-effort).
- Event subscriptions granulare per endpoint (acum: toate evenimentele sau lista configurată).

## User stories

- **US-1**: Ca owner, vreau să primesc un webhook pe Zapier când se creează un lead nou.
- **US-2**: Ca owner, vreau să văd istoricul livrărilor (succes/eșec) pentru fiecare endpoint.

## Acceptance criteria

- [ ] AC1: `POST /api/settings/webhooks` → 201, endpoint salvat.
- [ ] AC2: `GET /api/settings/webhooks` → array cu endpoints.
- [ ] AC3: La crearea unui lead → dispatcher trimite POST la endpoints active cu payload JSON + HMAC.
- [ ] AC4: HMAC verificabil: `crypto.createHmac('sha256', secret).update(body).digest('hex')`.
- [ ] AC5: Delivery record creat cu `status_code` și `error` (dacă URL offline).
- [ ] AC6: tenant-safe; zero `any`.

## Files

### New
- `server/db/schema/webhooks.ts`
- `server/routes/webhooks.ts`
- `server/lib/webhookDispatch.ts`
- `src/pages/app/settings/WebhooksPage.tsx`
- `drizzle/<N>_int902_webhooks.sql`
- `src/__tests__/integ/webhooks.test.ts`

### Modified
- `server/db/schema/index.ts`
- `server/index.ts` (mount route)
- `server/routes/leads.ts` (trigger dispatch on POST)

## Tests

- **T-INT-902-1** `[blocant]` Migration gate: db:reset && db:seed trec.
- **T-INT-902-2** `[blocant]` POST register endpoint → 201.
- **T-INT-902-3** `[blocant]` webhookDispatch cu endpoint activ → fetch apelat cu body JSON + header HMAC.
- **T-INT-902-4** `[blocant]` HMAC: crypto.verify cu secretul corect → match.
- **T-INT-902-5** Endpoint offline → delivery record cu error != null.

## Definition of Done

- [ ] AC1-6; T-INT-902-1..5 verzi; build+typecheck+lint+test verzi
