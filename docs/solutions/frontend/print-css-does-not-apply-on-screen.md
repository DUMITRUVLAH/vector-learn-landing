# „PDF-ul are textul lipit de marginea foii"

**Categorie:** frontend / tipărire · **Data:** 2026-08-31 · **Găsit de:** construirea previzualizării de act

## Simptom
Actul descărcat ca PDF avea conținutul până în marginea hârtiei — fără margini, ca o pagină web
tipărită prost. În stiluri exista totuși, negru pe alb, `@page { margin: 18mm 16mm 20mm 16mm }`.

## Cauza reală
`@page` se aplică **doar la tipărirea reală din browser** (Ctrl+P / `page.pdf()` din Playwright).
Nu are niciun efect când:
- documentul e fotografiat de **html2canvas** (calea prin care se face PDF-ul pe Vercel, unde nu
  există chromium — vezi `src/lib/docs/documentPdfClient.ts`);
- documentul e afișat într-un **`<iframe>`** de previzualizare.

Ambele randează pe ecran, iar pe ecran `@page` e ignorat. Marginile „existau" în CSS și nu existau
nicăieri în fișierul livrat clientului.

## Cum s-a reparat
Marginile foii sunt acum o singură constantă (`src/lib/docs/printable.ts`, `PAGE_MARGIN_MM`),
aplicată explicit pe ambele căi de randare pe ecran:
- la PDF, ca `padding` pe elementul-gazdă fotografiat de html2canvas;
- la previzualizare, ca `padding` pe `body`, injectat în `srcDoc` de `printableWithMargins`.

Așa previzualizarea și PDF-ul arată identic — altfel previzualizarea n-ar fi o previzualizare, ci
o a doua părere.

## Capcana din jur (a doua, la fel de scumpă)
HTML-ul tipăribil e un **document complet**, cu `<style>` care stilizează `body`, `h1`, `table`.
Injectat cu `innerHTML` într-un `<div>` din aplicație, stilurile lui se aplică **întregii pagini**.
De aceea:
- previzualizarea folosește `<iframe srcDoc sandbox="">`, nu un `<div>`;
- pe calea html2canvas, marginile se pun pe **gazdă**, nu printr-un selector `body` din HTML-ul
  injectat — acel selector ar nimeri corpul aplicației, nu foaia fotografiată.

## Regula de reținut
> Orice stil de tipar (`@page`, `page-break-*`, `size`) e mort pe ecran. Dacă documentul ajunge la
> om printr-un canvas sau un iframe, marginile și paginarea trebuie recreate explicit — și dintr-o
> singură sursă, comună previzualizării și fișierului.
