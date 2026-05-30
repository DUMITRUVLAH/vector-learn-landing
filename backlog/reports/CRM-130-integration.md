# CRM-130 Integration Report

**Verdict: CONNECTED**

## Endpoint changes
- `PATCH /api/pipeline-stages/:id` now accepts `wipLimit` field via `updateStageSchema` — wired to DB column `wip_limit` ✅

## Frontend wiring
- `updatePipelineStage` in `src/lib/api/pipeline.ts` now includes `wipLimit` in patch type ✅
- `StagesEditorModal` calls `updatePipelineStage(id, { wipLimit })` on WIP field save ✅

## DB migration
- `drizzle/0016_crm130_wip_limit.sql`: `ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS wip_limit integer` ✅
- Schema `server/db/schema/pipeline.ts` updated with `wipLimit` field ✅

## Keyboard shortcuts
- `useKanbanKeyboard` hook in `src/hooks/useKanbanKeyboard.ts` ✅
- Integrated in `LeadsPage.tsx` via `useKanbanKeyboard({ onSearch, onNewLead, modalOpen, searchRef })` ✅

## DB portability
- No raw `.execute().rows` — uses Drizzle ORM throughout ✅
