---
title: Atributul `title` nu e un tooltip utilizabil
problem_type: ux / accesibilitate
module: PAR (Coadă finanțe, Inbox aprobator) — primitiva `components/ds/Tooltip`
tags: [tooltip, hover, iconițe, toolbar, ds, a11y]
symptoms: "«când faci hover pe butoane să poți vedea la ce acțiune se referă» — o bară de pictograme fără niciun cuvânt vizibil"
severity: medium
date: 2026-09-26
---

## Simptom

Coada de finanțe are cinci butoane-pictogramă pe rând (secțiunea 16, completează, plata, dosar,
arhivează). Owner-ul, 26.09.2026, cu captură de ecran: **„când faci hover pe butoane să poți
vedea la ce acțiune se referă"**.

Pe hârtie funcția exista deja: fiecare buton avea `title="…"`.

## Cauza

`title` **este** tooltipul nativ, dar cu comportamentul browserului, nu cu al produsului:

- apare după **1–2 secunde** de staționare — pe o bară de cinci pictograme, mai mult decât
  durează omul până să ghicească și să apese;
- se randează în caseta sistemului de operare, lângă cursor, nu lângă buton;
- nu are stil: nici lumină/întuneric, nici tipografia produsului;
- nu apare deloc la navigarea cu tastatura.

Rezultatul: o funcție care „există" în cod și lipsește în uz. Dintre cele cinci pictograme, una
mută bani și alta scoate cererea din listă — ghicitul nu e o opțiune.

## Soluția

O primitivă în design system: `src/components/ds/Tooltip.tsx`, folosită ca înveliș peste buton,
în locul lui `title`.

```tsx
<Tooltip label="Înregistrează plata">
  <Button size="icon" aria-label={`Înregistrează plata pentru ${par.requestNo}`}>
    <BanknoteIcon className="h-4 w-4" aria-hidden="true" />
  </Button>
</Tooltip>
```

Ce a cerut fiecare detaliu:

- **Portal + `position: fixed`** — bara stă într-un tabel cu `overflow-x-auto`; o bulă
  poziționată în interiorul rândului ar fi fost tăiată de marginea tabelului.
- **120 ms întârziere** — destul cât să nu clipească la trecerea peste bară.
- **`pointerType !== "mouse"` → nu se aprinde** — pe telefon „hover" nu există, dar browserul
  trimite un enter sintetic după atingere, iar bula ar rămâne agățată până la următorul tap.
- **Un semn propriu pentru „focus venit din click"** (nu `:focus-visible`) — după un click,
  `onFocus` ar re-aprinde bula peste modala tocmai deschisă; iar pseudo-clasa nu se poate
  verifica în jsdom, deci nu se poate încuia cu un test.
- **`aria-hidden` pe bulă** — butonul își păstrează `aria-label`-ul complet (cu numărul cererii);
  altfel asistiva ar citi de două ori, iar a doua oară mai puțin.

## Regula

**O pictogramă singură nu se explică pe sine, iar `title` nu o explică la timp.** Orice buton
icon-only capătă `Tooltip` + `aria-label`; `title` rămâne doar pentru textul trunchiat dintr-o
celulă (acolo chiar despre conținut e vorba, nu despre o acțiune).

## Testul care ar fi prins-o

`src/components/ds/__tests__/Tooltip.test.tsx` (primitiva) și
`src/pages/par/__tests__/ParFinanceQueue.tooltips.test.tsx` + cazul din `ParInbox.test.tsx`
(ecranele): **survolează butonul și cer textul ÎN pagină**. Pe codul dinainte pică toate —
`title` e un atribut, nu text randat, deci exact diferența pe care o reclama owner-ul.

Nuanță de harness (jsdom): React deduce `onPointerEnter` din `pointerover`, iar `fireEvent` nu
duce mai departe `pointerType` (ajunge `null`). Testul pentru atingere construiește evenimentul
cu mâna — altfel ar fi trecut și fără filtrul pe care pretinde că-l apără.
