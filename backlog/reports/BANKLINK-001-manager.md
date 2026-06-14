# Persona Manager — BANKLINK-001

**Item:** BANKLINK-001 — Schema conectori bancari MD + import OFX/MT940 + dedup + seed
**Persona:** Andreea Mitran, director academie 6 locații

## Verdict: BUY

## Feedback

**LIKES:**
- Importul OFX din online banking e exact ce căutam — durează 2 click-uri vs 30min manual
- Dedup-ul e esential — download-uiesc extrasul de 2x pe lună și nu vreau duplicate
- Suport pentru 2 formate (OFX + MT940) acoperă toate băncile moldovenești pe care le folosesc
- Seed-ul demo cu MAIB + Moldindconbank e specific pentru Moldova — relevant pentru noi

**DISLIKES:**
- Nu există UI pentru import — trebuie să trimit fișierul prin API (technical debt pentru BANKLINK-002)
- Status "unmatched" nu are workflow de matching automat cu plăți din sistem
- Lipsesc notificări: "5 tranzacții noi importate — verifică în BankLink"

## BUY reason
Schema și backend-ul sunt solide. Dedup-ul funcționează. API-ul este complet.
UI-ul lipsește din BANKLINK-001 — e în BANKLINK-002/003. Dar fundația e excelentă.
Aceasta e funcția pentru care aș plăti în plus față de un CRM standard.
