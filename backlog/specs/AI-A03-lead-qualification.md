---
id: AI-A03
title: "AI lead qualification — hot/warm/cold sort + WhatsApp reply suggestion"
milestone: AI
phase: "1 — AI Foundation"
priority: P1
slug: lead-qualification
depends_on: [AI-A01, CRM-105]
status: pending
---

# AI-A03 — AI lead qualification: hot/warm/cold + auto-reply WhatsApp suggestion

## Goal

Two features in one unit:

1. **Lead qualification**: AI scores new/recent leads as hot/warm/cold based on
   engagement signals (source, fill rate, days since created, message count). Score
   is surfaced as a badge on KanbanCard and in the leads list. No LLM needed —
   rule-based like AI-A02 churn scoring.

2. **WhatsApp reply suggestion**: when a staff member opens a lead card and sees an
   unread WhatsApp message, a "Sugestie răspuns" button appears. Clicking it calls
   the AI client (pseudonymized, stub-safe) with the message context and returns a
   draft reply. Staff can edit and send, or dismiss. Uses human-in-the-loop (COMM
   infrastructure).

## User stories

- Ca Vânzător, vreau ca lead-urile să fie sortate automat hot/warm/cold, pentru că
  prioritizez cel mai bine fără să evaluez manual.
- Ca Recepționer, vreau că AI îmi propune un răspuns la mesajul WhatsApp al
  părintelui, pentru că răspund în secunde, nu minute.
- Ca Manager, vreau să aprob răspunsul AI înainte de trimitere, pentru că previn
  erori publice față de părinți.
- Ca Director, vreau să văd câte lead-uri sunt hot vs warm vs cold în timp real,
  pentru că măsor sănătatea pipeline-ului.

## Acceptance criteria

- [ ] `server/lib/ai/leadScorer.ts` — funcție `qualifyLead(lead): 'hot'|'warm'|'cold'`:
      - hot: creat < 24h + sursă organică/ads + mesaj primit + toate câmpurile completate
      - warm: creat < 7 zile + cel puțin un contact
      - cold: tot restul
- [ ] `PATCH /api/leads/:id/qualify` — recalculează și salvează `qualification` pe lead;
      nu necesită body; răspuns `{ qualification: 'hot'|'warm'|'cold' }`
- [ ] DB: adaugă coloana `qualification VARCHAR(10)` la tabelul `leads`; index pe
      `(tenant_id, qualification)`; migrare comisă
- [ ] Bulk job la `/api/ai/qualify-leads` (POST, fără body) — rulează qualifyLead pe
      toate lead-urile tenantului și salvează; răspuns `{ updated: number }`
- [ ] KanbanCard: badge colored mic (🔴 hot / 🟡 warm / ⚪ cold) lângă scor
- [ ] `POST /api/ai/reply-suggestion` — body:
      `{ leadId, messageText, conversationHistory: string[] }`;
      - Pseudonimizează conversația
      - Apelează LLM client cu contextul
      - Returnează `{ draft: string, auditId: string }`
- [ ] Buton "Sugestie răspuns" în panoul de mesaje WhatsApp din LeadCardPage:
      - Vizibil pe orice mesaj primit (incoming)
      - Loading indicator cât AI rulează
      - Modal/inline textarea editabilă cu draft-ul
      - Butoane "Trimite" (aprobă + trimite via COMM-201) și "Anulează"
      - Badge "AI draft — verifică înainte de trimitere" (avertisment vizibil)
- [ ] Dark mode parity, zero hardcoded colors

## Files

### New files
- `server/lib/ai/leadScorer.ts`
- `server/routes/aiLeads.ts`
- `src/components/app/ReplyDraftModal.tsx`
- `src/__tests__/ai/leadScorer.test.ts`

### Modified files
- `server/db/schema/leads.ts` — adaugă coloana qualification
- `server/db/schema/index.ts` — reexport (auto din leads.ts)
- `server/app.ts` — mount `/api/ai/qualify-leads` și `/api/ai/reply-suggestion`
- `server/routes/leads.ts` — apel qualifyLead la CREATE lead (async, non-blocking)
- `src/components/app/KanbanCard.tsx` — badge qualification
- `src/pages/app/LeadCardPage.tsx` — buton "Sugestie răspuns"

## Tests

- **T-AI-A03-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes
- **T-AI-A03-2** [blocant] Given: lead creat acum 1h cu sursă "ads" și mesaj primit,
  When: qualifyLead(lead), Then: qualification === "hot"
- **T-AI-A03-3** [blocant] Given: admin logat, When: POST /api/ai/qualify-leads, Then:
  200 cu `{ updated: number }`
- **T-AI-A03-4** [blocant] Given: POST /api/ai/reply-suggestion cu messageText valid,
  Then: 200 cu `{ draft: string, auditId: string }` (draft poate fi stub text)
- **T-AI-A03-5** [normal] Given: KanbanCard cu qualification="hot", When: randat, Then:
  badge "hot" vizibil cu culoare roșie
- **T-AI-A03-6** [normal] Given: ReplyDraftModal randat cu draft="Bună ziua...", When:
  click "Anulează", Then: modal se închide fără side effects

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-AI-A03-x trec
- [ ] Migration comisă (`drizzle/0036_ai_a03_lead_qualification.sql`) — fără coliziune
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + POST /api/ai/qualify-leads → 200
- [ ] qualifyLead funcționează pur (rule-based, fără LLM)
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/AI-faza-1-assistant`
