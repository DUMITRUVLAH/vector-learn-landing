---
title: „Cont de plată" cu vânzătorul în antet — eticheta „PLĂTITOR:" fura rolul singurei părți plătibile, iar formularul PAR rămânea gol
problem_type: architecture_pattern
module: par-ai-prefill, par-extraction
tags: [par, ai-prefill, extractie, roluri, plătitor, cont-de-plată, suma-in-litere, prompt]
symptoms: „Am încărcat documentul și nu s-a autocompletat" — se completa doar Scopul; Denumire companie, IDNO, IBAN și Banca rămâneau goale, iar suma era citită greșit (23 442 în loc de 23 042)
severity: P1
date: 2026-08-28
---

## Symptom
Owner-ul încarcă un „CONT DE PLATĂ" real (nr. 68339, ZBOR.MD / S.C. „Explor Tur" S.R.L., plătitor
ATIC). AI-ul răspunde 200, banner-ul spune „Câmpurile de mai jos au fost completate", dar în formular
se completează DOAR „Scop". Beneficiar, IDNO, IBAN, Bancă: goale. Nici măcar lista „am găsit N părți"
nu apare, așa că nu ai ce alege — trebuie retastat totul manual.

## Root cause
Documentul are layout-ul standard de proformă din Moldova, pe care **niciuna** din cele două căi de
extragere nu-l citea corect:

```
CONT DE PLATĂ
PLĂTITOR:
ATIC                          ← cumpărătorul, o prescurtare fără formă juridică
S.C. "Explor Tur" S.R.L.      ← VÂNZĂTORUL (doar în antet; cuvântul „Furnizor" nu apare nicăieri)
Cod fiscal: 1012600013482
Cont: IBAN MD61VI000000222432697MDL
```

1. **Rolurile.** Detectorul de nume nu vede „ATIC" (fără SRL/SA), deci eticheta „PLĂTITOR:" se lipea,
   prin proximitate, de următorul nume găsit — chiar vânzătorul din antet. Rezultat: singura parte
   plătibilă ieșea `client` + `isPayerHint` și era scoasă din pool → `payee: null` → toate câmpurile
   goale. Modelul (gpt-4o-mini) făcea exact aceeași greșeală: `role: "client"` pe Explor Tur.
2. **Suma.** Ordinea rândurilor dintr-un PDF nu e cea vizuală: „23042" ajunge pe rândul 3, iar
   eticheta „TOTAL" pe rândul 5. Parserul determinist nu găsea nicio sumă, iar modelul „reconstruia"
   totalul din tabel și returna **23 442** — 400 de lei în plus pe o cerere de plată reală.
3. **Banca.** `sanitizeRequisites` arunca tot câmpul când conținea un marker de adresă, deci numele
   de FILIALĂ „B.C. VICTORIABANK S.A. fil.nr.26 **Chisinau**" era șters în întregime.

## Fix
Patru straturi, ca documentul să funcționeze și cu model, și fără (`server/lib/par/`, `server/lib/ai/`):

1. **Prompt** (`parExtractor.ts`): regula „antet + PLĂTITOR" + regula dură *partea ale cărei conturi
   sunt tipărite ÎNCASEAZĂ → nu poate fi `client`* + avertismentul că ordinea rândurilor din PDF e
   amestecată. Verificat live: modelul întoarce acum `provider` pe vânzător, `client` pe ATIC,
   23 042 și ambele articole (înainte: `client`, 23 442, zero articole).
2. **Rule C** (`stubPartyParser.ts`): o etichetă de plătitor **singură pe rând** aparține rândului
   imediat următor, nu primei companii de dedesubt; ancora e apoi CONSUMATĂ. Numele necunoscut
   detectorului („ATIC") intră ca parte proprie `client`, deci UI-ul poate arăta ambele grupuri.
3. **Plasă de siguranță** (`choosePayee.ts`): când nu rămâne niciun beneficiar, dar documentul NU
   conține propria organizație și are o SINGURĂ contraparte non-bancă cu IBAN valid și fără marcaj
   explicit de plătitor → o propunem, marcată „⚠ de verificat". Capcana „nu prefila cumpărătorul"
   rămâne închisă exact pentru că cerem absența propriei organizații + IBAN tipărit.
4. **Suma în litere** (`amountInWords.ts`, nou): „Total factura în litere: douazeci si trei de mii
   patruzeci si doi lei 00 bani" → 2 304 200 cenți. E sursa legală de adevăr și singurul loc unde
   totalul nu se poate rupe de eticheta lui. Folosită ca fallback în parserul determinist și ca
   verificare încrucișată în rută (dacă diferă de cifra extrasă, litera câștigă și câmpul se
   marchează „de verificat").

## Lesson
- **Nu deduce rolul unei părți din vecinătatea rândurilor într-un PDF.** Ordinea textului extras nu e
  ordinea vizuală. Semnalul robust e *cine deține contul de încasare*, nu cine e mai aproape de
  etichetă.
- **O etichetă (`PLĂTITOR:`, `Beneficiar:`) aparține primului rând care o urmează** — nu primului
  lucru pe care parserul tău întâmplător îl recunoaște. Consumă ancora după ce ai legat-o.
- **Când un câmp „arată greșit", taie coada, nu tot câmpul** — o filială chiar conține un oraș.
- **Suma în litere bate cifra.** Pe orice document MD care o are, e verificarea gratuită care prinde
  un total citit greșit înainte să ajungă într-o plată.

## Regression tests
- `server/lib/par/__tests__/fixtures/documents/12-cont-de-plata-antet-si-platitor-zbor-md.{txt,json}`
  (documentul REAL, în corpus — `npm run par:corpus`)
- `server/lib/par/__tests__/stubPartyParser.payerLabel.test.ts` (Rule C)
- `server/lib/par/__tests__/choosePayee.adversarial.test.ts` (plasa de siguranță + capcana MIXBOOK)
- `server/lib/par/__tests__/amountInWords.test.ts`
- `server/__tests__/par-ai-prefill-cont-de-plata.routes.test.ts` (ruta reală, ambele căi)

Toate cad pe codul dinainte de fix (verificat într-un `git worktree` pe HEAD) și trec după.
