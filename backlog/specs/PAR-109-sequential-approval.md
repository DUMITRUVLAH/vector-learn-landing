---
id: PAR-109
title: "Aprobare secvențială multi-nivel + escaladare prag + lock pe pași + integritate (immutable)"
milestone: PAR
phase: "C"
status: pending
attempts: 0
depends_on: [PAR-108]
spec: backlog/specs/PAR-109-sequential-approval.md
core: backlog/par/PAR-CORE.md
---

## Goal

Întărește garanțiile fluxului de aprobare: pașii se decid strict în ordine (lock), corpul cererii e
imutabil după submit (verificat prin hash), iar escaladarea pe praguri funcționează (sume mari → mai
mulți aprobatori, incl. Executive Director). Acest item închide edge-case-urile de integritate pe care
PAR-107/108 le-au schițat.

## User stories

- **Ca** auditor, **vreau** garanția că nimeni nu sare peste un pas, **pentru că** ordinea aprobărilor e regula.
- **Ca** organizație, **vreau** ca o cerere aprobată să nu mai poată fi modificată în spate, **pentru că** s-ar invalida aprobările.
- **Ca** CFO, **vreau** ca sumele mari să treacă obligatoriu pe la mine, **pentru că** răspund de buget.

## Acceptance criteria

- [ ] Out-of-order blocat: a decide un pas `locked` (înainte ca precedentul să fie `approved`) → 409
- [ ] Imutabilitate: orice `PATCH`/modificare de line-items pe un PAR ne-`draft`/ne-`changes_requested` → 403
- [ ] Verificare hash: re-calcularea hash-ului corpului la afișare/PDF coincide cu cel salvat la submit; mismatch → flag de integritate în răspuns + audit
- [ ] Escaladare: total > 100k (din matrice) → lanț de 3 pași; pragurile vin din `par_doa_matrix` (configurabil)
- [ ] Când `changes_requested` → la re-submit, lanțul vechi se invalidează și se regenerează (hash nou)
- [ ] Toate tranzițiile scriu `par_audit` (consumat de PAR-110)

## Files

**Modified:**
- `server/lib/par/submit.ts`, `server/routes/parApprovals.ts`, `server/routes/par.ts`
- `server/lib/par/integrity.ts` — hashing + verify (pur, testabil)

**New:**
- `server/lib/par/__tests__/integrity.test.ts`

## Tests

- **T-PAR-109-1** [blocant] Given step2 locked, When approve step2 înainte de step1, Then 409
- **T-PAR-109-2** [blocant] Given PAR pending_approval, When PATCH line items, Then 403
- **T-PAR-109-3** [blocant] Given hash la submit, When re-calc la afișare, Then coincide
- **T-PAR-109-4** [normal] Given total > 100k, Then lanț de 3 pași
- **T-PAR-109-5** [blocant] Given re-submit după changes_requested, Then lanț nou + hash nou

## DoD

- Portability + live-smoke verzi · ce-adversarial-reviewer · reviewer APPROVED · personas salvate
