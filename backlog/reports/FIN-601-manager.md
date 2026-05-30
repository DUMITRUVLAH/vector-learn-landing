# FIN-601 Manager Persona Report — Andreea Mitran

**Verdict: BUY**

## What she likes
- Serie incrementală VECT-2026-0001 — exact ce primesc pentru ANAF
- PDF descarcabil cu un click (tab nou, printabil direct)
- Legătura opțională la o plată existentă — evit re-introducerea datelor
- Filtru rapid pe status și lună pentru contabilitate lunară
- Badge-uri clare: Ciornă / Emisă / Plătită / Anulată

## Friction points (informational, not blocking)
- Counter SELECT MAX+1 nu e atomic — sub concurență mare pot apărea duplicate. Acceptabil pentru demo; producție va folosi SEQUENCE sau SELECT FOR UPDATE.
- Butonul "Plătit" din tabel marchează factura paid, dar nu actualizează și payments.status — în FIN-602 se va lega automat.
- Nu există notificare email la emitere factură (backlog US-PAY-10).

## Quote
"Îmi place că pot să văd seria completă și să descărc PDF-ul direct. Asta o dau contabilei și gata. Aștept să se lege automat cu datoria elevului."
