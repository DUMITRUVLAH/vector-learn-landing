# PAR-112 — Persona Manager Report (Andreea Mitran)

**Date:** 2026-06-12
**Item:** PAR-112 — Finance queue + section 16
**Verdict: BUY**

## Feedback

**Loves:**
- Coada de finanțe e exact ce lipsea: o listă unică cu toate PAR-urile aprobate de plătit
- Formularul secțiunii 16 (PAR BL / Received By / Assigned To) reproduce exact câmpurile din formularul pe hârtie
- Guard de rol (finance/par_admin): nu poate accesa oricine
- obtain_quotations/provide_estimate sunt excluse corect — nu se plătesc, deci nu apar
- Statusuri clare (aprobat, la finanțe, re-aprobare necesară) cu chips vizibili

**Concerns:**
- Câmpurile "Received By" și "Assigned To" acceptă orice text/UUID — ar fi util un picker cu utilizatorii din tenant

**Friction notes for next sprint:**
- Un picker de utilizatori pentru Received By / Assigned To (autocomplete)
- Link direct din coadă la pagina de detaliu PAR pentru context complet
