---
title: Identitatea unei entități nu încape în setările tenantului — un workspace are mai multe organizații plătitoare
problem_type: data-modelling
module: PAR (par_payers, par_settings, parAiPrefill, approvalSheet)
tags: [multi-entity, plătitori, rechizite, idno, iban, pdf, ai-prefill]
symptoms: "vreau să pot seta mai multă info despre organizația care achită și nu uita că putem avea mai multe organizații care plătesc în același workspace"
severity: medium
date: 2026-08-28
---

## Simptom

„Administrare PAR → Setări" cerea *o* denumire legală, *un* logo, *un* URL de instrucțiuni — la
nivel de tenant. Dar clientul plătește din mai multe entități juridice (`par_payers`), iar despre
fiecare nu se putea reține nimic în afară de denumire + IDNO: nici adresa, nici codul TVA, nici
contul din care se achită, nici cine semnează.

## Cauza reală

`par_settings` are `UNIQUE(tenant_id)` — prin construcție ține **o singură** identitate. Modelul
avea deja entitatea corectă (`par_payers`, N per tenant, legată de proiecte, cereri, matricea DOA
și membri), doar că identitatea fusese pusă în locul greșit. Orice câmp nou adăugat în setări ar
fi repetat greșeala: valoarea ar fi fost bună pentru o singură entitate.

Două consecințe treceau neobservate până acum:

1. **Excluderea propriei organizații din candidații de beneficiar (AI)** se făcea după o singură
   denumire (`parSettings.orgLegalName`). Pe un document emis între două entități ale aceluiași
   client, a doua entitate era propusă drept beneficiar — adică o plată către sine.
2. **Fișa aprobărilor din dosarul PDF** nu spunea cine plătește. Un dosar scos din sistem nu putea
   fi atașat la contabilitatea entității corecte fără să se uite cineva în aplicație.

## Regula

> Datele care descriu o **entitate** stau pe rândul entității, nu în setările tenantului. Setările
> rămân pentru valori implicite ale workspace-ului (prag, valută, prefix de numerotare).

Iar orice cod care întreabă „suntem noi?" trebuie să întrebe pe **lista** de entități proprii, nu
pe o singură denumire: `choosePayee(extraction, string | string[] | null)` +
`fuzzyOrgMatchAny()`; ruta de prefill trimite `parSettings.orgLegalName` **și** numele +
denumirile juridice ale tuturor `par_payers` ale tenantului.

## Ce s-a livrat

- `par_payers` primește: `vat_code`, `address`, `bank_name`, `iban`, `bank_code`, `contact_email`,
  `contact_phone`, `director_name`, `director_role`, `logo_url`, `notes` (migrarea `0144`;
  coloanele se vindecă singure prin `sync-schema.ts`, fiind coloane, nu tabele).
- „Date referință → Organizații plătitoare": un card per entitate, cu formular grupat
  (Identitate / Cont / Contact / Semnatar / Antet). Setările duc acolo printr-un buton.
- Fișa aprobărilor tipărește secțiunea „Organizația plătitoare" (denumire juridică, IDNO, cod TVA,
  adresă, cont, semnatar), doar cu rândurile completate.
- Importul Excel aduce aceleași câmpuri **și** a devenit nedistructiv: un fișier care nu mapează o
  coloană nu mai suprascrie cu `null` datele completate manual (înainte, un import doar cu numele
  ștergea denumirea juridică și IDNO-ul).
- Detecția foilor: un IBAN nu mai clasifică automat foaia drept „Beneficiari" — o foaie cu antetul
  „Denumire plătitor" e a plătitorilor, chiar dacă are rechizite bancare.

## Teste care blochează regresia

- `server/lib/par/__tests__/choosePayee.multiOrg.test.ts` — a doua entitate proprie nu ajunge
  beneficiar; testul păstrează și comportamentul vechi (excludere pe o singură denumire) ca dovadă
  că prinde regresia.
- `server/__tests__/par-payer-org-details.routes.test.ts` — POST/GET/PATCH pe ruta reală: câmpurile
  se salvează, PATCH-ul parțial nu șterge restul.
- `server/lib/par/__tests__/approvalSheet.test.ts` — secțiunea plătitorului în PDF (și absența ei
  pe dosarele fără plătitor).
- `server/__tests__/parConfigImport.routes.test.ts` — importul aduce rechizitele; un import fără
  coloanele de identitate nu le mai șterge.
- `src/pages/par/__tests__/ParAdmin.payerOrgs.test.tsx` — formularul chiar trimite câmpurile la API.
