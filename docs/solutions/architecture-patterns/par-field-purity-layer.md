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
