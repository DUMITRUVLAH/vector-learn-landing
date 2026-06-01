---
id: AI-A04
title: "AI dashboard — cost cap, usage stats, feature flags"
milestone: AI
phase: "1 — AI Foundation"
priority: P1
slug: ai-dashboard
depends_on: [AI-A01, AI-A02, AI-A03]
status: pending
---

# AI-A04 — AI usage dashboard + cost cap per tenant + feature flags

## Goal

Give the owner visibility into AI usage (calls, tokens, cost estimate) and control
over AI features (enable/disable per feature, set monthly cost cap). When a tenant's
monthly AI cost exceeds the cap, all AI endpoints return a graceful degradation
message instead of calling the LLM. Feature flags allow progressive rollout of AI
features per tenant.

## User stories

- Ca Billing Admin, vreau să setez un buget lunar AI de ex. 10€, pentru că nu vreau
  surprize pe factura mea Anthropic/OpenAI.
- Ca Owner, vreau să văd câte apeluri AI am făcut și cât au costat, pentru că
  vreau să înțeleg ROI-ul AI-ului.
- Ca Admin, vreau să activez/dezactivez individual fiecare funcție AI (rezumat lecție,
  predicție churn, calificare lead), pentru că nu toți profesorii trebuie să vadă toate.
- Ca System, vreau ca sistemul să se oprească automat când bugetul lunar e depășit,
  pentru că altfel pot face pierderi.

## Acceptance criteria

- [ ] DB: tabel `ai_feature_flags` cu `(id, tenant_id, feature VARCHAR(50), enabled
      BOOLEAN DEFAULT true)`; features: `lesson_summary`, `churn_prediction`,
      `lead_qualification`, `reply_suggestion`; câte un rând per feature per tenant;
      migrare comisă
- [ ] DB: coloană `ai_monthly_budget_usd_cents INT DEFAULT NULL` pe tabelul `tenants`
      (null = nelimitat); migrare comisă
- [ ] `server/lib/ai/budgetGuard.ts` — funcție `checkBudget(tenantId): Promise<boolean>`:
      sum costs din `ai_audit_log` WHERE created_at >= start-of-month; compară cu
      `tenants.ai_monthly_budget_usd_cents`; returnează false dacă depășit
- [ ] `server/lib/ai/featureFlags.ts` — `isEnabled(tenantId, feature): Promise<boolean>`
- [ ] Middleware / wrapper în `server/lib/ai/client.ts`: apelează `checkBudget` și
      `isEnabled` înainte de orice call LLM; dacă false → returnează stub text +
      loghează "ai_budget_exceeded" sau "ai_feature_disabled" în ai_audit_log
- [ ] `GET /api/settings/ai` — returnează `{ monthlyBudgetUsdCents, currentMonthCostUsdCents,
      callCount, featureFlags: [{ feature, enabled }] }`
- [ ] `PATCH /api/settings/ai` — body: `{ monthlyBudgetUsdCents?, featureFlags?: [...] }`;
      upsert flags + update budget pe tenant
- [ ] Pagina `/app/settings/ai`:
      - Card "Buget lunar AI": input €/lună + progress bar (cheltuit vs buget)
      - Card "Utilizare luna curentă": N apeluri, N tokens totali, N€ cost estimat
      - Tabel "Feature flags": toggle per feature (Rezumat lecție / Predicție churn / etc.)
      - Buton "Salvează setările"
      - Warning banner dacă buget depășit (> 90% sau 100%)
- [ ] Link "Setări AI" în AppShell sidebar sub Settings section
- [ ] Dark mode parity, zero hardcoded colors

## Files

### New files
- `server/db/schema/aiFeatureFlags.ts`
- `server/lib/ai/budgetGuard.ts`
- `server/lib/ai/featureFlags.ts`
- `server/routes/aiSettings.ts`
- `src/pages/settings/AiSettingsPage.tsx`
- `src/__tests__/ai/budgetGuard.test.ts`

### Modified files
- `server/db/schema/index.ts` — export aiFeatureFlags
- `server/lib/ai/client.ts` — integrare budgetGuard + featureFlags
- `server/app.ts` — mount `/api/settings/ai`
- `src/App.tsx` — ruta `/app/settings/ai`
- `src/components/layout/AppShell.tsx` — link "Setări AI"

## Tests

- **T-AI-A04-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes
- **T-AI-A04-2** [blocant] Given: tenant cu budget 100 cents și currentMonth cost 110 cents
  (mock), When: checkBudget(tenantId), Then: returnează false (depășit)
- **T-AI-A04-3** [blocant] Given: admin logat, When: GET /api/settings/ai, Then: 200 cu
  `{ monthlyBudgetUsdCents, currentMonthCostUsdCents, callCount, featureFlags }`
- **T-AI-A04-4** [blocant] Given: PATCH /api/settings/ai cu feature_flags update, Then:
  200 + flags actualizate în DB (portabilitate PG/PGlite)
- **T-AI-A04-5** [normal] Given: AiSettingsPage randat cu budget 1000 cents și cost 800,
  When: randat, Then: progress bar la 80%, fără warning banner
- **T-AI-A04-6** [normal] Given: feature "lesson_summary" disabled, When: POST
  /api/ai/lesson-summary, Then: 200 cu `{ summary: "[AI dezactivat de admin]" }` (nu 500)

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-AI-A04-x trec
- [ ] Migrations comise (`drizzle/0037_ai_a04_feature_flags.sql`) — fără coliziune
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + GET /api/settings/ai → 200
- [ ] Budget guard funcționează offline (rule-based, nu LLM)
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/AI-faza-1-assistant`
