# FIN-602 Manager Persona Report — Andreea Mitran

**Verdict: BUY**

## What she likes
- Badge roșu "Datorie: X RON" apare direct în lista de elevi — nu mai am nevoie de un raport separat
- Debt-summary endpoint: liste elevi cu restanțe ordonate descrescător — exact pentru urmărire
- PATCH invoice → paid scade automat datoria din profilul elevului
- Link payment ↔ invoice: pot reconcilia manual când un elev a plătit cash și trebuie legat de factură

## Friction points (informational)
- Adăugarea inițială a datoriei (onboarding date migrata) nu e acoperită — trebuie PATCH manual pe fiecare student
- GREATEST(0, ...) în Postgres e corect, dar nu garantăm atomicitate sub concurență mare (no transaction wrapper). Acceptabil MVP.

## Quote
"În fine! Văd direct cine are restanță. Nu mai sun contabila să mă întrebe."
