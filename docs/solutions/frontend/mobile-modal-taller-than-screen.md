---
category: frontend
date: 2026-09-13
symptom: "Pe telefon, „Da, confirmă plata\" nu se poate apăsa — butonul cade sub marginea ecranului"
files:
  - src/pages/par/ParFinanceQueue.tsx
  - src/pages/par/ParInbox.tsx
  - src/hooks/useIsPhone.ts
  - scripts/e2e-par-mobile.mjs
---

# Un ecran care „arată bine" pe laptop poate fi de neutilizat pe telefon

## Ce s-a găsit (verificare cerută de owner, 13.09.2026)

Fluxul de plată, deschis într-un browser real la 390×844:

1. **Dialogul de plată nu se putea încheia.** Panoul era mai înalt decât ecranul și nu se derula
   (`fixed inset-0 flex items-center justify-center`, panou fără `max-height`), deci butoanele de
   la bază — „Da, confirmă plata", „Refuză plata", „Înapoi" — cădeau sub marginea de jos. Playwright
   o spune fără echivoc: `element is visible, enabled and stable … element is outside of the
   viewport`. Un om ar fi tras de dialog și nu s-ar fi întâmplat nimic.
2. **Coada de finanțe arăta doar butoanele.** Tabelul de 13 coloane (`min-w-[1280px]`) pe un ecran
   de 390px e o fereastră de o coloană, iar prima coloană e „Acțiuni": trei butoane și niciun număr
   de cerere, niciun beneficiar, nicio sumă, până nu trăgeai pagina lateral.

## De ce nu a prins-o nimic până acum

Toate testele rulează în jsdom, unde **nu există viewport**: un element aflat la 900px în dreapta
sau sub marginea de jos e la fel de „vizibil" ca oricare altul, iar `getByRole(...).click()` merge.
Verificarea automată pe care o scrisesem prima dată avea aceeași scăpare — căuta textul în DOM și
trecea. Un `overflow-x: auto` intenționat pe un container ascunde problema și de la o verificare de
„iese din ecran": tabelul NU iese din ecran, doar nu se vede.

## Reparația

- Panourile de dialog: containerul primește `overflow-y-auto p-4`, panoul `max-h-[calc(100dvh-2rem)]
  overflow-y-auto`. (`ds/Overlay.tsx` avea deja regula asta — dialogurile scrise de mână, nu.)
- Coada de finanțe randează **carduri pe telefon** și tabelul de la tabletă în sus, prin
  `useIsPhone()` — nu prin `hidden md:block` pe două variante: ținute amândouă în DOM, fiecare rând
  ar exista de două ori pentru cititorul de ecran și pentru orice căutare din pagină.
- Acțiunile rândului trăiesc într-o singură componentă (`QueueActions`), folosită și de tabel și de
  card: altfel un buton nou ar apărea doar într-una din forme.

## Poarta care le ține închise

`scripts/e2e-par-mobile.mjs` (în `e2e:all`, zona PAR) cere, la 390px: numărul cererii, beneficiarul
și suma să fie **în lățimea ecranului** (nu doar în DOM), și plata să se poată **duce la capăt**.
Verificat că poarta pică pe codul vechi și trece pe cel nou.

## Regula

**O verificare pe telefon trebuie să afirme că elementul e ÎN VIEWPORT și că acțiunea SE POATE
DUCE LA CAPĂT.** „Există în DOM" și „se randează" nu spun nimic despre un ecran de 390px — și
niciun test din jsdom nu poate spune.
