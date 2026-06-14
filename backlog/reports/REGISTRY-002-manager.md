# Persona Manager — REGISTRY-002
**Item:** REGISTRY-002 — API cote fiscale versionate + rateAt() helper extins
**Persona:** Andreea Mitran, director academie, 6 locații, 1400 studenți
**Verdict: BUY**

## Feedback

"API-ul de cote fiscale e exact ce mi-am dorit — pot interoga ce TVA era valabil la data facturii, și nu trebuie să-mi amintesc eu cotele istorice. Filtrarea pe dată e critică pentru auditele retroactive."

"Faptul că POST-ul e restricționat la owner/admin e corect — nu vreau că orice angajat să poată adăuga cote noi."

"rateAt() cu tenantId opțional e o decizie bună de arhitectură — modulele globale (FISC, SPEND) nu trebuie să furnizeze un tenant ca să obțină cota implicită."

## LIKES
- Date-based versioning pe cote fiscale
- Role guard pe POST (nu orice user poate adăuga cote)
- Fallback la cote globale când nu există override per tenant

## DISLIKES
- Lipsește un endpoint PATCH/DELETE pentru cote (le pot crea dar nu le pot corecta)
- Nu există notificare automată când o cotă expiră (ar trebui alert cu X zile înainte)

## Next milestone suggestions
- PATCH /api/fin/registry/tax-rates/:id pentru corectare (perioadă/procent greșit)
- Alert proactiv la 30 zile înainte de expirarea unei cote active
