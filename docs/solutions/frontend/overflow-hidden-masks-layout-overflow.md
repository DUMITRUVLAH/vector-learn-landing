# „Verificarea de layout e verde, dar titlul e tăiat pe telefon"

**Categorie:** frontend / verificare · **Data:** 2026-08-28 · **Găsit la:** landing-ul FinFlow (`/business`)

## Simptom
Pagina publică arăta impecabil pe desktop. Pe 390 px, jumătate din titlul din hero
(„Nicio aprobare fără urmă") era **în afara ecranului**, tăiat curat la marginea dreaptă — iar
verificarea automată de overflow raporta `overflowX = false`. Verde peste un defect vizibil
din prima secundă.

## Cauza reală
Două lucruri care se anulează reciproc:

1. `whitespace-nowrap` pe fragmentul din `<h1>` (împrumutat din landing-ul HR365, unde e pus pe
   un singur cuvânt) — la 390 px un fragment de 24 de caractere la 48 px nu are unde încăpea.
2. Containerul rădăcină are `overflow-x-hidden` (tot din șablon), ca petele decorative cu
   `-right-20` să nu producă bară de scroll.

Rezultatul: elementul chiar iese din ecran, dar `document.documentElement.scrollWidth` **nu
crește**, pentru că `overflow-x: hidden` taie depășirea în loc s-o transforme în scroll. Deci
verificarea clasică
`scrollWidth > innerWidth` nu poate vedea niciodată acest defect pe o pagină care are
`overflow-x-hidden` — exact paginile de marketing, unde șablonul îl cere.

## Garda corectă
Măsoară marginea dreaptă a fiecărui element, nu lățimea de derulare a documentului:

```js
const wide = await page.evaluate((vw) => {
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const cls = (el.className || "").toString();
    if (cls.includes("pointer-events-none")) continue; // pete decorative, tăiate intenționat
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 2) bad.push(`${el.tagName}.${cls.slice(0, 45)} → ${Math.round(r.right)}px`);
  }
  return bad;
}, viewportWidth);
```

Rulat pe 1440 / 1024 / 768 / 390, a prins imediat **două** defecte, nu unul: titlul tăiat pe
telefon și navbar-ul care ieșea cu 120 px la 768 px (linkurile de meniu apăreau de la `md`, dar
împreună cu cele două butoane nu încăpeau — mutat la `lg`).

## Lecția
- `overflow-x: hidden` nu repară un layout, îl **ascunde** — inclusiv de propriile teste.
- O verificare care nu poate pica nu e o verificare (CLAUDE.md §3.5.1quinquies). Testul DOM
  (jsdom) nu are layout deloc, deci nu vede nimic din clasa asta: pentru pagini publice,
  trecerea cu browser real pe mai multe lățimi face parte din livrare, nu din „polish".
- Când împrumuți o clasă de tipografie dintr-un alt landing (`whitespace-nowrap`, subliniere SVG
  absolută), împrumuți și presupunerea despre lungimea textului. Textul tău e alt text.
