---
title: O propunere AI pe care n-o poți edita e o greșeală definitivă
problem_type: ux / ai
module: PAR (ParCreateForm — panoul „Câmpuri propuse de AI")
tags: [ai, prefill, editare, formular, par]
symptoms: "«AI a decis să pună 33 000 bucăți și eu acu nu pot schimba» — valoarea propusă se vede, dar nu se poate corecta"
severity: medium
date: 2026-09-22
---

## Simptom

După „Încarcă document (AI)", panoul **„Câmpuri propuse de AI"** afișa ce extrăsese modelul.
Un utilizator a văzut acolo un scop greșit („Furnizarea de placaj … în cantitate totală de
33 000 foi", când comanda era de 20 de bucăți) și **nu a găsit nicio cale să-l schimbe**.
Owner-ul a rezumat: „nu poți edita dacă AI greșește, trebuie să lași".

## Cauza

Panoul era **read-only și trunchiat**:

```tsx
<span className="text-foreground truncate max-w-xs">{String(field.value)}</span>
```

Pentru câmpurile beneficiarului asta mergea — inputurile lor editabile sunt la câteva rânduri
mai jos, în aceeași secțiune. Dar **„Scop" (`endUse`) își are inputul în secțiunea 11
„Utilizare finală"**, cu un ecran mai sus, dincolo de articole și de total. Locul unde
descopereai greșeala era exact locul unde nu puteai interveni, iar `truncate` ascundea chiar
și restul valorii, deci nici nu puteai citi ce era de corectat.

Datele nu erau blocate — formularul salvează `end_use` normal, iar o cerere trimisă se poate
readuce în ciornă cu „Retrage și editează". Blocajul era pur de interfață, ceea ce e mai rău:
utilizatorul concluzionează că produsul nu permite corectura și trimite cererea greșită.

## Soluția

`AiProposedField` — propunerea **E** inputul, legat de aceeași stare ca formularul:

```tsx
<AiProposedField id="ai-end-use" label="Utilizare finală" value={endUse} multiline
  proposed={aiPrefillResult.endUse}
  onChange={(v) => { setEndUse(v); setFieldErrors((p) => ({ ...p, end_use: "" })); }} />
```

Eticheta din dreapta trece din „⚠ de verificat" în „corectat" când valoarea diferă de propunere.
Restul câmpurilor rămân rezumat (netrunchiat — `break-words`), fiindcă inputurile lor sunt
vizibile imediat dedesubt: dublarea lor ar fi pus două câmpuri cu aceeași etichetă pe un ecran,
lucru pe care l-a semnalat imediat și testul existent (`getByLabelText(/IDNO/i)` → două noduri).

## Regula

**Orice valoare propusă de AI trebuie să fie corectabilă acolo unde e afișată**, dacă inputul ei
real nu e vizibil în același loc. Un panou de propuneri care doar afișează e un panou care
transformă o eroare de model într-o eroare de document. Corolar: nu `truncate` pe o valoare pe
care utilizatorul trebuie s-o verifice.

## Regresia care o blochează

`src/pages/par/__tests__/ParCreateForm.prefill-groups.test.tsx` →
„[blocant] valoarea propusă pentru «Utilizare finală» se poate corecta în panou": încarcă un act
cu `endUse` greșit, scrie în câmpul din panou și verifică valoarea din `#endUse` (secțiunea 11).
Pică pe markup-ul vechi (`getByLabelText` nu găsea niciun input), trece pe cel nou.
