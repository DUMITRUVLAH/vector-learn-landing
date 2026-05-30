# BRANCH-703 — Persona Manager (Andreea Mitran) Report

**Date:** 2026-05-30
**Verdict:** BUY

## Scenario
Andreea hired Mihai as manager for the Cluj branch. She wants Mihai to see ONLY Cluj students, lessons, invoices — not Iași or București data.

## Reaction
"Exact ce mi-am dorit! Am un manager de filială căruia nu vreau să-i dau acces la tot. Îl asignez la Cluj și el vede doar Cluj. Fără să configurez 20 de permisiuni individual — un singur câmp. Și eu, ca owner, văd tot, ca înainte."

## Points of satisfaction
- BUY: Single `branch_scope` field per user — simple to understand.
- BUY: Admin gate on PATCH endpoint — Mihai nu poate să-și schimbe singur accesul.
- BUY: Transparent — scoped manager nu vede că datele sunt filtrate, e pur și simplu ce are el.

## Points of friction
- "Nu există UI să asignez filiala unui user — trebuie să fac PATCH la API? Asta e tehnic." (UI vine în SET-8xx; spec BRANCH-703 spune explicit că endpoint-ul e expus, UI vine mai târziu.)
- "Vreu să știu și eu care useri au ce filiale asignate." (Out of scope pentru BRANCH-703.)

## GDPR
- Scoped manager nu vede date din alte filiale — conform GDPR: minimizarea accesului la date.
