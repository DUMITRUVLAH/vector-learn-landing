---
id: PAR-108
title: "Inbox approver /app/par/inbox + Approve/Reject/Request-changes + comentariu + e-semnătură"
milestone: PAR
phase: "C"
status: pending
attempts: 0
depends_on: [PAR-107]
spec: backlog/specs/PAR-108-approver-inbox.md
core: backlog/par/PAR-CORE.md
---

## Goal

Fluxul aprobatorului: API + UI pentru a vedea cererile aflate pe pasul lui și a decide
(Approve / Reject / Request changes) cu comentariu și o „e-semnătură" (nume tastat + timestamp).
Fiecare decizie avansează sau oprește lanțul.

## User stories

- **Ca** approver, **vreau** o listă cu ce așteaptă decizia mea, **pentru că** vreau să fiu eficient.
- **Ca** approver, **vreau** să resping cu motiv sau să cer modificări, **pentru că** nu orice cerere e gata de aprobat.
- **Ca** organizație, **vreau** ca fiecare aprobare să fie semnată și datată, **pentru că** asta apare pe formular.

## Acceptance criteria

- [ ] `GET /api/par/inbox` — PAR-urile unde userul curent e aprobatorul pasului `pending` activ
- [ ] `POST /api/par/:id/approve` `{comment?, signatureName}` — doar aprobatorul pasului activ; marchează step `approved` (+ `decided_at`, `signature_name`, `signature_title` snapshot); deblochează pasul următor sau, dacă era ultimul, PAR → `approved` (și → `in_finance` dacă `execute_payment`)
- [ ] `POST /api/par/:id/reject` `{comment(required)}` — PAR → `rejected`, lanțul se oprește
- [ ] `POST /api/par/:id/request-changes` `{comment(required)}` — PAR → `changes_requested` (requestorul poate edita din nou)
- [ ] Guard: nu poți decide un pas care nu e activ / nu e al tău (403/409)
- [ ] UI `/app/par/inbox`: listă + acțiuni cu modal de confirmare + câmp comentariu + nume semnătură; role-aware
- [ ] Emite evenimente de notificare (consumate de PAR-111)
- [ ] Vector 365, light+dark, a11y

## Files

**New:**
- `server/routes/parApprovals.ts` (sau extinde `par.ts`) — approve/reject/request-changes/inbox
- `src/pages/par/ParInbox.tsx`
- teste `server/routes/__tests__/par-approvals.test.ts`, `src/pages/par/__tests__/ParInbox.test.tsx`

**Modified:**
- `server/app.ts` (dacă router nou), `src/App.tsx` — `/app/par/inbox`, `src/lib/api/par.ts`

## Tests

- **T-PAR-108-1** [blocant] Given approver cu PAR pe pasul lui, When `/app/par/inbox`, Then îl vede; fără crash
- **T-PAR-108-2** [blocant] Given approve pasul 1/2, Then step1 approved, step2 pending, PAR rămâne pending_approval
- **T-PAR-108-3** [blocant] Given approve ultimul pas, Then PAR → approved (+ in_finance dacă execute_payment)
- **T-PAR-108-4** [blocant] Given reject cu comentariu, Then PAR → rejected, lanț oprit
- **T-PAR-108-5** [normal] Request-changes → changes_requested → requestorul poate edita

## DoD

- Live-smoke verde · ce-adversarial-reviewer · reviewer APPROVED · personas salvate
