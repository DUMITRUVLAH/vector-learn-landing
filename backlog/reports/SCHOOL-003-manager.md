# SCHOOL-003 — Persona Manager: Andreea Mitran

**Verdict: BUY**

> „Catalog digital de prezență — exact ce ne lipsea! Profesorii pot marca P/A/Î/X pentru fiecare
> elev direct din interfață, nu mai pierdem cataloage fizice. Rata de prezență per elev o văd din API."

## Ce funcționează bine
- Sesiune idempotentă: GET crează automat sesiunea dacă nu există — profesorul nu trebuie să facă
  2 pași.
- Upsert bulk: salvez tot catalogul dintr-o dată, nu câte un elev.
- Istoricul elevului cu filtrare pe perioadă — pot face rapoarte trimestriale.
- UI cu butoane P/A/Î/X color-coded: intuitiv, rapid.

## Fricțiuni minore
- Nu am încă notificări automate pentru părinți la absențe (în spec ca future work).
- Motivul absenței e opțional — ar trebui să pot obliga introducerea motivului.
