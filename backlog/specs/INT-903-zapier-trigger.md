---
id: INT-903
title: "Integrări: Zapier-compatible REST triggers + sample events"
milestone: INT
phase: "1"
status: pending
depends_on: [INT-902]
slug: zapier-trigger
---

## Goal

Adaugă endpoint-uri compatibile cu Zapier polling triggers, astfel încât tenanții pot conecta
Vector Learn la Zapier fără programare: un Zap care se declanșează la lead nou sau la plată.

## In scope

- `GET /api/integrations/triggers/leads` — returnează ultimele 10 leads create (polling trigger).
- `GET /api/integrations/triggers/payments` — ultimele 10 plăți.
- Ambele autentificate cu API key (INT-901 middleware).
- Documentație inline (comentarii) cu instrucțiuni Zapier: URL, auth method, sample response.
- O pagină simplă `/app/settings/integrations` cu instrucțiunile de conectare Zapier + API key display.

## Out of scope

- Zapier app publicat (necesită review Zapier — viitor).
- Make/n8n specific (aceleași endpoints funcționează).

## User stories

- **US-1**: Ca owner, vreau să conectez Zapier la Vector Learn cu un API key, fără a scrie cod.
- **US-2**: Ca owner, vreau să creez un Zap care adaugă leadurile noi în Google Sheets automat.

## Acceptance criteria

- [ ] AC1: `GET /api/integrations/triggers/leads` cu X-API-Key → 200, array de lead-uri.
- [ ] AC2: `GET /api/integrations/triggers/payments` cu X-API-Key → 200, array.
- [ ] AC3: Fără API key → 401.
- [ ] AC4: Pagina `/app/settings/integrations` randează fără crash.
- [ ] AC5: tenant-safe.

## Tests

- **T-INT-903-1** `[blocant]` GET triggers/leads cu X-API-Key valid → 200, array.
- **T-INT-903-2** `[blocant]` GET triggers/leads fără auth → 401.
- **T-INT-903-3** IntegrationsPage renders without crash.

## Definition of Done

- [ ] AC1-5; T-INT-903-1..3 verzi; build+typecheck+lint+test verzi
