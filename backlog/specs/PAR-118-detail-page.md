---
id: PAR-118
title: "Pagina detaliu /app/par/:id completă — toate 16 secțiuni + acțiuni role-aware + status timeline"
milestone: PAR
phase: "F"
status: pending
attempts: 0
depends_on: [PAR-109, PAR-110, PAR-114, PAR-115]
spec: backlog/specs/PAR-118-detail-page.md
core: backlog/par/PAR-CORE.md
---

## Goal

Pagina canonică de detaliu a unui PAR, care agregă tot: cele 16 secțiuni read-only fidele formularului,
lanțul de aprobare cu deciziile și comentariile, blocul finanțe, timeline-ul de audit, butonul Download
PDF și butoanele de acțiune potrivite rolului curent. O versiune minimală a paginii există deja (livrată
cu PAR-106/108 ca să se poată testa fluxul); acest item o duce la paritate completă cu formularul.

## User stories

- **Ca** orice rol, **vreau** o pagină care arată cererea exact ca formularul, **pentru că** e referința comună.
- **Ca** approver, **vreau** butoanele Approve/Reject vizibile doar când e rândul meu, **pentru că** altfel e confuz.
- **Ca** requestor, **vreau** să văd unde e blocată și de ce, **pentru că** vreau să acționez.

## Acceptance criteria

- [ ] `/app/par/:id` afișează toate 16 secțiunile read-only, grupate ca pe formular (antet, clasificare, linii+total, end-use, payee, atașamente, semnături, finanțe)
- [ ] Lanțul de aprobare: fiecare pas cu aprobator, decizie, dată, comentariu, semnătură
- [ ] Status chip + `ParTimeline` (PAR-110) + Download PDF (PAR-115)
- [ ] Acțiuni role-aware: requestor (Edit draft / Cancel / re-submit la changes_requested); approver activ (Approve / Reject / Request changes); finance (Receive/Assign / Mark paid / Reapprove); admin (toate)
- [ ] Butoane afișate DOAR când acțiunea e validă pentru stare+rol
- [ ] Vector 365, light+dark, a11y (0 axe critical/serious), responsive
- [ ] Smoke test de randare în mai multe stări + test că acțiunile apar/dispar corect pe rol

## Files

**New / Modified:**
- `src/pages/par/ParDetail.tsx` — versiunea completă
- `src/components/par/ParSignatureBlock.tsx`, `src/components/par/ParApprovalChain.tsx`
- teste `src/pages/par/__tests__/ParDetail.test.tsx`

**Modified:**
- `src/App.tsx` — `/app/par/:id` (dacă nu e deja)

## Tests

- **T-PAR-118-1** [blocant] Given un PAR în orice stare, When `/app/par/:id`, Then toate 16 secțiuni read-only se randează (fără crash) + timeline + lanț
- **T-PAR-118-2** [normal] Given rolul curent, Then butoanele de acțiune sunt cele permise
- **T-PAR-118-3** [blocant] a11y + dark mode: 0 axe critical/serious; lizibil ambele teme

## DoD

- Build verde · reviewer APPROVED · persona-manager (fidelitate formular) + persona-student salvate
