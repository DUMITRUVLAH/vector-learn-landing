---
title: „Ruta răspunde 401, deci deploy-ul e live" e o verificare FALSĂ — 401 vine din middleware, înainte de rutare
problem_type: architecture_pattern
module: deploy-verification, prod-safety
tags: [deploy, vercel, verificare, fals-pozitiv, requireAuth, prod]
symptoms: Am raportat „deploy live" la ~1 minut după push, în timp ce deploy-ul Vercel era încă „Building" — codul nou nu era în prod
severity: P2
date: 2026-08-28
---

## Simptom

După `git push origin HEAD:main` (feature-ul „Retrage și editează" pe PAR), am „confirmat"
deploy-ul cu:

```bash
curl -s -X POST -o /dev/null -w '%{http_code}' https://finflow1.vercel.app/api/par/<uuid>/withdraw
# → 401
```

și am raportat „deploy live: ruta răspunde 401 (auth), nu HTML". `vercel ls` arăta însă
deployment-ul de la acel push cu status **● Building**. Codul nu era în prod.

## Cauza

`requireAuth` e montat pe tot prefixul (`/api/par/*`), deci rulează **înainte** ca Hono să
decidă dacă subcalea există. O cerere neautentificată către o rută care NU EXISTĂ încă în
build-ul live primește exact același `401` ca una către ruta nouă. Testul nu distinge
codul vechi de cel nou — nu are nicio putere de discriminare.

Aceeași capcană cu orice check care se oprește la stratul de auth: `403`, redirect la login,
sau un `200` de la SPA fallback.

## Verificarea corectă

Caută un artefact care există DOAR în build-ul nou:

```bash
# 1. Frontend: hash-ul de asset + un string introdus de schimbare
idx=$(curl -s https://finflow1.vercel.app/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
pd=$(curl -s "https://finflow1.vercel.app$idx" | grep -o 'ParDetail-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://finflow1.vercel.app/assets/$pd" | grep -c "Retrage cererea din aprobare"   # 1 = live

# 2. Starea reală a deploy-ului
npx vercel ls --yes | head -5        # ● Building vs ● Ready, cu vârsta
```

Pentru API: fă cererea **autentificat** și verifică forma răspunsului (vezi memoria
[[prod-debug-authenticated-repro]]) — un `409 {error:"conflict: only a PAR pending approval..."}`
dovedește codul nou; un `401` nu dovedește nimic.

## Regula

> O verificare de deploy trebuie să poată **eșua** pe codul vechi. Dacă răspunsul ar fi identic
> înainte și după schimbare, nu e o verificare — e o coincidență. Alege întotdeauna un semnal
> care există numai în build-ul nou (string din bundle, hash de asset, formă de răspuns
> autentificată), nu unul produs de un middleware dinaintea rutării.

Legat: CLAUDE.md §0.2bis („după deploy, verific că prod chiar răspunde, autentificat, nu doar că
build-ul a trecut") și §3.5.1quater (testăm acțiunea, nu afordanța) — aceeași eroare de
raționament, mutată din teste în verificarea de producție.
