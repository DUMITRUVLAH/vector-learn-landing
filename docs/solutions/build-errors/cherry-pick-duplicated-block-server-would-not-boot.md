# Serverul nu mai pornea, deși build-ul și testele erau verzi

**Categorie:** build-errors · **Data:** 2026-09-01 · **Găsit de:** poarta e2e, după un cherry-pick

## Simptom
`npm run e2e` a murit cu „serverul nu a pornit în 60s". Pornit manual:

```
ERROR: The symbol "words" has already been declared   server/routes/parAiPrefill.ts:257
```

Înainte de asta trecuseră: `check-undefined-refs`, `vite build`, `check-route-mounts`,
`schema-drift` și 500+ teste unitare.

## Cauza reală
Un `git cherry-pick` al unui commit vechi a reaplicat un bloc pe care `main` îl avea deja (aceeași
logică ajunsese pe main pe altă cale). Git nu vede duplicarea semantică: contextul diferea, deci
patch-ul s-a aplicat curat, iar fișierul a rămas cu `const words` de două ori.

De ce n-a prins nimic:
- `vite build` compilează DOAR frontendul — codul de server nici nu e atins;
- poarta de referințe nedefinite gatea pe TS2304/TS2552; o redeclarare e **TS2451**;
- testele unitare rulate atunci nu importau ruta afectată.

## A doua greșeală, mai scumpă (procesul, nu codul)
Reparasem duplicatul în working tree, dar **nu îl comisesem**. Un `git reset --hard HEAD` de mai
târziu (dintr-un merge de probă) l-a șters, iar commit-ul plecat spre `main` conținea încă bug-ul.
Deploy-ul a picat la build, deci producția a rămas pe versiunea anterioară — noroc, nu proces.

## Cum s-a reparat
1. Blocul duplicat, șters; serverul pornește (verificat pe `/api/health`).
2. `scripts/check-undefined-refs.mjs` gatează acum și pe **TS2451** (redeclarare) și **TS2393**
   (funcție implementată de două ori). NU pe TS2300 — acela apare și pentru tipuri, care dispar la
   compilare. Probă negativă rulată: cu duplicatul pus la loc, poarta pică.

## Regulile de reținut
> Un cherry-pick dintr-o ramură veche poate **dubla** cod, nu doar să intre în conflict. După orice
> cherry-pick/merge, pornește serverul, nu doar build-ul frontend.

> Nu apăsa `git push` cu working tree murdar: ce nu e commis nu pleacă, iar un `reset --hard` de mai
> târziu îl șterge fără urmă. `git status --short` gol înainte de push, iar porțile se rulează
> DUPĂ commit, nu peste modificări nesalvate.
