---
title: Nu livra o schimbare de comportament care depinde de o migrare de date
date: 2026-08-07
category: database-issues
severity: high
tags: [migrations, authorization, prod-safety, PAR]
---

## Ce s-a întâmplat

Auditul PAR a găsit că orice utilizator cu rolul de tenant `manager` deținea
`par_admin` implicit — aproba cereri de plată, citea auditul, își acorda singur
roluri — fără să apară în lista de membri. Corectura părea evidentă: restrânge
`IMPLICIT_PAR_ADMIN_TENANT_ROLES` la `["admin"]`.

Restrângerea a fost livrată împreună cu migrarea `0137`, care materializa întâi
drepturile fiecărui manager într-un rând `par_members` explicit — exact ca nimeni
să nu piardă acces. Ambele au plecat în producție în același PR (#276).

**Plasa de siguranță nu a putut fi verificată după merge.** `DATABASE_URL` e gol
în dump-ul local de env, deci producția nu era interogabilă. Iar proiectul are un
istoric confirmat de migrări drizzle care nu se aplică pe prod (schema e cărată de
`sync-schema`), iar `0137` e o migrare de **date**, pe care `sync-schema` nu o
acoperă prin construcție.

Rezultat: pentru un interval, producția putea rula codul restrâns fără
materializarea care îl făcea sigur — adică managerii puteau pierde în tăcere
dreptul de aprobare a plăților. Reparat prin revenire (#277).

## Cauza

O schimbare de comportament și migrarea care o face sigură au fost tratate ca un
singur pas. Nu sunt: codul ajunge în producție prin build, datele ajung prin
migrare, iar în acest proiect al doilea canal este cunoscut ca nesigur.

## Regula

**Când o schimbare de comportament devine sigură doar pentru că o migrare a rulat,
livrează-le în DOUĂ tranșe și verifică între ele.**

1. Tranșa 1: doar migrarea (aditivă, fără schimbare de comportament).
2. **Verifică pe producție** că a produs efectul — interoghează, nu presupune.
3. Tranșa 2: schimbarea de comportament.

Dacă producția nu e interogabilă, tranșa 2 nu pleacă. „Migrarea e în PR" nu e
dovadă că a rulat — vezi și `prod-migration-tracking-desynced`.

## Semnale că ești în acest caz

- Diff-ul conține și un `.sql` de date, și o schimbare de reguli/autorizare.
- Fraza „materializează întâi, ca nimeni să nu piardă acces" apare în descriere.
- Schimbarea restrânge un drept (revocă), nu îl acordă.

Pentru orice restrângere de drepturi pe un sistem cu utilizatori reali, întreabă:
*dacă migrarea NU a rulat, ce pierde utilizatorul, și își dă seama de ce?* Dacă
răspunsul e „acces, și nu", nu livra.

## Vezi și

- `drizzle/0137_par_materialize_manager_admins.sql` — migrarea în cauză
- `server/middleware/requirePARRole.ts` — comentariul de lângă constantă are pașii
  exacți de finalizare
- `scripts/e2e-par-security.mjs` — suita care a descoperit gaura inițială
