# CASH-003 — Persona Manager Report (Andreea Mitran)

**Item:** CASH-003 — Alocare plată↔factură + credit nealocat + coada nepotrivite
**Date:** 2026-06-14
**Verdict:** BUY

## Evaluation

Andreea (director 6 filiale, 1400 studenți):

"În fine! Asta era lipsa cea mare — știam că am bani primiți, dar nu știam câți sunt 'liberi'.
Credit-summary per client îmi arată exact pe cine pot factura fără să cer bani suplimentari."

"Protecția împotriva supraalocării (422 cu mesaj clar) e esențială — altfel contabilul putea
aloca mai mult decât a primit și nu am fi prins eroarea decât la bilanț."

"Butonul 'Creează plată din tranzacție' rezolvă coada de nereconciliate rapid. Nu mai trebuie
să încrucișez 3 ecrane pentru a lega o tranzacție bancară cu un client."

## Concerns

- Credit-summary agregă per party_id — dacă party_id e null (client neidentificat), suma
  apare ca 'unknown'. Ar fi util un fallback label în UI (CASH-004 task).
- Nu există validare că invoiceId aparține aceluiași tenant — se va adăuga când fin_invoices
  se mergeuiesc pe main (FK real în migration).

## Score: 9/10
