# FIN-604 — Manager Persona Report (Andreea Mitran)

**Verdict: BUY**

## Observations

### LOVES
- XML download button per factură = 2 click-uri pentru contabilă, nu zile de Excel manual
- SAGA CSV export cu filtrare lunară exact pentru raportare contabilă
- VAT breakdown automat (bază + TVA 19%) în CSV — nu mai calculează manual
- e-Factura status="pending" pe factură = audit trail clar înainte de trimiterea la ANAF

### CONCERNS (minor, non-blocking)
- CUI/CNP client lipsă în CSV (câmpul există dar e gol) — acceptabil ca stub, va fi completat din profil client
- Trimiterea reală la ANAF nu e implementată (stub doar) — așteptat pentru FIN-604, documentat clar
- Supplier CUI hardcodat "VECT SRL" — acceptabil pentru demo; productiv → din tenant settings

### GDPR / Compliance
- CSV este tenant-scoped (nu există leak cross-tenant)
- XML este generat on-demand, nu stocat pe server — nu necesită retenție politică specială

## Andreea's quote
"Contabila mea pierde 2 ore pe lună exportând facturi manual. Acum un click pentru XML, un click pentru CSV SAGA. BUY fără ezitare."

---
Generated: 2026-05-30 | Item: FIN-604
