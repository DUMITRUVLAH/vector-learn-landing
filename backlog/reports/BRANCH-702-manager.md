# BRANCH-702 — Persona Manager (Andreea Mitran) Report

**Date:** 2026-05-30
**Verdict:** BUY

## Scenario
Andreea manages 6 locations (Cluj, Iași, Timișoara, București, Sibiu, Brașov) with 1400 students.
Every Monday she checks which students are active at the Cluj location for a quick headcount.

## Reaction to BranchSwitcher
"In sfârșit! Am căutat asta de când am deschis a doua filială. Sunt în pagina Elevi, dau click pe dropdown, selectez Cluj, și văd doar elevii mei din Cluj. Nu mai trebuie să export tot și să filtrez în Excel. E suficient de vizibil în header fără să distragă atenția. Badge-ul portocaliu când am o filială selectată mă atenționează să nu uit că văd date parțiale — apreciez asta."

## Points of satisfaction
- BUY: Dropdown clar în header, nu ascuns în settings.
- BUY: "Toate filialele" ca opțiune default — nu schimbă comportamentul existent.
- BUY: Starea se salvează între refresh-uri (localStorage) — nu trebuie să selectez din nou.
- BUY: Badge vizibil când e filtrată o filială specifică.

## Points of friction
- "Aș vrea ca și pagina Orar și Plăți să filtreze după filială, nu doar Elevi." (Out of scope BRANCH-702; noted for BRANCH-703/704.)
- "Nu văd un buton să resetez filtrul rapid fără să deschid dropdown-ul." (Minor; can click "Toate filialele".)

## GDPR note
- No PII leakage between tenants. Branch list is tenant-scoped.
