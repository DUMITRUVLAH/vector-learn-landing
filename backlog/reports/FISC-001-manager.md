# FISC-001 — Persona Manager (Andreea Mitran)

**Item**: FISC-001 — Schema fin_tax_periods + fin_tax_declarations + migrare 0121
**Verdict**: MAYBE

## Feedback

Din perspectivă de director financiar cu 6 locații și GDPR, infrastructura de date fiscale este
necesară. Tabelele par bine structurate:

- `fin_tax_periods` cu tipuri lunar/trimestrial/anual — corect, reflectă realitatea MD și RO
- `fin_tax_declarations.payload` JSONB — bun pentru flexibilitate fără migrare la fiecare schimbare de legislație
- Tenant isolation + cascade delete — corect

MAYBE (nu BUY) deoarece la acest stagiu este doar schemă — nu există niciun UI sau funcționalitate vizibilă. Valoarea va fi clară la FISC-002 (calcul) și FISC-003 (generare declarații).

**Friction**: Nicio fricțiune la nivel de schemă — dar aștept cu nerăbdare FISC-003 pentru că generarea declarațiilor TVA12 manual îmi ia 45 minute lunar.
