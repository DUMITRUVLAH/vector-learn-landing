---
title: Inboxul de aprobare listează propria cerere a aprobatorului, cu buton „Aprobă" care dă 403
problem_type: security_issue
module: par
tags: [par, inbox, segregarea-atribuțiilor, self-approval, 403, promisiune-falsă]
symptoms: Un aprobator care depune o cerere o vede în „Inbox aprobare"; clic pe Aprobă → 403 „cannot approve your own PAR"
severity: P2
date: 2026-08-26
---

## Symptom
Un utilizator cu rol de aprobator care depune propria cerere de plată o găsea în „Inbox aprobare"
(coada „cereri care așteaptă decizia dvs."), cu butoanele Aprobă / Respinge / Cere modificări lângă
ea. Pagina de detaliu se comporta corect — ascundea butoanele și explica „Nu îți poți aproba propria
cerere (separarea atribuțiilor)" — dar inboxul o oferea, iar clicul se termina cu 403.

## Root cause
Segregarea atribuțiilor (PARQA-003) e verificată în `approveParStep`, ÎNAINTE de potrivirea pașilor.
Filtrul inboxului (`GET /api/par/inbox`) reproducea doar regula „e pasul meu?" (`stepMatchesViewer`),
nu și gardul de auto-aprobare — deși comentariul de deasupra lui promitea explicit „Nothing lands in
the inbox that approve 403s on". Un pas bazat pe rol se potrivește cu orice aprobator, inclusiv cu
autorul cererii.

## Fix
Filtrul inboxului sare peste cererile al căror `requestedByUserId` e chiar utilizatorul curent
(`server/routes/parApprovals.ts`, lângă verificarea de apartenență la proiect/plătitor).

## How to avoid next time
Când o listă „lucruri de făcut" e construită din altă interogare decât acțiunea pe care o oferă,
cele două pot diverge tăcut: lista promite, acțiunea refuză. Testul corect nu e „butonul apare", ci
**invariantul**: tot ce e în inbox trebuie să fie acceptat de endpoint-ul de decizie. Locked de
`scripts/e2e-par-blind-150.mjs` („an approver's OWN request is not queued…" + perechea ei pozitivă)
și de parcursul 11 din `scripts/e2e-par-journeys.mjs`.
