# PAR-103 Persona: Andreea Mitran (Manager)

**Verdict: BUY**

"Validarea IBAN mod-97 — aceasta e exact ce lipsea în sistemul vechi. Un IBAN greșit înseamnă bani returnați sau pierduți. Faptul că poți selecta un beneficiar salvat (fără să re-tastezi IDNP/IBAN de fiecare dată) va economisi timp și va reduce erorile. Și GDPR — câmpurile payee sunt vizibile doar celor autorizați."

**What works:**
- IBAN Moldova mod-97 validation rejects bad IBANs before submission
- IDNP 13-digit validation prevents typos
- Vendor registry snapshot: selecting an existing vendor copies data immutably to the PAR
- GDPR field restriction: payee data visible only to requestor/approver/finance/admin

**Friction noted:**
- UI for payee selection in the wizard (PAR-105) is critical — the API is ready
- Vendor autocomplete would be great (PAR-105 scope)
