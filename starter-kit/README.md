# Starter kit de development

Regulile + agenții + comenzile pe care le pui într-un proiect nou din prima zi. Totul aici e
distilat din incidente reale: outage-uri în producție, bug-uri scăpate la client, muncă pierdută
prin comenzi git greșite.

## Ce conține

```
CLAUDE.md                          contractul de development (regula zero, git, gate-uri, DB, securitate, DoD)
.claude/agents/
  orchestrator.md                  dirijorul: build → review → fix → test → ship
  feature-builder.md               scrie codul; și modul FIXER pentru findings/teste picate
  code-reviewer.md                 review independent din git diff (corectitudine, contract, securitate)
  integration-reviewer.md          se leagă de restul aplicației, sau e o insulă?
  test-runner.md                   gate-uri + smoke real pe aplicația pornită
  git-shipper.md                   commit-uri atomice, rebase, push în siguranță, PR structurat
  lesson-keeper.md                 transformă fiecare bug într-un guard permanent
.claude/commands/
  ship.md                          /ship  — gate-uri → commit → push → PR
  review.md                        /review — review complet, fără să livreze nimic
scripts/
  check-undefined-refs.mjs         gate de build: import lipsă = ecran alb în prod
docs/solutions/
  README.md                        memoria proiectului: jurnal de incidente găsibil prin grep
```

## Instalare într-un proiect nou

```bash
cp -R starter-kit/. /calea/spre/proiect-nou/
cd /calea/spre/proiect-nou
```

Apoi:

1. **Completează §1 din `CLAUDE.md`** (stack, comenzi, prod URL, owner). Cât timp tabelul e gol,
   agenții ghicesc — și ghicesc prost.
2. **Șterge ce nu se aplică.** N-ai DB? Șterge §5. N-ai frontend? Șterge §8. Un contract cu
   secțiuni irelevante se citește pe diagonală și își pierde autoritatea.
3. **Adaptează comenzile** din tabelul §1 la scripturile tale reale din `package.json`.
4. **Leagă gate-ul de build:**
   ```json
   "build": "node scripts/check-undefined-refs.mjs && <build-ul tău>"
   ```
5. **Adaptează `PROJECTS`** din `scripts/check-undefined-refs.mjs` la fișierele tale tsconfig.
6. Commit: `chore: add development contract, agents and build guards`

## Fluxul zilnic

| Vrei să… | Rulezi |
|----------|--------|
| construiești un feature mai mare de 10 linii | lansezi `orchestrator` cu cerința |
| verifici ce ai scris, fără să livrezi | `/review` |
| livrezi (gate-uri → commit → push → PR) | `/ship` |
| ai reparat un bug scăpat în prod | lansezi `lesson-keeper` |

## Cele trei reguli care contează cel mai mult

1. **„Gata" înseamnă executat, nu compilat.** Fiecare acțiune nouă se invocă o dată cu input
   real și se verifică status + forma răspunsului. Un buton care se randează nu dovedește nimic
   despre ce se întâmplă la click. (`CLAUDE.md` §2)
2. **Codul și schema se livrează împreună.** Deploy-ul automat mută cod, nu migrări și nu
   secrete. Fiecare PR spune explicit ce pași manuali rămân. (`CLAUDE.md` §5, §3.5)
3. **Fiecare bug devine un guard.** Cauză-rădăcină într-o propoziție + testul care pică pe codul
   vechi + nota în `docs/solutions/`. Un bug netransformat în guard se repetă. (`CLAUDE.md` §9)
