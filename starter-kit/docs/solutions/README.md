# docs/solutions — memoria proiectului

Fiecare bug care a costat timp real trăiește aici, ca să nu se repete. Nu e documentație de
arhitectură — e un jurnal de incidente, scris ca să fie **găsit prin grep peste 6 luni**.

## Categorii

| Folder | Ce intră |
|--------|----------|
| `build-errors/` | build-uri picate, import-uri lipsă, probleme de bundling/typecheck |
| `database-issues/` | migrări, drift de schemă, forme de rezultat, deadlock-uri, performanță de query |
| `frontend/` | ecrane albe, crash-uri de randare, probleme de rutare, stări de UI |
| `security-issues/` | scurgeri între tenanți, autorizare, secrete, webhook-uri neverificate |
| `architecture-patterns/` | decizii care s-au dovedit corecte sau greșite, pattern-uri de urmat |

## Format

```markdown
---
title: <simptomul, cum îl va căuta cineva peste 6 luni>
category: database-issues
date: 2026-08-09
symptoms: ["500 pe /api/orders", "invalid input syntax for type uuid", "ecran alb după login"]
---

## Simptom
<cuvintele exacte din loguri / din UI — ca să fie găsibile prin grep>

## Cauza-rădăcină
<mecanismul, o propoziție + de ce n-a fost prins mai devreme>

## Fixul
<ce s-a schimbat, cale de fișier + commit>

## Guard-ul
<testul sau scriptul care blochează regresia, cu calea lui>

## Regula generală
<fraza adăugată în CLAUDE.md dacă e o clasă de bug; altfel "one-off">
```

## Cum se folosește

- **Înainte** de a începe lucru într-o zonă: `grep -ril "<cuvânt-cheie>" docs/solutions/`.
  Nu re-învăța un bug deja plătit o dată.
- **După** fiecare bug care a ajuns la owner sau în producție: lansează agentul `lesson-keeper`.
- O notă fără secțiunea **Guard** e incompletă — înseamnă că regresia se poate întoarce mâine.
