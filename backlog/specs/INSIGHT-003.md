---
id: INSIGHT-003
title: "AI narativă CFO — POST /api/analytics/fin/ai-narrative (date REALE din DB, reuse callAi)"
milestone: FIN
phase: "13"
status: pending
depends_on: [INSIGHT-002]
spec: backlog/specs/INSIGHT-003.md
branch: feat/FIN-insight
---

## Goal

Implementează endpoint-ul AI narativă CFO pentru FinDesk Insights (FIN-CORE §1.13, regula #4):

1. **POST /api/analytics/fin/ai-narrative** — AI generează o narativă textuală a lunii curente pe baza
   cifrelor REALE extrase din DB (payments + invoices). AI-ul narează, NU calculează — cifrele vin
   din query determinist, narativa vine din LLM.
   Refolosire: `callAi` din `server/lib/ai/client.ts` + `aiAuditLog` (GDPR audit).

2. **Anti-halucinație (FIN-CORE regula #4):** promptul conține explicit cifrele reale:
   - revenue (sum payments.amount_cents unde status='paid', luna curentă) în MDL
   - receivable (sum invoices.amount_cents unde status='issued', luna curentă) în MDL
   - top 3 surse de venit (category / course)
   - aging receivable total (0-30 / 90+)
   AI-ul nu face niciun calcul — primește datele, le interpretează în română.

3. **Salvare automată în fin_narratives** — după generare AI, narativa e salvată cu:
   `generatedBy: "ai"`, sentiment detectat (positive/neutral/negative pe baza profit/receivable),
   `publishedAt: null` (draft — directorul aprobă manual înainte de publicare).

4. Refolosire stub AI: dacă `AI_API_KEY` nu e setat → stub narativă în română
   (`"fin_narrative"` ca action → adaugă în `STUB_RESPONSES`).

---

## User stories

- Ca **director financiar**, vreau să generez automat o narativă a lunii cu un click,
  pentru că scrierea manuală a comentariului de board durează 30 minute; AI-ul face draft-ul.
- Ca **director**, vreau să văd că narativa AI citează cifre reale (nu inventate),
  pentru că îmi este frică să trimit un raport cu halucații la board.
- Ca **auditor**, vreau să știu că narativa AI a fost generată din date DB la momentul X,
  pentru că GDPR și audit intern cer trasabilitate.

---

## Acceptance criteria

- [ ] AC1: `POST /api/analytics/fin/ai-narrative` cu body `{ month: "YYYY-MM" }` (opțional, default luna curentă):
  1. Calculează DETERMINIST din DB: revenue, receivable, profit = revenue - receivable (aproximare),
     aging_0_30, aging_90_plus, top_sources (max 3 — name + amountCents).
  2. Construiește prompt: `"Ești CFO-ul unui centru educațional. Luna ${month}: venituri ${revenue} MDL,
     creanțe ${receivable} MDL, profit estimat ${profit} MDL. Restanțe <30z: ${aging_0_30} MDL,
     restanțe >90z: ${aging_90_plus} MDL. Top surse: ${top_sources}. Scrie o narativă de 3-5 propoziții
     pentru boardul de directori, în română, fără inventarea de date."`
  3. Apelează `callAi({ action: 'fin_narrative', ... })` — loghează în aiAuditLog, respectă budget/feature flags.
  4. Detectează sentiment: dacă profit > 0 → positive; dacă receivable > revenue × 0.3 → negative; altfel neutral.
  5. Upsert în fin_narratives: (tenant_id, month) — crează dacă nu există, suprascrie dacă există
     (doar dacă `generatedBy='ai'` — nu suprascrie narativa manuală fără confirmare).
  6. Returnează: `{ narrative: FinNarrative, auditId: string, isStub: boolean, metrics: { revenue, receivable, profit, agingTotal } }`.
- [ ] AC2: Tenant isolation — toate query-urile filtrează `tenantId`.
- [ ] AC3: `STUB_RESPONSES['fin_narrative']` adăugat în `server/lib/ai/client.ts` (pentru rulare fără API key).
- [ ] AC4: Dacă `generatedBy='manual'` există deja pentru (tenant, month) → returnează 409 cu mesaj
  `"Narativă manuală existentă. Șterge-o mai întâi dacă vrei să o înlocuiești cu AI."`.
- [ ] AC5: `src/lib/api/finInsight.ts` — adaugă funcția `generateAiNarrative(month?: string): Promise<AiNarrativeResponse>`.
- [ ] AC6: Zero `any`, ruta montată în `analyticsRoutes` (prefix `/fin/ai-narrative`), tenant-scoped.

---

## Files to create / modify

**Create:**
- `src/__tests__/fin/fin-ai-narrative.test.ts` — teste: stub returnat când fetch mock; sentiment detectat corect

**Modify:**
- `server/routes/analytics.ts` — adaugă `POST /fin/ai-narrative`
- `server/lib/ai/client.ts` — adaugă `STUB_RESPONSES['fin_narrative']`
- `src/lib/api/finInsight.ts` — adaugă `generateAiNarrative`, `AiNarrativeResponse` tip

---

## Tests

- **T-INSIGHT-003-1** `[blocant]` Given `generateAiNarrative()` cu fetch mock 200 `{ narrative: {...}, auditId: "x", isStub: true, metrics: { revenue: 100, receivable: 20, profit: 80, agingTotal: 20 } }`,
  When fetch returnează 200, Then funcția returnează obiect cu câmpurile `narrative`, `auditId`, `isStub`, `metrics` fără excepție.
- **T-INSIGHT-003-2** `[blocant]` Given server returneaza 409 când narativa manuală există,
  When `generateAiNarrative("2026-01")` cu fetch mock 409 `{ error: "Narativă manuală existentă..." }`,
  Then funcția aruncă eroare sau returnează un obiect cu `error` câmp (nu crash necontrolat).
- **T-INSIGHT-003-3** `[blocant]` Given `STUB_RESPONSES` în `server/lib/ai/client.ts`,
  When action = `"fin_narrative"`, Then există o intrare non-goală (nu fallback la `default`).
- **T-INSIGHT-003-4** [normal] Given `generateAiNarrative("2026-06")` cu fetch mock 200 `{ narrative: { generatedBy: "ai", sentiment: "positive" }, auditId: "abc", isStub: false, metrics: { revenue: 500000, receivable: 50000, profit: 450000, agingTotal: 50000 } }`,
  When fetch 200, Then `narrative.generatedBy === "ai"` și `metrics.revenue === 500000`.
- **T-INSIGHT-003-5** [normal] Given month invalid (ex "nu-e-luna"),
  When `generateAiNarrative("not-a-month")` cu fetch mock 400 `{ error: "Month invalid" }`,
  Then funcția nu crashuiește — tratează eroarea HTTP.

---

## Definition of Done

- [ ] AC1-AC6 implementate
- [ ] T-INSIGHT-003-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] AI narează din date reale, nu inventează (prompt conține cifrele din DB)
- [ ] Stub funcționează fără AI_API_KEY
- [ ] Ruta montată în analyticsRoutes (prefix existent `/api/analytics`)
