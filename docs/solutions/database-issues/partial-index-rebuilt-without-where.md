---
title: sync-schema recrea indecșii parțiali FĂRĂ clauza WHERE
category: database-issues
date: 2026-09-26
module: server/db/sync-schema.ts
---

# sync-schema recrea indecșii parțiali fără `WHERE`

## Simptom (latent)

`ensureIndexes()` din `server/db/sync-schema.ts` citește indecșii declarați în schema Drizzle și îi
creează pe prod dacă lipsesc (pe prod migrările nu se aplică fiabil). Instrucțiunea pe care o
construia avea doar coloanele — **fără clauza `WHERE`** a unui index parțial. Pe un index unic
parțial asta schimbă regula de business:

- `crm_kpi_targets_default_uniq` (`UNIQUE (tenant_id, period, metric) WHERE user_id IS NULL`) ar fi
  devenit `UNIQUE (tenant_id, period, metric)` — adică o singură țintă pe metrică, iar ținta pe
  persoană ar fi dat 23505;
- `task_boards_one_default_uniq` (`UNIQUE (tenant_id) WHERE is_default`) ar fi devenit „un singur
  board per workspace".

S-a întâmplat să nu muște doar pentru că migrarea crease deja indexul cu același nume (iar
`ensureIndexes` sare peste numele existente). Orice mediu unde migrarea lipsea ar fi primit varianta
greșită, tăcut.

## Cauza, într-o frază

Configurația Drizzle a indexului are `where`, dar constructorul instrucțiunii îl ignora.

## Reparația

`server/db/ensureIndexStatement.ts` — funcție pură care întoarce `null` pentru un index parțial (și
pentru cei pe expresii). Indecșii parțiali se creează doar din migrare și din `ENSURE_STATEMENTS`
(ex. `server/db/ensure/tasks.ts`).

## Garda

`server/__tests__/ensure-index-statement.test.ts` parcurge schema REALĂ: orice index parțial nou
trebuie să iasă `null`. Pe codul vechi testul pică (instrucțiunea fără `WHERE` era generată).

## Regula

Un index parțial declarat în schemă trebuie să existe și ca instrucțiune completă (cu `WHERE`) în
migrare + în heal-ul din `server/db/ensure/*` — `sync-schema` nu-l poate reconstrui.
