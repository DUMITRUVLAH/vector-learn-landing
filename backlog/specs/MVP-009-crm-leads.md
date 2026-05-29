---
id: MVP-009
title: CRM — Leads pipeline + conversion
milestone: MVP
estimate_hours: 3
priority: P0
---

# MVP-009 — CRM Leads

## Goal
Modulul CRM real: capturare lead-uri (manual + via API public), pipeline kanban cu drag-drop între stadii, conversie lead → student când plătește. Interacțiuni (apel, mesaj, notă) salvate per lead pentru istoric.

## Schema additions

```typescript
// leads — lead-uri capture-uite (separate de students, pot converti)
leads: id, tenant_id, full_name, phone, phone_normalized, email, email_normalized,
       interest_course, stage, source, utm_source, utm_medium, utm_campaign,
       fbclid, gclid, consent_text, consent_at, ip_at_consent, notes,
       converted_to_student_id, converted_at, lost_reason,
       created_at, updated_at

// lead_interactions — istoric per lead
lead_interactions: id, tenant_id, lead_id, type, direction, body,
                   user_id, occurred_at
```

## API

```
GET    /api/leads                — list + filter stage + search
GET    /api/leads/pipeline       — grouped by stage (for kanban)
POST   /api/leads                — create (auth required, manual)
PATCH  /api/leads/:id            — update fields (notes, etc.)
PATCH  /api/leads/:id/stage      — move to new stage (with optional lost_reason)
POST   /api/leads/:id/convert    — convert to student (creates students row)
GET    /api/leads/:id/interactions — list per lead
POST   /api/leads/:id/interactions — add interaction (call/note/email)

POST   /api/leads/intake         — PUBLIC (no auth!) — embeds form
                                   accepts tenant_slug, captcha, UTM params
```

## Frontend

```
/app/leads          — kanban view, drag between stages, click to open detail
/app/leads/:id      — detail page with interactions timeline + convert button
```

## Acceptance criteria

- [ ] Leads table + lead_interactions table cu schema completă
- [ ] Phone/email normalization for dedup
- [ ] Kanban UI cu drag-drop între 5 stadii: new, contacted, trial, paid, lost
- [ ] Lead detail cu istoric interacțiuni
- [ ] Convert button: lead → creează student real în DB
- [ ] Public intake endpoint funcționează din `curl -X POST` (test)
- [ ] Toate persistente, tenant-scoped, multi-tenant safe
