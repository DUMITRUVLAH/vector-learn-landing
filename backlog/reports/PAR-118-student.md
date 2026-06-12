# PAR-118 Persona: Maria (Student, 14 ani) + Cristina (Mama)

**Item:** PAR-118 — /app/par/:id full parity
**Date:** 2026-06-12

## Maria (14 ani, student)

**Verdict: PASS**

Maria nu e utilizatorul principal al modulului PAR. E un instrument de procurement pentru personalul administrativ. Maria nu e implicată.

## Cristina (mama Mariei, plătitor)

**Verdict: PASS**

Cristina ar putea vedea o cerere PAR dacă e solicitantul sau dacă primește o notificare (PAR-111). 

Ca requestor, ea ar vedea:
- Starea cererii sale (chip verde/galben/roșu)
- Unde e blocată: "La DOA Holder — în așteptare"
- Butonul "Anulează" dacă vrea să retragă
- PDF-ul cererii dacă vrea să-l printeze

Interfața e clară. Textul e în română. Butoanele au minim 44px. Nu e confuză pentru un utilizator cu experiență medie în web.

Cristina ar aprecia să vadă display name-ul solicitantului în loc de UUID. Dar asta e un enhancement, nu un blocant.

## Summary

Modulul PAR nu e destinat utilizatorilor-final (elevi/părinți). E un tool intern de procurement. Ambii utilizatori marchează PASS — pagina e corectă pentru scopul ei.
