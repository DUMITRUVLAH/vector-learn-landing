---
id: CRM-145
title: "Auto-scor lead la încărcare + explicație factori scor"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-111]
slug: auto-score-explained
---

## Goal

„Calculează scor" e o acțiune manuală ascunsă într-un link text discret
([LeadCardPage.tsx:626-638](../../src/pages/app/LeadCardPage.tsx#L626-L638)). Majoritatea
lead-urilor rămân fără scor. Calculează scorul automat când lipsește (la încărcarea cartonașului
sau la creare) și afișează **de ce** acel scor (factorii care contribuie), nu doar numărul.

---

## In scope

- La încărcarea cartonașului, dacă `lead.score == null`, declanșează `scoreLead` automat (o dată,
  fără buclă) și afișează badge-ul.
- Endpoint `scoreLead` întoarce (sau extinde să întoarcă) o defalcare de factori:
  `[{ label, points }]` (ex. „Are telefon +10", „Sursă recomandare +15", „Fără task -5").
- Tooltip/popover „De ce acest scor?" pe badge care listează factorii.
- Buton „Recalculează" pentru refresh manual (păstrează acțiunea, dar nu mai e singura cale).

## Out of scope

- Reguli de scoring configurabile per tenant (separat).

---

## User stories

- **US-1**: Ca agent, vreau să văd scorul fără să apăs nimic.
- **US-2**: Ca director, vreau să înțeleg de ce un lead are scor mare/mic.

---

## Acceptance criteria

- [ ] AC1: Lead fără scor → la deschiderea cartonașului scorul se calculează automat (un singur apel).
- [ ] AC2: Badge-ul de scor afișează un control „De ce?" care arată factorii cu puncte.
- [ ] AC3: `scoreLead` întoarce factorii (label + points) consistent cu scorul total.
- [ ] AC4: Buton „Recalculează" forțează un refresh manual.
- [ ] AC5: Niciun apel infinit / re-render loop.
- [ ] AC6: 0 axe critical/serious; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — auto-score + explicație
- `src/components/crm/ConvertModal.tsx` (helpers scor) dacă e nevoie
- `server/routes/leads.ts` — defalcare factori în răspunsul de scor

### New
- `src/components/crm/ScoreExplain.tsx`
- `src/__tests__/crm/auto-score.test.tsx`

---

## Tests

- **T-CRM-145-1** `[blocant]` Given lead cu `score:null` + mock `scoreLead`, When cartonaș montat, Then `scoreLead` apelat exact o dată.
- **T-CRM-145-2** `[blocant]` Given badge scor, When deschid „De ce?", Then se listează factorii cu puncte.
- **T-CRM-145-3** `[blocant]` API smoke: `POST /api/leads/:id/score` → 200 cu `{ score, factors[] }`.

---

## Definition of Done

- [ ] AC-uri; T-CRM-145-1..3 trec; build+typecheck+lint+test verzi
- [ ] Migration/API smoke verzi dacă schema atinsă; Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md
