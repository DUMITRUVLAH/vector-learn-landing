# SCHOOL-001 — Persona Manager: Andreea Mitran

**Verdict: BUY**

> „În fine! Avem un an școlar structurat cu semestre și clase permanente. Pot înscrie elevii în
> clase, știu câte locuri mai sunt libere și văd dirigintele fiecărei clase. Exact ce am nevoie
> pentru școala noastră privată."

## Ce funcționează bine
- An școlar + termene: structura reflectă exact cum funcționează o școală reală (semestru I/II).
- Clasa cu capacitate limitată → 409 la supraînscriere. Asta îmi salvează dureri de cap administrative.
- „isCurrent" per tenant: schimb de an fără să stric datele vechi.
- UI clar: lista clase cu contorul de elevi și butonul de înscriere.

## Fricțiuni
- Nu pot vedea lista completă de elevi înscriși per clasă — doar contorul. Aș vrea să dau click și
  să văd cine e în clasă (vin cu asta în SCHOOL-003 probabil).
- Lipsesc subiectele/materiile — dar știu că vin în SCHOOL-002.

## GDPR
- tenantId pe fiecare rând — bine.
- Datele elevilor rămân segregate per tenant.

## ROI
- Fundația oricărui modul de școală. Fără asta nu pot construi catalog, prezență, note.
