# Persona Manager — CASH-001

**Persona:** Andreea Mitran, director academie
**Item:** CASH-001 — Schema fin_bank_transactions + fin_payments + fin_payment_allocations
**Verdict:** BUY

## Ce apreciază Andreea

- Schema este exactă: tranzacțiile bancare (imported), plățile (primite), și alocările (la facturi) sunt 3 entități distincte — nu s-a confundat conceptual
- `allocated_cents` pe `fin_payments` face calculul creditului nealocat simplu: `amount - allocated = credit`
- `match_status` pe `fin_bank_transactions` dă o imagine clară a ce e reconciliat și ce nu
- Seed-ul demonstrează cazuri reale: plată parțial alocată + plată neidentificată
- Prefix migration 0120 > max(origin/main)=0114 — fără coliziuni

## Fricțiuni

- Nu există FK real la `fin_parties` și `fin_invoices` (sunt pe ramuri nemergate) — comentariu clar în cod
- `fin_payments` nu are un status enum propriu (draft/confirmed) — Andreea ar vrea să marcheze o plată ca "confirmat" după reconciliere

## Concluzie

Fundație solidă. Alocarea parțială (un client plătește 10.000 din 15.000 MDL) este capturată corect. Merge înainte.
