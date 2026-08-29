---
title: Jurnalul de audit e un ecran de produs, nu un log — se traduce la afișare
problem_type: ux / observabilitate
module: PAR (ParTimeline, par_audit)
tags: [audit, jurnal, wording, romana, json-pe-ecran]
symptoms: "«Updated fields: payeeType», {\"attachmentId\":\"0973c7b7-…\",\"checks\":[…]}, uuid-uri și sume în bani, direct pe pagina de detaliu"
severity: medium
date: 2026-08-29
---

## Simptom

„Jurnal activitate" de pe dosarul PAR afișa exact ce scrisese serverul în `par_audit`:

```
Edited · Updated fields: payeeType
  Changes  payeeType: {"from":null,"to":"juridic"}
document reconciliation match
  {"attachmentId":"0973c7b7-9467-4854-aaf7-dcc7e1573e60","fileName":"68339_CA_ATIC_25Aug26.pdf",
   "warnings":0,"checks":[{"field":"sumă","expected":2340200,"found":null,"matches":null}, …]}
```

Și de două ori la rând, identic, pentru că verificarea actului se reluase.

## Cauza reală

`detail` din `par_audit` are două meniri care au fost confundate: e **dovadă** (pentru un audit,
o dispută, o reconstituire) și e **poveste** (pentru omul care deschide dosarul azi). Serverul îl
scrie ca dovadă — engleză, id-uri, hash-uri, sume în unități minore, JSON — iar componenta îl
turna pe ecran ca atare. Un `JSON.stringify` ca „afișare" nu e o decizie de design; e absența ei.

## Regula

> Rândul de audit se **scrie** tehnic și se **citește** omenește. Traducerea stă la afișare
> (`src/lib/par/timelineHumanize.ts`), nu în baza de date: istoricul deja scris rămâne neatins,
> iar textele vechi devin citibile retroactiv. Pe ecran nu ajung niciodată uuid-uri, hash-uri,
> „cents" sau acolade; sumele se scriu ca bani, câmpurile cu numele lor din formular, iar
> evenimentele identice consecutive se strâng într-un rând cu „de N ori".

Când adaugi un `writeAudit({ event, detail })` nou, adaugă în aceeași schimbare titlul în
`EVENT_TITLES` și — dacă `detail` nu e deja o frază în română — regula lui în `RULES`.
Un eveniment necunoscut nu strică pagina (titlul se deduce), dar detaliul rămâne în engleză.

## Ce blochează regresia

- `src/lib/par/__tests__/timelineHumanize.test.ts` — 34 de cazuri pornite din textele pe care le
  scrie CHIAR serverul (`grep -n "detail:" server/routes/par*.ts`), plus testul negativ: niciun
  uuid, hash sau „cents" în rezultat.
- `scripts/e2e-par-timeline-human.mjs` — deschide dosarul în browser real, **apasă** butonul
  „Jurnal activitate" și citește panoul randat: 8 reguli negative (uuid, JSON, „Updated fields",
  „Step N approved", …) și pozitivul „titlurile sunt cuvinte, nu nume de eveniment". Rulează
  automat din poarta zonei PAR (`npm run e2e:all`).

Testul negativ a fost verificat că mușcă: aceleași reguli, aplicate pe textul de dinainte de
reparație, pică pe toate patru clasele. O verificare care nu poate pica nu e o verificare.
