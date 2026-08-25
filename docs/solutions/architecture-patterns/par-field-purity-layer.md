# PAR extraction: field-purity layer (fiecare câmp doar cu info lui)

**Data:** 2026-08-25 · **Bug raportat de owner** (factură fiscală tipizată MD, Anexa 1 / Ordin MF 118/2017)

## Simptom
„Denumire companie" = `Поставщик DAIKIRI STUDIO S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML…` —
etichetă de rol + denumire + adresă + IBAN într-un singur câmp; „Adresă juridică" și „BIC" goale deși
valorile erau în document; suma null (totalul urmat de coloane `X`); scope = antetul coloanei 10.1;
un „beneficiar" fantomă din titlul cursului citat pe rândul de serviciu.

## Root cause (o propoziție)
Extracția era construită pe **tipare de document** (regexuri calibrate pe contracte, etichete doar cu `:`),
nu pe **semantica câmpului** — iar `name` era singurul câmp de rechizite fără nicio verificare de puritate,
și curățarea existentă doar arunca valorile greșit plasate în loc să le **redistribuie** în câmpul lor.

## Fix structural
`server/lib/par/partyPurify.ts` — strat universal, rulat identic pe AMBELE căi (LLM `normalizeParExtraction`
+ stub `parsePartiesFromText`), deci pe orice document și orice sursă:

1. Recunoaște valorile după **FORMAT/semnificație**, nu după layout: IBAN (`MD\d{2}…`/străin), BIC
   (`XXXXMD2X` sau etichetat SWIFT/BIC), 13 cifre = cod fiscal, tokeni de adresă (`str./mun./nr.\d`),
   etichete de rol RO/RU/EN (cu sau fără `:`), nume de bancă (keyword).
2. **Relocă** fiecare valoare găsită în câmpul greșit în slotul EI — doar dacă slotul e gol (nu suprascrie).
3. `name` = restul din jurul formei juridice (SRL/SA/ÎI/ООО/GmbH…). Niciodată golit complet.
4. Flag-uri `repaired` per câmp → `choosePayee.lowConfidence` → „⚠ de verificat" ONEST în UI
   (plus: pe calea stub toate confidence-urile sunt plafonate sub 0.7 — stub-ul nu „înțelege", doar ghicește).

## Alte capcane reparate (stub)
- `cleanBankName`: eticheta `Bank` fără `\b` mânca „bank"-ul din „Moldindcon**bank**" → junk `'S.A., MOLDMD2X`.
- Totalul facturii tipizate e urmat de coloane (`17000,00 X 0,00 …`), nu de „lei" → tier-2 pe numere
  cu formă de bani (grupare sau 2 zecimale), niciodată index de listă/an.
- Scope: antetele de tabel („Denumirea mărfurilor…codul poziției tarifare") sunt respinse ca vocabular
  de header; fallback = rândul de serviciu, tăiat înainte de cantitate/preț.
- Un titlu citat pe un rând cu preț (`… "X" serv 1 17000.00`) nu mai devine parte.

## Regula de ținut minte
> Nu valida extracția per tip de document — impune **invarianta câmpului** (ce nu are voie să conțină
> NICIODATĂ) și **redistribuie**, nu șterge. Testele verifică invariante pe un corpus divers
> (`server/lib/par/__tests__/partyPurify.test.ts`), nu valori de aur per document.

---

## Update 2026-08-25 (#3) — diacriticele legacy cu sedilă

**Simptom:** „Scop" arăta iar antetul de tabel („mărfurilor/activelor, serviciilor şi codul
poziţiei") pe documentul REAL, deși filtrul de antete exista și testele erau verzi.

**Root cause:** PDF-ul conține `ş` (U+015F) și `ţ` (U+0163) — diacriticele româneşti LEGACY cu
sedilă — nu `ș` (U+0219) / `ț` (U+021B). Sunt caractere DIFERITE. Orice regex scris cu formele
corecte nu se potriveşte pe cele vechi, **în tăcere**. Fixture-ul meu sintetic folosea formele
corecte, deci testul trecea în timp ce producţia pica.

**Fix (clasa, nu instanţa):** `normalizeRoDiacritics()` în `stubPartyParser.ts`, aplicat la
intrarea în `parsePartiesFromText` şi în `purifyParty`. Înlocuirea e **1:1 pe caracter**, deci nu
schimbă lungimile şi nu invalidează offset-urile pe care se bazează asocierea rechizit→parte.

**Lecţia generală:** un fixture scris de mine foloseşte tastatura mea; documentul real foloseşte
fontul care l-a generat. **Textul real dintr-un PDF real este singura probă** — de aceea corpusul
(`server/lib/par/__tests__/fixtures/documents/`) păstrează textul exact, octet cu octet, iar
documentele marcate `sursa: Document real` sunt cele mai valoroase din suită.

## Cum se retestează / adaugă un document

```bash
npm run par:corpus                                  # rulează tot corpusul salvat
npm run par:extract -- <fişier.pdf>                 # vezi ce extrage dintr-un document real
npm run par:extract -- <fişier.pdf> --save <slug>   # îl salvează ca regresie permanentă
```
