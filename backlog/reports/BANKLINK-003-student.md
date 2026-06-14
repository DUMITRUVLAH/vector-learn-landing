# BANKLINK-003 — Persona Student/Parent Review

**Personas:** Maria (14 ani, studentă) + Cristina (mama, plătitoare)
**Feature:** Auto-match tranzacții bancare → reconciliere
**Verdict:** PASS

## Maria

Nu interacționez cu reconcilierea — asta e pentru contabile și directoare.
Dar dacă plata mamei e detectată mai repede, nu mai primesc mesaje de "factură neplătită" la 3 zile după ce mama a plătit.

## Cristina (mama)

Nu văd coada de reconciliere direct. Dar experiența mea se îmbunătățește indirect:
- Plata mea e potrivită automat cu factura → nu mai primesc reminder de plată neplătită după 3 zile
- Nu mai sună directoarea să întrebe dacă am plătit — sistemul o știe deja

Riscul de care mă tem: dacă motorul face o potrivire greșită (suma mea e potrivită cu factura altui student), se pot crea confuzii. Sper că e confirmare manuală, nu automat-commit. (Da, scorBp ≥ 8500 = matched, dar se poate corecta manual — OK)

## Verdict

PASS — feature invizibil pentru studenți, dar aduce valoare reală pentru experiența de plată indirectă.
