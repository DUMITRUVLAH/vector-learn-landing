---
id: PAR-103
title: "End-use (secț. 11) + payee block (secț. 12) cu validare IBAN/IDNP + alegere vendor"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-101]
spec: backlog/specs/PAR-103-enduse-payee.md
core: backlog/par/PAR-CORE.md
---

## Goal

Captează descrierea utilizării finale (secțiunea 11) și blocul payee/beneficiar (secțiunea 12: Name,
IDNP, IBAN, Bank). Payee-ul poate fi ales dintr-un vendor existent (snapshot copiat pe PAR) sau introdus
inline cu validare strictă IBAN (mod-97) + IDNP (13 cifre). Datele payee sunt GDPR-sensitive (CORE §9).

## User stories

- **Ca** requestor, **vreau** să descriu pentru ce e plata, **pentru că** approverul trebuie să înțeleagă scopul.
- **Ca** requestor, **vreau** să aleg un beneficiar salvat, **pentru că** nu vreau să re-tastez IDNP/IBAN.
- **Ca** finance, **vreau** ca IBAN-ul să fie validat înainte de plată, **pentru că** un IBAN greșit înseamnă bani pierduți.

## Acceptance criteria

- [ ] `PATCH /api/par/:id` acceptă `end_use` (text), și fie `vendor_id` (snapshot din `par_vendors`), fie payee inline `{payee_name, payee_idnp, payee_iban, payee_bank}`
- [ ] La `vendor_id` setat → copiază name/idnp/iban/bank în câmpurile snapshot ale PAR (pentru istoric imutabil)
- [ ] Validare server: IBAN mod-97 (și format MD când începe cu `MD`); IDNP = exact 13 cifre; 400 la invalid (reutilizează `server/lib/par/validators.ts`)
- [ ] `end_use` obligatoriu când `purpose=execute_payment` (validat la submit — enforced în PAR-107, dar mesaj clar)
- [ ] Accesul la câmpurile payee restrâns la requestor(own)/approveri rutați/finance/admin (CORE §9)
- [ ] Doar pe `draft`/`changes_requested`, doar autor

## Files

**New:**
- (folosește `server/lib/par/validators.ts` din PAR-003 dacă există; altfel creează-l aici)
- teste `server/routes/__tests__/par-payee.test.ts`

**Modified:**
- `server/routes/par.ts` — extinde PATCH cu end_use + payee

## Tests

- **T-PAR-103-1** [blocant] Given IBAN `MD48ML000002259A19498121` → valid; `MD00…` → invalid (400)
- **T-PAR-103-2** [blocant] Given IDNP cu ≠13 cifre → 400
- **T-PAR-103-3** [blocant] Given purpose=execute_payment fără end_use, When submit, Then 400
- **T-PAR-103-4** [normal] Given vendor ales, Then snapshot copiat pe PAR
- **T-PAR-103-5** [blocant] Live API smoke: login + PATCH payee valid → 200

## DoD

- Portability + live-smoke verzi · reviewer APPROVED · ce-adversarial-reviewer (date financiare) · personas salvate
