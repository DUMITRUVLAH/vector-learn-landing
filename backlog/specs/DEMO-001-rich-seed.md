---
id: DEMO-001
title: Rich demo seed — Lingua School cu date realiste pe 6 luni
milestone: WAVE2
phase: 1
status: in_progress
priority: P0
depends_on: []
spec: backlog/specs/DEMO-001-rich-seed.md
---

## Goal

Actualizează `server/db/seed.ts` cu date demo realiste pentru un centru de limbi ("Lingua School"):
50 elevi, 3 profesori, 4 cursuri, 6 luni de lecții, plăți, leaduri în pipeline, facturi, contracte.
Scopul: demo-urile live arată un produs folosit real, nu un sandbox gol.

## User stories

- Ca owner, vreau să pornesc demo-ul și să văd o școală cu date reale, pentru că un sandbox gol nu convinge clienți potențiali.
- Ca Andreea (director), vreau să văd dashboard-ul cu venituri pe ultimele 6 luni la prima deschidere, pentru că dovedesc ROI imediat.
- Ca vânzător Vector Learn, vreau să arăt Kanban-ul CRM cu 8-10 leaduri în pipeline, pentru că demonstrează fluxul end-to-end.

## Acceptance criteria

1. `npm run db:seed` rulează fără erori și creează:
   - 1 tenant "Lingua School" cu owner dima@linguaschool.ro / parola "demo123"
   - 3 profesori (Engleza, Franceza, Spaniola) cu disponibilitate săptămânală
   - 4 cursuri (English B1, English B2, French A1, Spanish A1) cu preț/oră
   - 50 elevi (mix active/trial/graduated) cu date contact realiste românești
   - Lecții recurente pe 6 luni (Sept 2025 – Feb 2026), 3/săpt per curs
   - Plăți pentru 80% din elevi activi (unele restanțe deliberate pentru demo)
   - 8 leaduri în CRM pipeline (2 per stadiu: New/Contacted/Trial/Won)
   - 5 facturi (3 plătite, 1 cu restanță, 1 anulată)
   - 2 contracte active
2. Datele respectă toate relațiile FK (tenant_id pe toate tabelele, course_id pe lecții etc.)
3. Seed-ul este idempotent: rulează de mai multe ori fără erori (DELETE + INSERT sau INSERT OR IGNORE)
4. `npm run db:reset && npm run db:seed` trece după migrările existente
5. Dashboard-ul `/app` arată venituri reale (totalRevenue > 0), nu zero
6. CRM `/app/leads` arată leaduri cu surse variate (Facebook, website, recomandare)

## Files

- `server/db/seed.ts` — rescris complet cu date bogate
- Nu sunt necesare migrări noi (seed folosește tabele existente)

## Tests

- **T-DEMO-001-1** [blocant] Given seed rulat, When `GET /api/students?limit=100`, Then `total >= 40`
- **T-DEMO-001-2** [blocant] Given seed rulat, When `GET /api/leads`, Then response conține leaduri cu stage în [new, contacted, trial, won]
- **T-DEMO-001-3** [blocant] Given seed rulat, When `GET /api/payments/stats`, Then `totalRevenue > 0`
- **T-DEMO-001-4** [normal] Given seed rulat, When `GET /api/lessons?limit=300`, Then count >= 100
- **T-DEMO-001-5** [normal] Given seed rulat, When `GET /api/invoices`, Then există cel puțin 3 facturi

## DoD

- [ ] `db:reset && db:seed` trece verde fără erori
- [ ] Dashboard arată venituri > 0 cu grafic vizibil
- [ ] CRM Kanban arată leaduri în toate stadiile
- [ ] Build + lint + unit tests verzi
- [ ] Reviewer APPROVED
