---
title: „500 pe toate rutele" după db:migrate — PGlite e exclusiv pe director
category: database-issues
symptoms:
  - toate rutele care ating baza răspund 500, brusc, fără o schimbare de cod
  - în logul serverului apare „Aborted" din @electric-sql/pglite
  - /api/health răspunde 200, dar orice interogare reală pică
---

## Ce s-a întâmplat

Serverul de dezvoltare rula (`PORT=3141 npm run server:dev`), iar în paralel am rulat
`npm run db:migrate` în același worktree. Ambele procese deschid ACELAȘI director `.pglite`, iar
PGlite îl ține exclusiv: al doilea proces îl smulge, iar instanța din server rămâne cu un handle
mort. Din acel moment fiecare interogare aruncă `Aborted`, deci fiecare rută dă 500 — inclusiv
poarta e2e, care a raportat „GET /api/docs/documents — status 500" imediat după o schimbare de cod
care nu avea nicio legătură.

Costul: un ciclu întreg de căutat bug-ul în codul nou, care era în regulă.

## Cum se repară

```bash
lsof -ti tcp:<port> | xargs kill   # oprește serverul
npm run db:migrate                 # abia acum aplică migrarea
PORT=<port> npm run server:dev     # repornește
```

## Regula

**Nu rula `db:migrate` / `db:reset` / `db:seed` cât timp serverul cu același `.pglite` e pornit.**
Ordinea corectă e mereu: oprește → migrează/seedează → pornește → rulează poarta.
(`db:reset` are aceeași problemă: șterge directorul de sub un proces viu.)

Semnalul care te scutește de căutare: dacă TOATE rutele de bază pică simultan, cu 200 pe
`/api/health`, e aproape sigur baza smulsă de sub proces, nu codul pe care tocmai l-ai scris.
Vezi și memoria „local-e2e-taskboard-sequence" și §0.4 (un worktree + un port per chat).
