# Bilingv RO/EN — cum se adaugă și se traduce text

**Status:** infrastructura e livrată; traducerea propriu-zisă a landing-ului și a PAR se face
pas cu pas peste ea.

## Ce există

`src/lib/i18n/` — fără dependențe externe.

```
core.ts                 detectare, persistență, t(), plural
format.ts               sume, numere, date, timp relativ — pe locale
react.ts                useT(), useLang(), useFormat()
types.ts                Lang, Dict, Translated<>
dictionaries/
  common.ts             acțiuni, stări, filtre, comutatorul de limbă
  landing.ts            pagina publică /business
  par.ts                modulul PAR
  index.ts              fuziunea + tipul TranslationKey
```

`src/components/ds/LanguageSwitcher.tsx` — comutatorul, în două forme (`segmented`, `compact`).
Montat în navbar-ul landing-ului și în rândul de utilitare din `BusinessShell` (deci pe toate
rutele `/business/*`, PAR inclus).

## Cum adaugi text nou

1. Cheia intră în `dictionaries/<modul>.ts`, la `ro`. Convenție: `<modul>.<grup>.<nume>`.
2. TypeScript te obligă imediat s-o adaugi și la `en` — `en` e declarat `Translated<typeof ro>`,
   deci o cheie fără pereche **nu compilează**. Asta e toată garanția că nu ajungem la un ecran
   pe jumătate tradus.
3. În componentă: `const { t } = useT();` apoi `t("par.inbox.title")`.

Interpolare: `t("common.lang.switchTo", { lang: "English" })` peste `"Switch language to {lang}"`.

Plural: trei chei surori `…_one` / `…_few` / `…_other`, apelate cu `plural("common.count.results", n)`.
Româna are **trei** forme („1 rezultat", „3 rezultate", „21 **de** rezultate"), iar regula e a lui
`n % 100` — nu se poate ghici cu un `count === 1`. Forma o alege `Intl.PluralRules`.

Sume și date: **niciodată** `toLocaleString("ro-RO")` scris de mână. `const f = useFormat();` apoi
`f.money(cents, "MDL")`, `f.date(iso)`. Separatorii diferă între limbi, iar într-un ecran de finanțe
o virgulă citită drept punct e o greșeală de o sută de ori. Sumele intră în **unități minore** și se
împart la 100 o singură dată, înăuntru.

## Ce NU se traduce

- Datele din baza de date: nume de proiecte, furnizori, departamente, descrieri introduse de client.
- Ancorele din URL (`#aprobari`, `#preturi`) — sunt adrese; traduse, rup linkurile deja trimise.
- Comentariile din cod și documentația: sunt pentru dezvoltatori, rămân în română.

## Decizii luate, ca să nu se redeschidă din reflex

**Româna e implicită; limba browserului NU intră în cascadă.** Cascada e `?lang=` → localStorage → RO.
Auto-detecția ar fi fost tentantă, dar în Moldova o bună parte dintre vorbitorii de română au sistemul
și browserul în engleză: le-ar fi comutat singură interfața, fără să ceară nimeni. Engleza se ia
dintr-un click pe comutator sau dintr-un `?lang=en`. Dacă vrem vreodată invers, e o linie în `getLang()`.

**`?lang=` se caută și în hash.** Aplicația rulează pe hash routing, deci `#/business/par?lang=en` e o
legătură pe care cineva chiar o trimite. Parametrul se și persistă — altfel primul click pierde limba.

**Cheia lipsă nu aruncă niciodată.** Cade pe RO, apoi pe cheia însăși, și avertizează o dată în dev.
O etichetă neîngrijită e un bug; o pagină albă fiindcă a lipsit o cheie e un incident.

**Lipsa lui `localStorage` nu e un incident.** Safari în navigare privată și browserele cu datele de
site blocate nu-l au — și nici jsdom-ul din teste. Aplicația pornește, comută, doar nu ține minte.

## Unelte

```bash
npm run i18n:scan               # inventarul textului rămas netradus, pe domenii
npm run i18n:scan -- --area=par --list   # fiecare apariție, fișier:linie
npm run i18n:check              # paritatea dicționarelor + comportamentul nucleului
```

`i18n:scan` e lista de lucru a pasului de traducere: raportează text JSX, `placeholder`, `aria-label`
și etichetele din tablouri, ignorând comentariile, clasele Tailwind și ce trece deja prin `t()`.

## Poarta de teste

`src/lib/i18n/__tests__/` ține: cascada de detectare, sincronizarea între taburi, `<html lang>`,
interpolarea, pluralul românesc, formatarea sumelor și a datelor, paritatea dicționarelor (chei,
valori goale, **aceleași variabile `{x}` în ambele limbi**, familiile de plural complete).

`src/components/ds/__tests__/LanguageSwitcher.test.tsx` ține lanțul întreg prin React: apeși pe EN →
o componentă care folosește `useT()` se schimbă, `aria-pressed` se mută, alegerea se ține minte.
Testul unitar pe `t()` nu acoperă asta — acolo limba e un parametru; aici trece prin
`useSyncExternalStore`, deci prinde exact ce s-ar rupe: o componentă rămasă pe limba veche până la
următoarea navigare.
