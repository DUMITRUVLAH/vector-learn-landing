---
title: Markerele de conflict dintr-un rebase au trecut de poarta de build
category: build-errors
date: 2026-09-26
tags: [rebase, merge-conflict, check-undefined-refs, TS1185]
---

## Ce s-a întâmplat

La rebase-ul modulului de comunicare (COMMS-302) peste `origin/main`, un commit a avut **trei**
fișiere în conflict: `LeadDetailSheet.tsx`, `App.tsx` și `BusinessShell.tsx`. Output-ul a fost
citit cu `tail`, care arăta doar ultimul conflict. Am rezolvat unul singur, apoi `git add -A` +
`rebase --continue` au comis markerele `<<<<<<< HEAD` în celelalte două.

`npm run check-refs` a raportat **verde**. Suita de teste le-a prins („Merge conflict marker
encountered"), dar numai pentru că rulam fișierele respective.

## Cauza, într-o propoziție

`scripts/check-undefined-refs.mjs` gatea pe o listă fixă de coduri TypeScript de sintaxă, în care
lipsea **TS1185** („Merge conflict marker encountered"). Un fișier cu markere trecea deci de poartă
și ar fi rupt abia `vite build`, lăsând `main` roșu.

## Garda

- `TS1185` e acum în `SYNTAX_CODES`. Testul negativ: un marker adăugat în `src/lib/utils.ts` face poarta roșie.
- Regula de lucru: după rezolvarea conflictelor, ÎNAINTE de `rebase --continue`:
  ```bash
  git diff --name-only --diff-filter=U     # trebuie să fie gol
  git diff --check                          # prinde markerele rămase
  ```
  Nu citi output-ul unui rebase cu `tail`: lista de conflicte e la început.
