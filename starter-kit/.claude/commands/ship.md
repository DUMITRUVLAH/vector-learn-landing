---
description: Rulează gate-urile complete, apoi comite, face rebase, push și deschide PR-ul.
---

Livrează munca din working tree-ul curent, în ordinea asta, fără să sari pași:

1. `git status --short` — dacă vezi modificări care nu-ți aparțin din sesiunea asta, **oprește-te
   și întreabă**. Nu curăța nimic.
2. Dacă ești pe `main`, creează branch: `git fetch origin && git switch -c feat/<slug> origin/main`.
3. Lansează agentul **test-runner**. Dacă verdictul nu e `PASS` sau `PASS_WITH_WARNINGS` →
   lansează **feature-builder** în mod FIXER cu output-ul picat, apoi re-rulează. Repară, nu sări.
4. Lansează agentul **code-reviewer** pe `git diff origin/main...HEAD`. Findings BLOCANTE →
   FIXER → re-review.
5. Lansează agentul **git-shipper**: commit-uri atomice, rebase pe `origin/main`, push,
   `gh pr create` cu corpul structurat (Ce face / De ce / Cum am verificat / Risc / Pași manuali).
6. Dacă pe drum a apărut un bug real, lansează **lesson-keeper** ca să-l transforme în guard.

Raportează la final doar: URL-ul PR-ului, starea CI, și ce a rămas de făcut manual la deploy.
Fără tabele de recapitulare, fără emoji.

Argument opțional: `$ARGUMENTS` = titlul PR-ului. Dacă lipsește, deduce-l din diff.
