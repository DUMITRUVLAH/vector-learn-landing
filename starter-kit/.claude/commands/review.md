---
description: Review complet al diff-ului curent — corectitudine, integrare, gate-uri — fără să livreze nimic.
---

Fă un review complet al schimbărilor de pe branch-ul curent, **fără** să comiți sau să împingi nimic.

1. Arată forma schimbării: `git diff origin/main...HEAD --stat`.
2. Lansează în paralel:
   - **code-reviewer** — corectitudine, contract, securitate, wiring, teste, design system
   - **integration-reviewer** — se leagă de restul aplicației, sau e o insulă?
3. Lansează **test-runner** pentru gate-urile statice + smoke-ul real pe acțiunile atinse.
4. Sintetizează într-o singură listă, sortată după severitate:

```
[BLOCANT]   fișier:linie — ce se strică, cu input concret
[IMPORTANT] fișier:linie — ce datorie rămâne
[NIT]       fișier:linie — max 3
```

5. Verdict: `GATA DE LIVRAT` / `NECESITĂ FIX` (+ ce anume) / `ABORDARE GREȘITĂ` (+ de ce).

Nu repara nimic în pasul ăsta. Dacă owner-ul vrea fix-urile aplicate, o cere explicit.
