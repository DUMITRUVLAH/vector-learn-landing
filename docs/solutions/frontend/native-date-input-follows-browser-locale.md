---
title: <input type="date"> urmează limba browserului, nu a paginii
problem_type: ux / i18n
module: toate formularele (PAR, FinDesk, Pontaj, CRM)
tags: [date, format, locale, input, design-system]
symptoms: "„Valabilă până la” arată 01/13/2027 — lună/zi/an — pe un laptop cu Chrome în engleză"
severity: medium
date: 2026-09-23
---

## Simptom

Owner-ul, pe fișa beneficiarului din cererea PAR: „formatul la dată nu e comod, acum e luna, ziua,
anul… ar fi fain să fie ziua, luna, anul". Câmpul „Valabilă până la" arăta `01/13/2027`.

## Cauza reală

`<input type="date">` își desenează câmpurile (zz/ll/aaaa) după limba **browserului** (Chrome: limba
interfeței), nu după `lang` din pagină și nici după vreun atribut. Pe un Chrome în engleză (SUA) orice
câmp de dată nativ din aplicație era lună/zi/an — în 75 de locuri, pe 36 de ecrane. Nu se poate
repara per câmp: nu există atribut care să schimbe ordinea.

## Ce am făcut

- `DateField` (`src/components/ds/DateField.tsx`): câmp de text care arată mereu `13.01.2027`,
  pune punctele singur (`13012027` → `13.01.2027`), acceptă și `13/01/2027`, `1.2.2027` și ISO lipit.
  Calendarul nativ rămâne la iconiță (sau Alt+↓) — grila calendarului nu are problema ordinii.
- Contractul e cel al câmpului nativ: `value` și `e.target.value` sunt ISO `YYYY-MM-DD`, deci
  înlocuirea a fost `<Input type="date"` → `<DateField`, fără să atingem handlerii.
- Cât timp scrii, formularul păstrează ultima dată întreagă; o dată neterminată sau inexistentă
  (31.02) devine `""` abia la ieșirea din câmp. Altfel paginile care pun o valoare implicită în locul
  lui `""` (ParExchange: „azi") îți rescriau textul sub degete.
- Selectorul nativ ascuns e scos din formular (`form` spre un id inexistent): cu `min`/`max` și o
  valoare în afara lor ar fi fost un câmp invalid, nefocusabil, care blochează trimiterea fără mesaj.
  Validarea vizibilă (`setCustomValidity`) o face câmpul de text.

## Garda

`src/__tests__/no-native-date-input.test.ts` pică dacă vreun `.tsx` din `src/` (în afară de
`DateField.tsx`) mai conține `type="date"`. Regula în CLAUDE.md §3.1.
