---
title: Heal-ul generic de coloane trebuie să poarte DEFAULT-ul coloanei
date: 2026-09-24
category: database-issues
severity: medium
tags: [sync-schema, prod-safety, PAR, drizzle]
---

## Ce s-a întâmplat

Rejucând datele reale ATIC, 17 beneficiari aveau `par_vendors.kind = NULL` — inclusiv unii creați
pe 21.09. Fișa lor scria „Persoană fizică" pentru NEWS MAKER SRL sau Vector Academy SRL, iar
semnalul „compania e inactivă în registrul de stat" nu se declanșa (cere `kind === "company"`).

## Cauza (o propoziție)

`sync-schema.ts` adăuga coloanele lipsă cu `ADD COLUMN … <tip>`, fără default, iar Drizzle nu trimite
default-ul în INSERT — omite coloana și lasă baza să-l pună — deci orice inserare care nu numea
coloana scria NULL pe prod (9 coloane afectate, verificat pe `information_schema`).

## Reparația

- `server/db/literalDefault.ts` + heal-ul generic: coloana nouă primește `DEFAULT <literal>`, iar o
  coloană existentă fără default îl primește prin `ALTER COLUMN … SET DEFAULT`.
- `par_vendors.kind`: backfill după codul fiscal (IDNO 1… = companie, IDNP 0…/2… = persoană), apoi
  `NOT NULL`. Previzualizat read-only pe prod: 10 companii, 7 persoane, zero greșite.
- Cele două inserări care omiteau coloana o completează explicit (`vendorKindFor`).

## Regula

Orice coloană pe care heal-ul o adaugă trebuie să ajungă identică cu cea din schemă — tip ȘI default.
Testul: `vendorKindAndAmountGuard.test.ts` („literalDefault").
