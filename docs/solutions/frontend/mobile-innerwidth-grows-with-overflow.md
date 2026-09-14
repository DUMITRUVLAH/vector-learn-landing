---
category: frontend
date: 2026-09-14
symptom: "Pe telefon, fișa cererii se deschide micșorată la 54% — iar verificarea de overflow spune că totul e în regulă"
files:
  - scripts/e2e-par-mobile.mjs
  - src/pages/par/ParDetail.tsx
  - src/pages/par/ParInbox.tsx
---

# `window.innerWidth` crește odată cu depășirea — deci `scrollWidth <= innerWidth` nu poate pica

## Ce s-a găsit (verificare cerută de owner, 14.09.2026: „e2e pe mobile, cererile și aprobările")

Fișa unei cereri PAR, deschisă într-un browser real pe iPhone 13:

```
document.documentElement.scrollWidth = 719
window.innerWidth                    = 719   ← nu 390
window.visualViewport.scale          ≈ 0.54
```

Antetul avea patru butoane pe un rând care refuza să se rupă
(`flex items-center gap-2 flex-shrink-0` — `flex-wrap` era pe PĂRINTE, nu pe rândul de butoane):
699px de conținut pe un ecran de 390px.

**Pe mobil, conținutul mai lat decât ecranul nu produce o bară de derulare orizontală.** Browserul
lărgește fereastra de layout până încape tot și micșorează pagina. Consecința pentru utilizator:
fișa se deschide la 54%, cu tot textul de nedeslușit, și trebuie mărită cu două degete înainte de
a citi ceva. Consecința pentru teste: `scrollWidth (719) <= innerWidth (719)` e **adevărat exact
în cazul pe care verificarea trebuia să-l prindă**. Verde peste un defect vizibil din prima
secundă — al doilea caz din aceeași familie ca
[overflow-hidden-masks-layout-overflow.md], cu altă cauză.

## Garda corectă

Referința e lățimea TELEFONULUI, nu cea raportată de pagină — singura care nu se mișcă sub
picioarele testului:

```js
async function mustFitPhone(pg, where) {
  const deviceW = pg.viewportSize().width;              // 390, cerut contextului
  const m = await pg.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    layoutW: window.innerWidth,                          // se umflă odată cu depășirea
  }));
  must(m.scrollW <= deviceW + 1 && m.layoutW <= deviceW + 1, `${where}: …`);
}
```

`layoutW > deviceW` e chiar semnalul de „pagina se deschide micșorată la N%" — merită spus în
mesajul de eroare, altfel cauza pare o simplă bară de derulare. Pentru verificările care cer ca un
text anume să fie în ecran, lățimea reală se pune în pagină înainte de codul aplicației
(`context.addInitScript((w) => { window.__phoneW = w; }, 390)`), tocmai ca să nu se sprijine
nimeni pe `innerWidth`.

## A doua capcană din aceeași verificare: „ținta are 44px"

`getBoundingClientRect()` pe o bifă de 16px sau pe un comutator de 24px spune cât e DESENUL, nu
cât e ținta degetului — eticheta din jur sau un pseudo-element transparent pot întinde zona de
apăsare. Singurul mod de a ști ce se întâmplă cu adevărat e să întrebi browserul ce element
răspunde la un punct aflat la 20px deasupra și dedesubtul centrului:

```js
const t = document.elementFromPoint(cx, y);
// trec doar: elementul însuși, urmașii lui, sau un <label> care îl înfășoară
t === el || el.contains(t) || t.closest("label")?.contains(el);
```

Prima versiune accepta și `t.contains(el)` — „elementul de sub deget îl conține pe al meu". Cu
regula aia, orice control înfășurat într-un `div` de 44px trecea, deși apăsarea pe `div` nu
declanșează nimic: comutatorul de urgență, un buton de 24px într-un rând de 44px, raporta țintă
bună. Regula strictă l-a făcut roșu imediat.

Două amănunte care au costat timp:
- **`scroll-behavior: smooth` face `scrollIntoView` asincron.** Un `getBoundingClientRect` chemat
  în aceeași evaluare citește vechea poziție, iar `elementFromPoint` nimerește bara de navigare de
  jos. Derularea se face într-un pas separat, cu o așteptare după ea.
- **Marginile unui element absolut se măsoară din caseta de padding.** Comutatorul are
  `border-2 border-transparent`, deci `-inset-y-2.5` (10px) dădea 40px de țintă, nu 44 — pragul se
  rata cu exact cele 2×2px ale bordurii.

## Lecția

- Pe telefon, „nu iese nimic lateral" NU se măsoară cu ce raportează pagina despre sine. Orice
  mărime pe care o poate schimba chiar defectul căutat e o referință moartă.
- O verificare de layout trebuie văzută picând pe codul VECHI înainte de a fi crezută pe cel nou.
  Cele șase verificări noi din `scripts/e2e-par-mobile.mjs` au fost rulate pe `origin/main`: 6 roșii
  acolo, 14/14 verzi după reparație. Fără pasul ăsta, trei dintre ele treceau degeaba.
- „Butonul se randează" nu spune nimic despre ce se întâmplă la apăsare — nici despre lățime, nici
  despre țintă (CLAUDE.md §3.5.1quater).
