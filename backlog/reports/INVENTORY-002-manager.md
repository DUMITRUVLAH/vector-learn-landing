# INVENTORY-002 — Persona Manager Report (Andreea Mitran)

**Verdict: BUY**

## Evaluare

Andreea vede valoare imediată în hook-ul invoice-issued. Până acum, când emitea o factură pentru
cursuri sau materiale, trebuia să actualizeze manual stocul în alt registru. Acum ieșirea din stoc
se face automat la emiterea facturii — un flux pe care l-a dorit de mult.

Hook-ul `/hook/purchase` este direct util: atunci când comandă 500 de caiete, îl înregistrează
o singură dată și costul mediu ponderat se recalculează automat.

## Citate

> "În sfârșit nu mai trebuie să actualizez stocul manual după fiecare factură! Îmi economisești
> cel puțin 30 minute pe zi."

> "CMP-ul recalculat automat la fiecare achiziție — exact cum funcționează în contabilitate.
> Contabila mea va fi mulțumită."

> "Alertele de stoc minim + valoarea totală pe un singur endpoint — perfect pentru raportul lunar."

## Fricțiuni

- Nu există încă un UI pentru a vedea ce s-a întâmplat cu stocul după hook — se rezolvă în INVENTORY-003.
- Hook-ul `/hook/invoice-issued` trebuie integrat în logica de emitere a facturilor (BILL module).
  Momentan e manual.
