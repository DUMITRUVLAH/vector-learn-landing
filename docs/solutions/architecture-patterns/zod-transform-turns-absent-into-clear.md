---
title: `.optional().transform()` rulează și pe câmpul LIPSĂ — un PATCH parțial devine „șterge"
problem_type: data-loss
module: PAR (PATCH /api/par/:id — payee_name, payee_bank)
tags: [zod, patch, transform, data-loss, par]
symptoms: "Ciorna salvată se redeschide fără numele și banca beneficiarului"
severity: high
date: 2026-09-23
---

## Simptom

Găsit la verificarea în browser a patentei: după „Salvează ciornă", ciorna redeschisă nu mai avea
beneficiar. Numele și banca dispăreau la fiecare salvare; IBAN-ul și codul fiscal rămâneau.

## Cauza

Pe 16.09.2026 (e9176253) `payee_name` și `payee_bank` au primit o curățare la intrare:

```ts
payee_name: z.string().max(300).optional().nullable().transform((v) => cleanPastedIdentityField(v, 300)),
```

`.transform()` se aplică și când câmpul LIPSEȘTE din corp: `cleanPastedIdentityField(undefined)`
întoarce `null`, iar ruta citește `body.payee_name !== undefined` → scrie `payeeName = null`.
Formularul trimite un `PATCH {}` după antet la fiecare „Salvează ciornă" / „Vezi cum arată" — deci
fiecare salvare ștergea beneficiarul. Testele existente trimiteau mereu corpul complet.

## Rezolvarea

```ts
payee_name: z.string().max(300).optional().nullable()
  .transform((v) => (v === undefined ? undefined : cleanPastedIdentityField(v, 300))),
```

## Regula

**Într-o schemă de PATCH, orice `.transform()` pe un câmp opțional trebuie să lase `undefined`
neatins.** „Lipsă" înseamnă „nu schimba", `null` înseamnă „șterge" — un transform care le confundă
transformă orice salvare parțială într-o ștergere. Testul unei rute de PATCH include un `PATCH {}`
urmat de citirea rândului.

Test: `server/__tests__/par-payee-patent.routes.test.ts` → „PATCH parțial nu șterge beneficiarul";
e2e: `scripts/e2e-par-patenta.mjs` → „PATCH {} lasă numele beneficiarului neatins".
