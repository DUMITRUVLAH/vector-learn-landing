# „Poarta e2e e verde" nu însemna „build-ul de producție trece"

**Categorie:** build-errors · **Data:** 2026-09-22 · **Găsit de:** deploy-ul Vercel, după un push în `main`

## Simptom
Toate porțile locale verzi (`npm run e2e:browser` — 34/34), teste verzi, push în `main` — iar
deploy-ul a picat imediat:

```
❌ Build oprit la pasul: moneda cererii pe ecrane și în PDF
   src/pages/par/ParDashboard.tsx:732  formatMDL(… totalEstimatedCents …)
```

Producția a rămas pe versiunea anterioară (clientul nu a văzut nimic rupt), dar funcționalitatea
livrată nu a ajuns nicăieri până la reparație.

## Cauza reală
Două liste descriau aceeași regulă și au divergat:

| | gărzi rulate |
|---|---|
| `scripts/vercel-build.mjs` (prod) | vercel-config, undefined-refs, route-mounts, **nav-links**, **par-currency**, migration-breakpoints |
| `scripts/e2e-gate.mjs` (local) | undefined-refs, route-mounts, migration-breakpoints |

Poarta locală era un SUBSET. Orice gardă adăugată build-ului de-a lungul timpului nu ajungea
automat și în poartă, deci „verde local" nu spunea nimic despre acele clase de bug.

Bug-ul propriu-zis era real, nu un fals pozitiv: `formatMDL(par.totalEstimatedCents)` în dialogul de
arhivare ar fi scris „0,00 **L**" peste o sumă în euro.

## Cum s-a reparat
Lista trăiește acum într-un singur loc — `scripts/lib/prebuild-guards.mjs` — de unde o citesc ȘI
`vercel-build.mjs`, ȘI `e2e-gate.mjs`. Poarta locală rulează exact gărzile pe care prod-ul le impune.

Verificat invers (fără asta, reparația nu e probată): cu `formatMDL` pus la loc, `npm run e2e` pică
pe pasul „moneda cererii pe ecrane și în PDF". Garda poate să pice, deci chiar verifică ceva.

## Regula
O gardă care rulează doar în build-ul de producție e o gardă pe care o descoperi prin eșec de
deploy. Când adaugi una, adaug-o în `STATIC_GUARDS` — nu în `vercel-build.mjs` direct.

Vezi și: [e2e-browser-false-negatives](../frontend/e2e-browser-false-negatives.md),
[undefined-refs-ship-white-screen](./undefined-refs-ship-white-screen.md).
