---
id: PAR-102
title: "Line items (secțiunea 10) — editor + auto-sumă + total_estimated_cents + nota 10%"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-101]
spec: backlog/specs/PAR-102-line-items.md
core: backlog/par/PAR-CORE.md
---

## Goal

Gestionarea liniilor din tabelul „Items/Services Requested" (secțiunea 10): adăugare/editare/ștergere
linii pe un PAR draft, cu `line_total_cents` calculat server-side (qty × unit price) și
`total_estimated_cents` agregat pe PAR. Marchează regula de prag (nota 10%) când totalul depășește
micro-purchase threshold.

## User stories

- **Ca** requestor, **vreau** să adaug linii cu descriere, cantitate, unitate, preț unitar, **pentru că** așa arată tabelul din formular.
- **Ca** organizație, **vreau** ca totalul să fie calculat automat, **pentru că** sumele scrise de mână duc la erori.
- **Ca** approver, **vreau** să văd avertismentul de prag, **pentru că** știu când se aplică regula de re-aprobare la +10%.

## Acceptance criteria

- [ ] `POST /api/par/:id/line-items` — adaugă linie `{description, quantity, unit, unit_price_cents}`; doar pe `draft`/`changes_requested`, doar autor
- [ ] `PATCH/DELETE /api/par/:id/line-items/:lineId`
- [ ] `line_total_cents = quantity * unit_price_cents` calculat server-side (NU acceptat din client)
- [ ] `par_requests.total_estimated_cents` recalculat la orice schimbare de linie = Σ line totals
- [ ] `quantity > 0` și `unit_price_cents ≥ 0` (400 altfel)
- [ ] `position` secvențial (item #)
- [ ] Răspunsul include flag `above_micro_threshold` (total > `par_settings.micro_purchase_threshold_cents`) pentru ca UI să arate nota 10%
- [ ] Liniile sunt imutabile după submit (enforced complet în PAR-109; aici doar guard pe status)

## Files

**New:**
- `server/routes/parLineItems.ts` (sau extinde `server/routes/par.ts`)
- teste în `server/routes/__tests__/par-line-items.test.ts`

**Modified:**
- `server/app.ts` dacă e router separat
- `server/lib/par/totals.ts` — helper recalcul total (pur, testabil)

## Tests

- **T-PAR-102-1** [blocant] Given draft, When add linie qty=1 unit_price=700000, Then line_total=700000 + total PAR actualizat
- **T-PAR-102-2** [blocant] Given 2 linii, Then total = suma (computed server-side)
- **T-PAR-102-3** [blocant] Given qty≤0, Then 400
- **T-PAR-102-4** [normal] Given total > threshold, Then răspuns `above_micro_threshold=true`
- **T-PAR-102-5** [blocant] Live API smoke: login + add line + `GET /api/par/:id` → total corect

## DoD

- Portability + live-smoke verzi · reviewer APPROVED · personas salvate
