# PAR-109 — Persona: Andreea Mitran (Manager)

**Verdict: BUY**

## Reaction

"Acesta e genul de garanție de care am nevoie la audit extern — nimeni nu poate aproba un pas dacă cel dinainte nu e semnat, nimeni nu poate modifica suma după ce a fost înaintată pentru aprobare, și există o amprentă digitală (hash) care dovedește că documentul nu a fost alterat."

## Highlights
- Ordinea aprobărilor e impusă la nivel de sistem (nu de bune intenții)
- Integritate cryptografică: hash stocat la submit, re-verificat la fiecare vizualizare
- Re-submit după modificări generează un lanț complet nou (ce a fost aprobat înainte nu mai e valid)
- Escaladare automată: sumele mari trec obligatoriu prin mai mulți aprobatori

## Friction
- Interfața nu afișează (încă) un banner roșu când `body_hash_valid = false` — asta vine la PAR-118 (detail page)
