---
title: A legitimate post-signature edit must RE-SEAL the body hash, or it reads as tampering and blocks the remaining signatures
problem_type: architecture_pattern
module: par, par-integrity, par-finance
tags: [integrity, body-hash, signatures, finance, amendment, audit-trail, zod-transform]
symptoms: "„Datele diferă de cele semnate” pe cereri curate; `integrity_violation` 409 la re-aprobarea unei depășiri, după o corectură a liniei de buget"
severity: P2
date: 2026-09-22
---

## Context

Managerul financiar (Violeta Bordeniuc, 22.09.2026) a cerut ca o cerere DEJA SEMNATĂ să mai poată fi
completată: linia de buget corectată, descrierea adăugată, actele adiționale inserate la dosar —
„după semnare și plata nu mai putem modifica sumele însă".

Cererea e rezonabilă: o linie de buget greșită se corectează la contabilitate, nu prin anularea și
refacerea unei cereri cu 3 semnături. Dar câmpurile cerute (`budgetCodeId`, `budgetCodeNote`,
`endUse`) fac parte din corpul SIGILAT la depunere (`server/lib/par/integrity.ts`).

## Capcana

Dacă le scrii fără să atingi `par_requests.body_hash`:

1. **Fiecare deschidere a cererii raportează „Datele diferă de cele semnate"** și scrie în jurnal
   `integrity_mismatch_display` — o alarmă care sună la corecturi normale e o alarmă pe care nimeni
   n-o mai crede (aceeași lecție ca la `vendorId`, tolerat explicit în `verifyParBodyHash`).
2. **Mai grav: semnăturile rămase se blochează.** `approveParStep` și re-aprobarea depășirii verifică
   amprenta înainte de a înregistra decizia și întorc `409 integrity_violation`. O corectură de linie
   bugetară ar fi blocat plata unei cereri cu depășire re-aprobabilă.

## Soluția

Calea de completare (`financeAmendPar`, `server/routes/par.ts`):

1. **lista albă de câmpuri** (`server/lib/par/postSignatureEdit.ts`) — doar cele care nu mișcă bani;
   orice altceva → `403 forbidden_after_signature`, cu motivul scris în română;
2. **resigilează** corpul după scriere (`computeParBodyHash` pe corpul proaspăt) — deci verificarea
   de integritate continuă să spună adevărul despre ce contează: sume, linii, beneficiar, pe care
   calea asta nu le poate atinge;
3. **scrie amendamentul în jurnal** (`finance_amended`, cu `diff` before/after și ambele amprente) și
   îl arată pe fișă lângă semnături ȘI pe formularul tipărit — un exemplar pe hârtie care ar
   contrazice în tăcere ce s-a semnat e mai rău decât o editare interzisă.

> Regula generală: **o modificare legitimă a unui document sigilat nu ocolește sigiliul, ci îl
> reface și lasă urmă.** Nu tolera diferențe în verificarea de integritate („mai ignoră și câmpul
> ăsta") — tolerarea se acumulează până când verificarea nu mai verifică nimic.

## Bonus: zod `.transform()` fabrică modificări care n-au fost trimise

Prima rulare a probei end-to-end a picat cu `403 forbidden_after_signature … payee_name, payee_bank`
pe o completare care trimitea DOAR linia de buget. Cauza: `updateParSchema` are
`.optional().nullable().transform(cleanPastedIdentityField)` pe acele câmpuri, iar transformarea
rulează și pentru cheile absente — deci apar în corpul validat cu `null`, indistinct de o ștergere
cerută de om.

**Lecția:** întrebarea „ce a vrut utilizatorul să schimbe?" se pune corpului BRUT (`c.req.json()`,
memorat de Hono), nu celui validat. Valorile se iau tot din cel validat (cu normalizările lui), dar
lista de chei vine din cel brut. Regresia e prinsă de
`server/lib/par/__tests__/postSignatureEdit.test.ts` („un câmp pe care zod-ul îl completează singur
cu null NU blochează completarea").

## Unde se verifică

- `server/lib/par/__tests__/postSignatureEdit.test.ts` — lista albă + cine are voie (12 cazuri).
- `scripts/e2e-par-post-signature.mjs` — 14 verificări pe API real, inclusiv cea care contează cel
  mai mult: **completare → re-aprobarea depășirii întoarce 200**, nu 409.
- `src/pages/par/__tests__/ParDetail.financeAmend.test.tsx` — creionul apare doar pentru finanțe,
  după semnare, iar la server pleacă DOAR câmpul completat.
- `server/lib/par/__tests__/parFormPdf.amendments.test.ts` — nota de pe hârtie.
