---
title: "Un 404 de securitate trebuie să spună DE CE, nu doar `not_found`"
problem_type: architecture-pattern
module: PAR
tags: [par, multi-tenant, 404, mesaje-de-eroare, workspace, notificari, email]
symptoms: "Linkul din emailul de notificare deschide pagina cererii și afișează doar «not_found»; cererea există în realitate"
severity: high
date: 2026-08-28
---

## Incidentul

Emailul `[PAR] PAR-2026-0003 — ready for payment` conținea
`https://finflow.best/#/business/par/675c33af-…`. Deschis din browser, ecranul arăta un banner roșu
cu textul **`not_found`** și nimic altceva.

Cererea exista. Drepturile erau în regulă. Sesiunea era logată în **alt workspace**
(`vlah.business@gmail.com` → workspace „Vlah Dumitru"), iar cererea aparținea workspace-ului „ATIC".
`GET /api/par/:id` citește cu `and(eq(id), eq(tenantId))`, deci pentru sesiunea greșită cererea
pur și simplu nu există → 404.

Cauza secundară, la fel de reală: `vlahdumitru@gmail.com` are **două conturi**, în două workspace-uri,
iar `POST /api/business/auth/login` face `findFirst(eq(users.email, …))` fără `ORDER BY` și fără
selector de workspace — deci contul din ATIC e practic inaccesibil prin parolă. (Rămas de reparat
separat: un pas de alegere a workspace-ului la autentificare.)

## Regula

**Un cod de eroare nu e un mesaj.** Când o rută răspunde 404 din motive de izolare (tenant, arie de
acces, entitlement), statusul rămâne 404 — dar corpul trebuie să spună *de ce*, iar ecranul trebuie
să-l traducă în cuvinte, cu contul curent inclus:

> „Cererea există, dar într-un alt workspace decât cel în care ești autentificat. Ești autentificat
> ca vlah.business@gmail.com, în workspace-ul «Vlah Dumitru»."

Fără asta, singurul om care poate diagnostica ecranul e cel cu acces la baza de date.

## Cum e implementat aici

- `server/lib/par/accessReason.ts` — construiește motivul: `other_workspace`,
  `other_workspace_no_account`, `unknown_id`, `not_requestor`, `draft_private`, `out_of_scope`,
  `module_disabled` + `currentEmail` / `currentWorkspace`.
- `server/routes/par.ts` (`GET /:id`) — fiecare ieșire rămâne **404 `not_found`** (contractul vechi),
  dar cară și `reason`.
- `src/lib/api.ts` — `ApiError.body` păstrează corpul JSON brut; înainte se pierdea tot în afară de cod.
- `src/lib/par/accessMessage.ts` + `ParDetail.tsx` — traducerea în propoziție + linkul „Intră cu alt cont".
- `server/services/par/notify.ts` — fiecare email PAR poartă acum „Workspace: X · Cont destinatar: y@z",
  ca destinatarul cu mai multe conturi să știe din start de unde să deschidă linkul.

## Ce divulgăm și ce nu

| Situație | Ce spunem |
|---|---|
| Cererea e în alt workspace, ai cont acolo cu **același email** | numele workspace-ului („ATIC") |
| Cererea e în alt workspace, emailul curent **nu are cont** acolo | doar „alt workspace", fără nume |
| Id-ul nu există nicăieri | „nu există" |

Confirmarea existenței unui uuid v4 primit prin email nu divulgă nimic (e neghicibil); numele
organizației, în schimb, se dă doar cuiva care are cont acolo.

## Testele care blochează regresia

- `server/__tests__/par-access-reason.routes.test.ts` — rută reală pe PGlite, 10 scenarii, câte unul
  per motiv, plus verificarea că **statusul rămâne 404** pe toate și că numele workspace-ului nu
  scapă către un email fără cont acolo.
- `src/pages/par/__tests__/ParDetail.accessError.test.tsx` — bannerul afișează explicația și contul,
  nu textul `not_found`.
- `src/lib/par/__tests__/accessMessage.test.ts` — fiecare motiv produce o propoziție, iar un server
  vechi (fără `reason`) cade pe mesajul generic, fără crash.
