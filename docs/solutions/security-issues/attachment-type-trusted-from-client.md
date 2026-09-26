---
category: security-issues
date: 2026-09-26
symptom: "Revizuirea adversarială a managerului de task-uri: un atașament de comentariu declarat `text/html` se deschidea ca pagină pe domeniul aplicației, cu sesiunea celui care îl deschidea"
files:
  - server/lib/tasks/attachments.ts
  - server/routes/tasks.ts
  - server/lib/tasks/service.ts
  - server/__tests__/tasks.routes.test.ts
---

# Tipul unui fișier se decide pe server, la servire — nu se crede din metadatele salvate

## Mecanismul

Atașamentele comentariilor ajung la server pe două drumuri:

1. `POST /tasks/:id/attachments/finalize` descarcă obiectul, îi verifică semnătura (magic bytes)
   față de tipul declarat și șterge obiectul la nepotrivire;
2. `POST /tasks/:id/comments` primește lista de atașamente (`path`, `name`, `type`, `size`) în corp
   și o salvează — fără să vadă octeții.

Al doilea drum verifica doar forma căii și mărimea. `type` putea fi orice șir, iar ruta de fișier
îl punea direct în `Content-Type`, cu `Content-Disposition: inline`. Atacul verificat: semnezi o
urcare, pui HTML + JS în Storage, sari peste finalize și declari `text/html` în comentariu. Cine
deschide atașamentul rulează scriptul pe `/api/*` — aceeași origine cu aplicația — deci cu
cookie-ul lui de sesiune. `X-Content-Type-Options: nosniff` nu ajută: serverul chiar declara
`text/html`.

Tot acolo, `finalize` accepta orice cale din folderul workspace-ului, iar ramura „tip nepotrivit →
șterge obiectul" ștergea fișierul oricui, dacă îi știai calea.

## Reparația

- **Calea poartă id-ul task-ului** (`<tenant>/<ts>-<aleator>-<taskId>-<nume>`, verificată ancorat la
  început), iar finalize și comentariul acceptă doar căi semnate pentru ACEL task. Un fișier deja
  atașat unui comentariu nu mai poate fi șters prin finalize (409).
- **Tipul e verificat pe ambele drumuri** față de aceeași listă (`ALLOWED_ATTACHMENT_TYPES`).
- **La servire tipul salvat nu e crezut** (`servingFor`): `inline` doar pentru imagini/PDF/text din
  listă ale căror octeți confirmă tipul; orice altceva pleacă `attachment` +
  `application/octet-stream`, cu `Content-Security-Policy: sandbox`. PDF-ul autentic nu primește
  `sandbox`, fiindcă vizualizatorul de PDF al Chrome nu pornește într-un document sandboxat.

## Regula (clasa de bug)

O valoare care decide cum se comportă browserul (tipul unui fișier servit, o cale, un URL de
redirecționare) se validează pe **fiecare** drum de scriere și se re-decide la citire. Dacă un
drum verifică și altul doar salvează, verificarea nu există. Testele din `describe("revizuirea
adversarială")` (ADV-01, ADV-11) atacă exact drumul care sărea verificarea și pică pe codul vechi.
