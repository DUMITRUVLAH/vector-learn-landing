---
id: AI-A01
title: "AI lesson summary generator + GDPR-safe pseudonymization"
milestone: AI
phase: "1 — AI Foundation"
priority: P0
slug: lesson-summary
depends_on: [MVP-005, COMM-201]
status: pending
---

# AI-A01 — AI lesson summary + GDPR-safe pseudonymization layer

## Goal

After a lesson, a teacher clicks "Generează sumar" and the app sends the teacher's
raw notes to an LLM (Anthropic Claude stub — real API key in env). The LLM returns
a 5-line parent-friendly summary (progress, difficulties, recommendations). The
teacher reviews and approves before it's sent. All data sent to the LLM is
pseudonymized first (names replaced with tokens) to comply with GDPR. An audit
entry is created for every AI call (model used, token count, cost estimate).

## User stories

- Ca Profesor, vreau să generez un sumar al lecției din notițele mele cu un singur
  click, pentru că redactarea mesajelor pentru părinți consumă prea mult timp.
- Ca Profesor, vreau să revizuiesc și editez sumarul înainte de trimitere, pentru că
  AI poate greși și eu răspund pentru comunicare.
- Ca Owner, vreau ca datele trimise la OpenAI/Anthropic să fie pseudonimizate,
  pentru că GDPR interzice trimiterea numelor reale la furnizori terți.
- Ca Compliance, vreau un jurnal al fiecărui apel AI (input, output, model, cost),
  pentru că trebuie să demonstrez conformitatea.

## Acceptance criteria

- [ ] DB: tabel `ai_audit_log` cu `(id, tenant_id, user_id, action, model, prompt_tokens,
      completion_tokens, cost_usd_micro, pseudonymized BOOLEAN, created_at)`;
      migrare comisă
- [ ] `server/lib/ai/pseudonymize.ts` — funcție `pseudonymize(text, names: string[]):
      { text: string, tokenMap: Record<string, string> }` care înlocuiește fiecare
      nume cu `[PERSON_N]` înainte de trimiterea la LLM; funcție inversă `depseudonymize`
- [ ] `server/lib/ai/client.ts` — wrapper în jurul fetch(`https://api.anthropic.com/v1/messages`)
      sau stub care returnează text fix dacă `AI_API_KEY` nu e setat în env
      (stub text: "Elev a făcut progres în vocabular. A avut dificultăți cu pronunțarea.
      Recomand exersarea zilnică 10 minute."); loghează apelul în `ai_audit_log`
- [ ] `POST /api/ai/lesson-summary` — body:
      `{ lessonId: string, teacherNotes: string }`;
      1. Obține detalii lecție (data, materie, elev) din DB
      2. Pseudonimizează note-le + numele elevului
      3. Apelează LLM client cu prompt structurat (RO)
      4. Depseudonimizează răspunsul
      5. Returnează `{ summary: string, pseudonymized: boolean, auditId: string }`
- [ ] `POST /api/ai/lesson-summary/:auditId/approve` — profesorul aprobă sumarul;
      creează o notificare/mesaj draft pentru părintele elevului via COMM-201 infra
      (stub: loghează "mesaj draft creat"); returnează `{ messageId }`
- [ ] Pagina `/app/lessons/:id` sau componentă `LessonSummaryPanel` (inline, nu pagină nouă):
      - Buton "Generează sumar AI" lângă câmpul de note al profesorului
      - Loading spinner cât timp AI rulează (max 10s timeout)
      - Textarea editabilă cu sumarul returnat
      - Butoane "Trimite" (aprobă) și "Anulează"
      - Badge "GDPR: Date pseudonimizate" lângă butonul de generate
- [ ] Dacă `AI_API_KEY` nu e configurat: butonul e vizibil dar afișează toast
      "AI nu e configurat. Contactează admin." (nu crash, degraded-but-functional)
- [ ] Dark mode parity, zero hardcoded colors

## Files

### New files
- `server/lib/ai/pseudonymize.ts`
- `server/lib/ai/client.ts`
- `server/db/schema/aiAuditLog.ts`
- `server/routes/ai.ts` — router `/api/ai`
- `src/components/app/LessonSummaryPanel.tsx`
- `src/__tests__/ai/pseudonymize.test.ts`
- `src/__tests__/ai/lesson-summary.test.ts`

### Modified files
- `server/db/schema/index.ts` — export aiAuditLog
- `server/app.ts` — mount `/api/ai` router
- `src/pages/app/SchedulePage.tsx` sau noua pagina lectie — integreaza LessonSummaryPanel

## Tests

- **T-AI-A01-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes,
  tabel ai_audit_log există
- **T-AI-A01-2** [blocant] Given: server pornit + admin logat, When: POST /api/ai/lesson-summary
  cu note valide, Then: 200 cu `{ summary: string, pseudonymized: true, auditId: string }`
- **T-AI-A01-3** [blocant] Given: text "Maria Popescu a lucrat pe Past Perfect", When:
  pseudonymize(text, ["Maria Popescu"]), Then: output conține "[PERSON_1]", nu "Maria Popescu"
- **T-AI-A01-4** [blocant] Given: rezultat DB ai_audit_log, When: `Array.isArray(entries)`,
  Then: true (nu `.rows`)
- **T-AI-A01-5** [normal] Given: LessonSummaryPanel randat (cu AI_API_KEY unset stub),
  When: click "Generează sumar AI", Then: toast "AI nu e configurat" sau summary din stub apare
- **T-AI-A01-6** [normal] Given: sumar generat, When: click "Trimite", Then: POST
  /api/ai/lesson-summary/:auditId/approve returnează 200 cu messageId

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-AI-A01-x trec
- [ ] Migration comisă (`drizzle/0034_ai_a01_audit_log.sql`) — fără coliziune de prefix
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + POST /api/ai/lesson-summary → 200
- [ ] pseudonymize + depseudonymize se anulează reciproc (round-trip test)
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/AI-faza-1-assistant`
